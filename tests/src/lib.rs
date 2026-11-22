//! A tiny chain to run the farm script on.
//!
//! Players are numbered. A player's wallet is an always-success lock with the
//! number as args, so "player N signed" is "the transaction has an input with
//! player N's lock", which is exactly what the farm script looks for.

use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_error::Error as CkbError,
    ckb_hash::new_blake2b,
    ckb_types::{
        bytes::Bytes,
        core::{Capacity, EpochNumberWithFraction, HeaderBuilder, TransactionBuilder, TransactionView},
        packed::{CellInput, CellOutput, OutPoint, Script, WitnessArgs},
        prelude::*,
    },
    context::Context,
};
use farm_core::{transition, BlockRef, Clock, Farm, FarmInput, MAX_STATE_LEN};

pub const MAX_CYCLES: u64 = 70_000_000;
/// A game hour in the tests, in seconds.
pub const UNIT: u32 = 60;
/// Where the tests start counting time (seconds).
pub const T0: u32 = 1_800_000_000;
const WALLET_CKB: u64 = 1_000;
/// What a signer pays per transaction: covers fees and a growing farm cell.
const SPEND_CKB: u64 = 100;
/// What closing a farm costs its owner, in shannons: a plain fee.
const CLOSE_FEE: u64 = 10_000;

pub fn encode(farm: &Farm) -> Vec<u8> {
    let mut out = [0u8; MAX_STATE_LEN];
    let n = farm.encode(&mut out);
    out[..n].to_vec()
}

pub fn name(s: &str) -> [u8; farm_core::NAME_LEN] {
    let mut out = [0u8; farm_core::NAME_LEN];
    out[..s.len()].copy_from_slice(s.as_bytes());
    out
}

/// A live farm cell.
#[derive(Debug, Clone)]
pub struct FarmCell {
    pub out_point: OutPoint,
    pub id: [u8; 32],
    pub state: Vec<u8>,
    pub block: Option<BlockRef>,
    pub capacity: u64,
    /// The game hour of the farm's world, in seconds.
    pub unit: u32,
}

impl FarmCell {
    pub fn farm(&self) -> Farm {
        Farm::decode(&self.state).expect("farm state")
    }
}

/// What a test wants a transaction to look like. `build` fills in the honest
/// version; a test then bends it before `verify`.
pub struct Draft {
    pub farms: Vec<(FarmCell, Vec<u8>)>,
    /// Players whose wallet cell is among the inputs.
    pub signers: Vec<u8>,
    /// The newest header dep, if any.
    pub now: Option<u32>,
    /// Leave out the header deps of the farm cells' own blocks.
    pub skip_farm_headers: bool,
    /// Farm outputs: `(state, capacity)`, same order as `farms`. `None` closes
    /// the farm.
    pub outputs: Vec<Option<(Vec<u8>, u64)>>,
}

pub struct World {
    pub ctx: Context,
    farm_code: OutPoint,
    wallet_code: OutPoint,
    blocks: u64,
}

impl Default for World {
    fn default() -> Self {
        Self::new()
    }
}

impl World {
    pub fn new() -> World {
        let mut ctx = Context::default();
        let path = std::env::var("FARM_BINARY")
            .unwrap_or_else(|_| format!("{}/../build/farm", env!("CARGO_MANIFEST_DIR")));
        let binary = std::fs::read(&path)
            .unwrap_or_else(|e| panic!("{path}: {e}. Build it with scripts/build-contract.sh"));
        let farm_code = ctx.deploy_cell(binary.into());
        let wallet_code = ctx.deploy_cell(ALWAYS_SUCCESS.clone());
        World { ctx, farm_code, wallet_code, blocks: 0 }
    }

    pub fn farm_lock(&mut self) -> Script {
        self.ctx.build_script(&self.farm_code, Bytes::new()).expect("farm lock")
    }

    pub fn farm_type(&mut self, id: &[u8; 32], unit: u32) -> Script {
        let mut args = unit.to_le_bytes().to_vec();
        args.extend_from_slice(id);
        self.ctx.build_script(&self.farm_code, args.into()).expect("farm type")
    }

    pub fn wallet(&mut self, player: u8) -> Script {
        self.ctx.build_script(&self.wallet_code, vec![player].into()).expect("wallet lock")
    }

    /// The owner id of a player: the hash of their wallet lock.
    pub fn owner(&mut self, player: u8) -> [u8; 32] {
        self.wallet(player).calc_script_hash().unpack()
    }

