//! The v2 upgrade path, on CKB-VM.
//!
//! The farm binary is unchanged; what changed is the deployment: a locked
//! type-id validator cell, and a code cell (deployer-locked, type script =
//! validator + pinned type id) that farm cells reference with hash_type
//! "type". These tests check the validator's guarantees and that a live farm
//! keeps verifying across an in-place code swap.

use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_hash::new_blake2b,
    ckb_types::{
        bytes::Bytes,
        core::{Capacity, DepType, ScriptHashType, TransactionBuilder, TransactionView},
        packed::{CellDep, CellInput, CellOutput, OutPoint, Script},
        prelude::*,
    },
    context::Context,
};
use farm_core::{Farm, MAX_STATE_LEN};
use farm_tests::{act, code, encode, name, UNIT};

const MAX_CYCLES: u64 = 70_000_000;
const E_TYPE_ID: i8 = 43;

fn read_build(file: &str) -> Bytes {
    let path = format!("{}/../build/{file}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read(&path).unwrap_or_else(|e| panic!("{path}: {e}. Run scripts/build-contract.sh")).into()
}

fn type_id_of(first_input: &CellInput, output_index: u64) -> [u8; 32] {
    let mut hasher = new_blake2b();
    hasher.update(first_input.as_slice());
    hasher.update(&output_index.to_le_bytes());
    let mut id = [0u8; 32];
    hasher.finalize(&mut id);
    id
}

/// The two-cell deployment, as scripts/deploy.ts lays it out.
struct V2 {
    ctx: Context,
    validator_code: OutPoint,
    /// The code cell's type script: validator (data2) + the pinned type id.
    code_type: Script,
    code_point: OutPoint,
    code_data: Bytes,
    deployer: Script,
}

impl V2 {
    fn new() -> V2 {
        let mut ctx = Context::default();
        let validator_bin = read_build("type-id");
        let farm_bin = read_build("farm");
        let validator_code = ctx.deploy_cell(validator_bin.clone());
        let wallet_code = ctx.deploy_cell(ALWAYS_SUCCESS.clone());
        let deployer = ctx.build_script(&wallet_code, vec![7u8].into()).unwrap();
        let payer = ctx.build_script(&wallet_code, vec![9u8].into()).unwrap();

        // Fund the birth transaction; the type id comes from its first input.
        let funding = CellOutput::new_builder()
            .capacity(Capacity::bytes(200_000).unwrap().pack())
            .lock(payer.clone())
            .build();
        let funding_point = ctx.create_cell(funding.clone(), Bytes::new());
        let first_input = CellInput::new(funding_point, 0);
        let id = type_id_of(&first_input, 0);

        let validator_data_hash = CellOutput::calc_data_hash(&validator_bin);
        let code_type = Script::new_builder()
            .code_hash(validator_data_hash)
            .hash_type(ckb_testtool::ckb_types::packed::Byte::new(ScriptHashType::Data2 as u8))
            .args(id.to_vec().pack())
            .build();
        let code_cell = CellOutput::new_builder()
            .capacity(Capacity::bytes(farm_bin.len() + 1_000).unwrap().pack())
            .lock(deployer.clone())
            .type_(Some(code_type.clone()).pack())
            .build();
        let change = funding
            .as_builder()
            .capacity(Capacity::bytes(200_000 - farm_bin.len() - 1_000).unwrap().pack())
            .build();
        let tx = TransactionBuilder::default()
            .input(first_input)
            .output(code_cell.clone())
            .output_data(farm_bin.clone().pack())
            .output(change)
            .output_data(Bytes::new().pack())
            .cell_dep(CellDep::new_builder().out_point(validator_code.clone()).dep_type(ckb_testtool::ckb_types::packed::Byte::new(DepType::Code as u8)).build())
            .build();
        let tx = ctx.complete_tx(tx);
        ctx.verify_tx(&tx.clone(), MAX_CYCLES).expect("the code cell is born");
        let code_point = OutPoint::new(tx.hash(), 0);
        ctx.create_cell_with_out_point(code_point.clone(), code_cell, farm_bin.clone());
        V2 { ctx, validator_code, code_type, code_point, code_data: farm_bin, deployer }
    }

    /// What farm cells put in code_hash: the hash of the code cell's type script.
    fn code_script_hash(&self) -> [u8; 32] {
        self.code_type.calc_script_hash().unpack()
    }

    fn farm_lock(&self) -> Script {
        Script::new_builder()
            .code_hash(self.code_script_hash().pack())
            .hash_type(ckb_testtool::ckb_types::packed::Byte::new(ScriptHashType::Type as u8))
            .build()
    }

    fn farm_type(&self, id: &[u8; 32]) -> Script {
        let mut args = UNIT.to_le_bytes().to_vec();
        args.extend_from_slice(id);
        Script::new_builder()
            .code_hash(self.code_script_hash().pack())
            .hash_type(ckb_testtool::ckb_types::packed::Byte::new(ScriptHashType::Type as u8))
            .args(args.pack())
            .build()
    }

    /// Spend the code cell; the output is built by `shape` (the honest upgrade
    /// keeps lock and type, swaps the data).
    fn upgrade(&mut self, next: Bytes, shape: impl FnOnce(&CellOutput) -> CellOutput) -> TransactionView {
        let (current, _) = self.ctx.get_cell(&self.code_point).expect("code cell live");
        let tx = TransactionBuilder::default()
            .input(CellInput::new(self.code_point.clone(), 0))
            .output(shape(&current))
            .output_data(next.pack())
            .cell_dep(CellDep::new_builder().out_point(self.validator_code.clone()).dep_type(ckb_testtool::ckb_types::packed::Byte::new(DepType::Code as u8)).build())
            .build();
        self.ctx.complete_tx(tx)
    }

    fn commit_upgrade(&mut self, tx: &TransactionView, next: Bytes) {
        let point = OutPoint::new(tx.hash(), 0);
        let output = tx.output(0).unwrap();
        // The old code cell is spent.
        self.ctx.cells.remove(&self.code_point);
        self.ctx.create_cell_with_out_point(point.clone(), output, next.clone());
        // hash_type:type resolves through the type script hash, which is unchanged.
        self.code_point = point;
        self.code_data = next;
    }

    /// A farm cell in this world, owned by `player` (always-success wallet).
    fn place_farm(&mut self, player: u8, farm: &Farm, id: [u8; 32]) -> OutPoint {
        let owner: [u8; 32] = self.owner(player);
        let mut f = farm.clone();
        f.owner = owner;
        let state = encode(&f);
        let cell = CellOutput::new_builder()
            .capacity(Capacity::bytes(state.len() + 200).unwrap().pack())
            .lock(self.farm_lock())
            .type_(Some(self.farm_type(&id)).pack())
            .build();
        self.ctx.create_cell(cell, state.into())
    }

    fn owner(&mut self, player: u8) -> [u8; 32] {
        let wallet_code = self.ctx.deploy_cell(ALWAYS_SUCCESS.clone());
        self.ctx.build_script(&wallet_code, vec![player].into()).unwrap().calc_script_hash().unpack()
    }

    /// An owner transaction on the farm: buy one radish seed.
    fn buy_tx(&mut self, farm_point: &OutPoint, player: u8) -> TransactionView {
        let (farm_cell, farm_data) = self.ctx.get_cell(farm_point).unwrap();
        let farm = Farm::decode(&farm_data).unwrap();
        let actions = act::buy(1, 1);
        // Compute the expected output with the rules (same as the script will).
        let inputs = [farm_core::FarmInput {
            index: 0,
            id: {
                let args = farm_cell.type_().to_opt().unwrap().args().raw_data();
                let mut id = [0u8; 32];
                id.copy_from_slice(&args[4..]);
                id
            },
            state: &farm_data,
            block: None,
            actions: &actions,
        }];
        let outcome = farm_core::transition(&inputs, 0, farm_core::Clock { now: 0, unit: UNIT }).unwrap();
        let mut buf = [0u8; MAX_STATE_LEN];
        let len = outcome.farm.encode(&mut buf);
        let next_state = buf[..len].to_vec();
        let _ = farm;

        let wallet_code = self.ctx.deploy_cell(ALWAYS_SUCCESS.clone());
        let wallet = self.ctx.build_script(&wallet_code, vec![player].into()).unwrap();
        let wallet_cell = CellOutput::new_builder()
            .capacity(Capacity::bytes(1_000).unwrap().pack())
            .lock(wallet.clone())
            .build();
        let wallet_point = self.ctx.create_cell(wallet_cell.clone(), Bytes::new());

        let next_farm = farm_cell
            .as_builder()
            .capacity(Capacity::bytes(next_state.len() + 200).unwrap().pack())
            .build();
        let tx = TransactionBuilder::default()
            .input(CellInput::new(farm_point.clone(), 0))
            .input(CellInput::new(wallet_point, 0))
            .output(next_farm)
            .output_data(Bytes::from(next_state).pack())
            .output(wallet_cell.as_builder().capacity(Capacity::bytes(900).unwrap().pack()).build())
            .output_data(Bytes::new().pack())
            .witness(
                ckb_testtool::ckb_types::packed::WitnessArgs::new_builder()
                    .input_type(Some(Bytes::from(actions)).pack())
                    .build()
                    .as_bytes()
                    .pack(),
            )
            .witness(Bytes::new().pack())
            .cell_dep(CellDep::new_builder().out_point(self.code_point.clone()).dep_type(ckb_testtool::ckb_types::packed::Byte::new(DepType::Code as u8)).build())
            .build();
        self.ctx.complete_tx(tx)
    }
}

#[test]
fn the_code_cell_cannot_be_duplicated() {
    let mut v = V2::new();
    let (current, data) = v.ctx.get_cell(&v.code_point).unwrap();
    let tx = TransactionBuilder::default()
        .input(CellInput::new(v.code_point.clone(), 0))
        .output(current.clone())
        .output_data(data.clone().pack())
        .output(current)
        .output_data(data.pack())
        .cell_dep(CellDep::new_builder().out_point(v.validator_code.clone()).dep_type(ckb_testtool::ckb_types::packed::Byte::new(DepType::Code as u8)).build())
        .build();
    let tx = v.ctx.complete_tx(tx);
    assert_eq!(code(v.ctx.verify_tx(&tx, MAX_CYCLES)), E_TYPE_ID);
}

#[test]
fn the_type_id_cannot_drift_on_upgrade() {
    let mut v = V2::new();
    let mut args = v.code_type.args().raw_data().to_vec();
    args[0] ^= 1;
    let drifted = v.code_type.clone().as_builder().args(args.pack()).build();
    let tx = v.upgrade(read_build("farm"), |out| out.clone().as_builder().type_(Some(drifted).pack()).build());
    assert_eq!(code(v.ctx.verify_tx(&tx, MAX_CYCLES)), E_TYPE_ID);
}

#[test]
fn a_forged_second_world_is_refused() {
    // A different type id under the same validator: minting requires the id
    // to match hash(first input, index), so a made-up id fails.
    let mut v = V2::new();
    let forged = v.code_type.clone().as_builder().args([0xabu8; 32].to_vec().pack()).build();
    let bin = read_build("farm");
    let cell = CellOutput::new_builder()
        .capacity(Capacity::bytes(bin.len() + 1_000).unwrap().pack())
        .lock(v.deployer.clone())
        .type_(Some(forged).pack())
        .build();
    let wallet_code = v.ctx.deploy_cell(ALWAYS_SUCCESS.clone());
    let payer = v.ctx.build_script(&wallet_code, vec![9u8].into()).unwrap();
    let funding = CellOutput::new_builder()
        .capacity(Capacity::bytes(200_000).unwrap().pack())
        .lock(payer.clone())
        .build();
    let point = v.ctx.create_cell(funding.clone(), Bytes::new());
    let tx = TransactionBuilder::default()
        .input(CellInput::new(point, 0))
        .output(cell)
        .output_data(bin.pack())
        .output(funding.as_builder().capacity(Capacity::bytes(100_000).unwrap().pack()).build())
        .output_data(Bytes::new().pack())
        .cell_dep(CellDep::new_builder().out_point(v.validator_code.clone()).dep_type(ckb_testtool::ckb_types::packed::Byte::new(DepType::Code as u8)).build())
        .build();
    let tx = v.ctx.complete_tx(tx);
    assert_eq!(code(v.ctx.verify_tx(&tx, MAX_CYCLES)), E_TYPE_ID);
}

#[test]
fn upgrade_swaps_code_and_farms_keep_working() {
    let mut v = V2::new();
    let farm = Farm::new([0; 32], name(" survivor "));
    let farm_point = v.place_farm(1, &farm, [0x11; 32]);

    // Before the upgrade: an honest owner action verifies.
    let tx = v.buy_tx(&farm_point, 1);
    v.ctx.verify_tx(&tx.clone(), MAX_CYCLES).expect("farm works before upgrade");
    // Commit the buy so the farm cell moves.
    let new_point = OutPoint::new(tx.hash(), 0);
    let (cell, data) = (tx.output(0).unwrap(), tx.outputs_data().get(0).unwrap().raw_data());
    v.ctx.cells.remove(&farm_point);
    v.ctx.create_cell_with_out_point(new_point.clone(), cell, data);

    // The upgrade: same type script, new binary. Any bytes will do for the
    // validator (it only checks identity); use a *modified* farm binary so the
    // data hash actually changes. Append nothing — flip the last byte of a
    // copy is unsafe (it is code); instead deploy the validator binary as the
    // "new rules" stand-in for the identity test, then swap back.
    let next = read_build("type-id");
    assert_ne!(CellOutput::calc_data_hash(&next), CellOutput::calc_data_hash(&v.code_data));
    let tx = v.upgrade(next.clone(), |out| out.clone());
    let cycles = v.ctx.verify_tx(&tx.clone(), MAX_CYCLES).expect("honest upgrade");
    println!("upgrade tx cycles: {cycles}");
    v.commit_upgrade(&tx, next);

    // The farm's scripts still resolve (hash_type:type, same type script hash).
    let expected: [u8; 32] = v.code_type.calc_script_hash().unpack();
    assert_eq!(v.code_script_hash(), expected);
    // NOTE: the code cell now holds the validator binary, so farm verification
    // would run the wrong code — that is exactly the deployer's power. Swap
    // the real farm binary back and the farm verifies again.
    let farm_bin = read_build("farm");
    let tx = v.upgrade(farm_bin.clone(), |out| out.clone());
    v.ctx.verify_tx(&tx.clone(), MAX_CYCLES).expect("swap back");
    v.commit_upgrade(&tx, farm_bin);

    let tx = v.buy_tx(&new_point, 1);
    v.ctx.verify_tx(&tx, MAX_CYCLES).expect("farm works after upgrade, same cell, same type id");
}

#[test]
fn burning_the_code_cell_is_allowed_and_strands_farms() {
    let mut v = V2::new();
    let farm = Farm::new([0; 32], name("stranded"));
    let farm_point = v.place_farm(1, &farm, [0x22; 32]);

    // The deployer burns the code cell: the validator allows it (type id may
    // be burned), the deployer's lock opens.
    let (current, _) = v.ctx.get_cell(&v.code_point).unwrap();
    let tx = TransactionBuilder::default()
        .input(CellInput::new(v.code_point.clone(), 0))
        .output(current.as_builder().type_(None::<Script>.pack()).lock(v.deployer.clone()).build())
        .output_data(Bytes::new().pack())
        .cell_dep(CellDep::new_builder().out_point(v.validator_code.clone()).dep_type(ckb_testtool::ckb_types::packed::Byte::new(DepType::Code as u8)).build())
        .build();
    let tx = v.ctx.complete_tx(tx);
    v.ctx.verify_tx(&tx, MAX_CYCLES).expect("the validator allows burning");
    v.ctx.cells.remove(&v.code_point);

    // Now the farm cannot move: its lock/type point at a type script hash no
    // live cell carries. The harness panics while resolving the dead cell as
    // a cell dep; a real node rejects the transaction for the same reason
    // (unresolvable cell dep / script). Either way the farm is frozen.
    let hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    let stranded = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let tx = v.buy_tx(&farm_point, 1);
        v.ctx.verify_tx(&tx, MAX_CYCLES)
    }));
    std::panic::set_hook(hook);
    assert!(
        matches!(stranded, Err(_) | Ok(Err(_))),
        "the farm must not verify once the code cell is burned"
    );
}