    /// A block with the given timestamp (seconds).
    pub fn block(&mut self, timestamp: u32) -> BlockRef {
        self.blocks += 1;
        let header = HeaderBuilder::default()
            .number(self.blocks)
            .epoch(EpochNumberWithFraction::new(1, self.blocks, 1_800))
            .timestamp(timestamp as u64 * 1000 + 123)
            .build();
        let hash = header.hash().unpack();
        self.ctx.insert_header(header);
        BlockRef { timestamp, hash }
    }

    fn farm_output(&mut self, id: &[u8; 32], unit: u32, capacity: u64) -> CellOutput {
        let lock = self.farm_lock();
        let ty = self.farm_type(id, unit);
        CellOutput::new_builder()
            .capacity(capacity)
            .lock(lock)
            .type_(Some(ty).pack())
            .build()
    }

    /// Capacity a farm cell needs for this state, in shannons.
    pub fn farm_capacity(&mut self, state: &[u8]) -> u64 {
        let cell = self.farm_output(&[0; 32], UNIT, 0);
        cell.occupied_capacity(Capacity::bytes(state.len()).unwrap()).unwrap().as_u64()
    }

    /// Puts a farm on the chain as if an earlier transaction had made it,
    /// committed in a block at `at` (if given).
    pub fn place(&mut self, id: u8, farm: &Farm, at: Option<u32>) -> FarmCell {
        self.place_with(id, farm, at, 0)
    }

    /// Like `place`, with `extra` shannons more than the cell needs.
    pub fn place_with(&mut self, id: u8, farm: &Farm, at: Option<u32>, extra: u64) -> FarmCell {
        self.place_in(id, farm, at, extra, UNIT)
    }

    /// Like `place_with`, in the world with this game hour.
    pub fn place_in(&mut self, id: u8, farm: &Farm, at: Option<u32>, extra: u64, unit: u32) -> FarmCell {
        let id = [id; 32];
        let state = encode(farm);
        let capacity = self.farm_capacity(&state) + extra;
        let output = self.farm_output(&id, unit, capacity);
        let out_point = self.ctx.create_cell(output, state.clone().into());
        let block = at.map(|at| self.block(at));
        if let Some(block) = &block {
            self.ctx.link_cell_with_block(out_point.clone(), block.hash.pack(), 0);
        }
        FarmCell { out_point, id, state, block, capacity, unit }
    }

    /// The honest transaction for these farms and action lists.
    pub fn draft(
        &mut self,
        farms: &[(&FarmCell, &[u8])],
        signers: &[u8],
        now: Option<u32>,
    ) -> Result<Draft, farm_core::Error> {
        let inputs: Vec<FarmInput> = farms
            .iter()
            .enumerate()
            .map(|(i, (cell, actions))| FarmInput {
                index: i as u8,
                id: cell.id,
                state: &cell.state,
                block: cell.block,
                actions,
            })
            .collect();
        let clock = Clock { now: proven_time(farms, now), unit: UNIT };
        let mut outputs = Vec::new();
        for me in 0..inputs.len() {
            let state = encode(&transition(&inputs, me, clock)?.farm);
            let capacity = farms[me].0.capacity.max(self.farm_capacity(&state));
            outputs.push(Some((state, capacity)));
        }
        Ok(Draft {
            farms: farms.iter().map(|(cell, actions)| ((*cell).clone(), actions.to_vec())).collect(),
            signers: signers.to_vec(),
            now,
            skip_farm_headers: false,
            outputs,
        })
    }

    /// Checks that the rules refuse this, and that the script refuses it for
    /// the same reason. The farms the rules have no quarrel with get their
    /// honest output, the others are left as they were. Returns the reason.
    pub fn refused(
        &mut self,
        farms: &[(&FarmCell, &[u8])],
        signers: &[u8],
        now: Option<u32>,
    ) -> farm_core::Error {
        let reason = match self.draft(farms, signers, now) {
            Ok(_) => panic!("the rules should refuse this"),
            Err(reason) => reason,
        };
        let inputs: Vec<FarmInput> = farms
            .iter()
            .enumerate()
            .map(|(i, (cell, actions))| FarmInput {
                index: i as u8,
                id: cell.id,
                state: &cell.state,
                block: cell.block,
                actions,
            })
            .collect();
        let clock = Clock { now: proven_time(farms, now), unit: UNIT };
        let mut outputs = Vec::new();
        for (me, (cell, _)) in farms.iter().enumerate() {
            outputs.push(Some(match transition(&inputs, me, clock) {
                Ok(outcome) => {
                    let state = encode(&outcome.farm);
                    let capacity = cell.capacity.max(self.farm_capacity(&state));
                    (state, capacity)
                }
                Err(e) => {
                    assert_eq!(e, reason);
                    (cell.state.clone(), cell.capacity)
                }
            }));
        }
        let forged = Draft {
            farms: farms.iter().map(|(cell, actions)| ((*cell).clone(), actions.to_vec())).collect(),
            signers: signers.to_vec(),
            now,
            skip_farm_headers: false,
            outputs,
        };
        assert_eq!(self.reject(&forged), reason as i8);
        reason
    }

    /// The exit code the script rejects this draft with.
    pub fn reject(&mut self, draft: &Draft) -> i8 {
        let tx = self.build(draft);
        code(self.verify(&tx))
    }

    pub fn build(&mut self, draft: &Draft) -> TransactionView {
        let mut tx = TransactionBuilder::default();
        for (cell, actions) in &draft.farms {
            tx = tx.input(CellInput::new(cell.out_point.clone(), 0));
            let witness = if actions.is_empty() {
                Bytes::new()
            } else {
                WitnessArgs::new_builder()
                    .input_type(Some(Bytes::from(actions.clone())).pack())
                    .build()
                    .as_bytes()
            };
            tx = tx.witness(witness.pack());
            if let (Some(block), false) = (&cell.block, draft.skip_farm_headers) {
                tx = tx.header_dep(block.hash.pack());
            }
        }
        for ((cell, _), output) in draft.farms.iter().zip(&draft.outputs) {
            if let Some((state, capacity)) = output {
                tx = tx
                    .output(self.farm_output(&cell.id, cell.unit, *capacity))
                    .output_data(Bytes::from(state.clone()).pack());
            } else {
                // Closing: the deposit flows home to the farm's owner.
                let owner = cell.farm().owner;
                if let Some(player) = draft.signers.iter().copied().find(|&p| self.owner(p) == owner) {
                    let refund = CellOutput::new_builder()
                        .capacity(Capacity::shannons(cell.capacity).pack())
                        .lock(self.wallet(player))
                        .build();
                    tx = tx.output(refund).output_data(Bytes::new().pack());
                }
            }
        }
        // Whoever closes a farm gets the deposit back in full but for the fee:
        // the script holds a close to that.
        let mut closers: Vec<u8> = Vec::new();
        for ((cell, _), output) in draft.farms.iter().zip(&draft.outputs) {
            if output.is_none() {
                let owner = cell.farm().owner;
                closers.extend(draft.signers.iter().copied().filter(|&p| self.owner(p) == owner));
            }
        }
        for &player in &draft.signers {
            let wallet = CellOutput::new_builder()
                .capacity(Capacity::bytes(WALLET_CKB as usize).unwrap().pack())
                .lock(self.wallet(player))
                .build();
            let out_point = self.ctx.create_cell(wallet.clone(), Bytes::new());
            let change = if closers.contains(&player) {
                Capacity::shannons(WALLET_CKB * 100_000_000 - CLOSE_FEE)
            } else {
                Capacity::bytes((WALLET_CKB - SPEND_CKB) as usize).unwrap()
            };
            tx = tx
                .input(CellInput::new(out_point, 0))
                .output(wallet.as_builder().capacity(change.pack()).build())
                .output_data(Bytes::new().pack());
        }
        if let Some(now) = draft.now {
            tx = tx.header_dep(self.block(now).hash.pack());
        }
        self.ctx.complete_tx(tx.build())
    }

    pub fn verify(&self, tx: &TransactionView) -> Result<u64, CkbError> {
        self.ctx.verify_tx(tx, MAX_CYCLES)
    }

    /// Builds and verifies the honest transaction and returns the farms as
    /// they are afterwards, committed in a block at `at`.
    pub fn play(
        &mut self,
        farms: &[(&FarmCell, &[u8])],
        signers: &[u8],
        now: Option<u32>,
        at: u32,
    ) -> Vec<FarmCell> {
        let draft = self.draft(farms, signers, now).expect("rules allow it");
        let tx = self.build(&draft);
        self.verify(&tx).unwrap_or_else(|e| panic!("script rejected an honest transaction: {e}"));
        self.commit(&draft, &tx, at)
    }

    /// The farm cells a verified transaction leaves behind.
    pub fn commit(&mut self, draft: &Draft, tx: &TransactionView, at: u32) -> Vec<FarmCell> {
        let block = self.block(at);
        let mut cells = Vec::new();
        let mut index = 0u32;
        for ((cell, _), output) in draft.farms.iter().zip(&draft.outputs) {
            let Some((state, capacity)) = output else { continue };
            let out_point = OutPoint::new(tx.hash(), index);
            let output = tx.output(index as usize).expect("farm output");
            self.ctx.create_cell_with_out_point(out_point.clone(), output, state.clone().into());
            self.ctx.link_cell_with_block(out_point.clone(), block.hash.pack(), 1);
            cells.push(FarmCell {
                out_point,
                id: cell.id,
                state: state.clone(),
                block: Some(block),
                capacity: *capacity,
                unit: cell.unit,
            });
            index += 1;
        }
        cells
    }

    /// A transaction that creates a farm for `player`, paid from their wallet.
    /// Returns it with the farm's type id.
    pub fn creation(&mut self, player: u8, state: Vec<u8>) -> (TransactionView, [u8; 32]) {
        let wallet = CellOutput::new_builder()
            .capacity(Capacity::bytes(WALLET_CKB as usize).unwrap().pack())
            .lock(self.wallet(player))
            .build();
        let input = CellInput::new(self.ctx.create_cell(wallet, Bytes::new()), 0);
        let mut hasher = new_blake2b();
        hasher.update(input.as_slice());
        hasher.update(&0u64.to_le_bytes());
        let mut id = [0u8; 32];
        hasher.finalize(&mut id);
        let capacity = self.farm_capacity(&state);
        let tx = TransactionBuilder::default()
            .input(input)
            .output(self.farm_output(&id, UNIT, capacity))
            .output_data(Bytes::from(state).pack())
            .build();
        (self.ctx.complete_tx(tx), id)
    }
}

/// The time a transaction proves: its newest header dep, and the blocks of the
/// farm cells are header deps too.
fn proven_time(farms: &[(&FarmCell, &[u8])], now: Option<u32>) -> u32 {
    farms
        .iter()
        .filter_map(|(cell, _)| cell.block.map(|block| block.timestamp))
        .chain(now)
        .max()
        .unwrap_or(0)
}

/// The exit code of the script that rejected a transaction.
pub fn code<T: std::fmt::Debug>(result: Result<T, CkbError>) -> i8 {
    let error = result.expect_err("the script should have rejected this").to_string();
    let at = error.find("error code ").unwrap_or_else(|| panic!("no script error in: {error}"));
    let digits: String = error[at + 11..].chars().take_while(|c| *c == '-' || c.is_ascii_digit()).collect();
    digits.parse().unwrap_or_else(|_| panic!("no script error code in: {error}"))
}

/// Action list builders.
pub mod act {
    use farm_core::*;

    pub fn buy(crop: u8, count: u16) -> Vec<u8> {
        let c = count.to_le_bytes();
        vec![OP_BUY_SEED, crop, c[0], c[1]]
    }
    pub fn plant(plot: u8, crop: u8) -> Vec<u8> {
        vec![OP_PLANT, plot, crop]
    }
    pub fn harvest(plot: u8) -> Vec<u8> {
        vec![OP_HARVEST, plot]
    }
    pub fn shovel(plot: u8) -> Vec<u8> {
        vec![OP_SHOVEL, plot]
    }
    pub fn sell(crop: u8, count: u16) -> Vec<u8> {
        let c = count.to_le_bytes();
        vec![OP_SELL, crop, c[0], c[1]]
    }
    pub fn expand() -> Vec<u8> {
        vec![OP_EXPAND]
    }
    pub fn feed_dog() -> Vec<u8> {
        vec![OP_FEED_DOG]
    }
    pub fn clear(plot: u8, kind: u8) -> Vec<u8> {
        vec![OP_CLEAR, plot, kind]
    }
    pub fn rename(name: [u8; NAME_LEN]) -> Vec<u8> {
        let mut v = vec![OP_RENAME];
        v.extend_from_slice(&name);
        v
    }
    pub fn help(actor: u8, plot: u8, kind: u8) -> Vec<u8> {
        vec![OP_HELP, actor, plot, kind]
    }
    pub fn mischief(actor: u8, plot: u8, kind: u8) -> Vec<u8> {
        vec![OP_MISCHIEF, actor, plot, kind]
    }
    pub fn steal(actor: u8, plot: u8) -> Vec<u8> {
        vec![OP_STEAL, actor, plot]
    }
}
