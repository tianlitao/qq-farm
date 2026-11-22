//! The farm script. One binary, used both as the lock and as the type script
//! of every farm cell.
//!
//! As a **type script** (args: the game hour in seconds as a little-endian u32,
//! then the 32-byte type id) it holds all the rules:
//!
//! * a farm is born in the one fixed starting state, with a unique id;
//! * every later spend must produce exactly the state `farm_core::transition`
//!   computes from the farm cells and action lists in the transaction;
//! * actions of the owner need an input locked by the owner; visitors need the
//!   same for their own farm;
//! * CKB can be added to a farm cell but never taken out, except by the owner
//!   closing the farm.
//!
//! As a **lock script** (no args) it lets anybody spend the cell, as long as
//! the cell carries the farm type script. That is what lets a neighbour drop
//! by. All farms that share a game hour form one world; farms of different
//! worlds do not see each other.

#![no_std]
#![no_main]

use alloc::vec::Vec;
use ckb_std::{
    ckb_constants::Source,
    ckb_types::{
        packed::{Script, WitnessArgsReader},
        prelude::*,
    },
    error::SysError,
    high_level::{
        load_cell_capacity, load_cell_data, load_cell_lock, load_cell_lock_hash, load_cell_type,
        load_cell_type_hash, load_header, load_script, load_witness, QueryIter,
    },
    type_id::check_type_id,
};
use farm_core::{transition, BlockRef, Clock, Farm, FarmInput, MAX_STATE_LEN, MAX_UNIT};

ckb_std::entry!(program_entry);
ckb_std::default_alloc!();

// 10..40 are the rule violations of farm_core::Error.
const E_SYSCALL: i8 = 40;
const E_ARGS: i8 = 41;
const E_NOT_A_FARM: i8 = 42;
const E_TYPE_ID: i8 = 43;
const E_LOCK: i8 = 44;
const E_CAPACITY: i8 = 45;
const E_NOT_OWNER: i8 = 46;
const E_WRONG_STATE: i8 = 47;
const E_BAD_NEW_FARM: i8 = 48;
const E_WITNESS: i8 = 49;
const E_TOO_MANY_INPUTS: i8 = 50;
const E_NOTHING_HAPPENED: i8 = 51;
const E_CLOSE_WITH_ACTIONS: i8 = 52;
const E_TIME: i8 = 53;

/// The most a closing transaction may keep back from the owner as its fee, in
/// shannons (1 CKB). Real fees are a few thousand shannons.
const CLOSE_FEE_ALLOWANCE: i128 = 100_000_000;

const UNIT_LEN: usize = 4;
const TYPE_ARGS_LEN: usize = UNIT_LEN + 32;

fn program_entry() -> i8 {
    match run() {
        Ok(()) => 0,
        Err(code) => code,
    }
}

fn sys(_: SysError) -> i8 {
    E_SYSCALL
}

fn run() -> Result<(), i8> {
    let script = load_script().map_err(sys)?;
    let args = script.args().raw_data();
    match args.len() {
        0 => check_lock(&script),
        TYPE_ARGS_LEN => check_type(&script, &args),
        _ => Err(E_ARGS),
    }
}

fn same_code(a: &Script, b: &Script) -> bool {
    a.code_hash().as_slice() == b.code_hash().as_slice()
        && a.hash_type().as_slice() == b.hash_type().as_slice()
}

/// Lock: every cell guarded by it must be a farm cell.
fn check_lock(me: &Script) -> Result<(), i8> {
    for ty in QueryIter::new(load_cell_type, Source::GroupInput) {
        match ty {
            Some(ty) if same_code(me, &ty) && ty.args().raw_data().len() == TYPE_ARGS_LEN => {}
            _ => return Err(E_NOT_A_FARM),
        }
    }
    Ok(())
}

fn present(source: Source) -> Result<bool, i8> {
    match load_cell_capacity(0, source) {
        Ok(_) => Ok(true),
        Err(SysError::IndexOutOfBound) => Ok(false),
        Err(_) => Err(E_SYSCALL),
    }
}

fn check_type(me: &Script, args: &[u8]) -> Result<(), i8> {
    // At most one cell of this farm on each side, and a fresh id at creation.
    check_type_id(UNIT_LEN, 32).map_err(|_| E_TYPE_ID)?;
    let unit = u32::from_le_bytes([args[0], args[1], args[2], args[3]]);
    if unit == 0 || unit > MAX_UNIT {
        return Err(E_ARGS);
    }
    match (present(Source::GroupInput)?, present(Source::GroupOutput)?) {
        (false, true) => create(me),
        (true, true) => update(me, args, unit),
        (true, false) => close(me),
        (false, false) => Err(E_SYSCALL),
    }
}

/// The output must be guarded by this very script, in its lock form.
fn check_output_lock(me: &Script) -> Result<(), i8> {
    let lock = load_cell_lock(0, Source::GroupOutput).map_err(sys)?;
    if !same_code(me, &lock) || !lock.args().raw_data().is_empty() {
        return Err(E_LOCK);
    }
    Ok(())
}

/// What the owner's lock has at stake in this transaction.
struct OwnerFlow {
    /// One of the inputs is locked by the owner. For a lock that wants a
    /// signature this is the owner's consent to the whole transaction.
    present: bool,
    /// Net capacity the owner SPENDS: owner-locked inputs minus owner-locked
    /// outputs.
    spent: i128,
}

/// Owner authorization needs the owner's input *and* a direction. Presence
/// alone would let anyone-can-pay locks (spendable without a signature as long
/// as capacity stays put) authorize actions the owner never saw; direction
/// alone would let a stranger authorize a close by sending the owner a tip.
///
/// * owner actions and creation: the owner must pay (spent > 0, which needs an
///   owner input);
/// * closing: an owner input, and the deposit flows home, see `close`.
fn owner_flow(owner: &[u8; 32]) -> Result<OwnerFlow, i8> {
    let mut flow = OwnerFlow { present: false, spent: 0 };
    for (index, hash) in QueryIter::new(load_cell_lock_hash, Source::Input).enumerate() {
        if &hash == owner {
            flow.present = true;
            flow.spent += load_cell_capacity(index, Source::Input).map_err(sys)? as i128;
        }
    }
    for (index, hash) in QueryIter::new(load_cell_lock_hash, Source::Output).enumerate() {
        if &hash == owner {
            flow.spent -= load_cell_capacity(index, Source::Output).map_err(sys)? as i128;
        }
    }
    Ok(flow)
}

/// The owner pays for this transaction: owner actions and creation.
fn owner_pays(owner: &[u8; 32]) -> Result<bool, i8> {
    let flow = owner_flow(owner)?;
    Ok(flow.present && flow.spent > 0)
}

/// Capacity of every farm of `owner` that this transaction closes: farm cells
/// among the inputs whose type script is on no output. Counting them together
/// keeps one refund from vouching for several closes.
fn closing_deposits(me: &Script, owner: &[u8; 32]) -> Result<i128, i8> {
    let mut total: i128 = 0;
    for (index, ty) in QueryIter::new(load_cell_type, Source::Input).enumerate() {
        let Some(ty) = ty else { continue };
        if !same_code(me, &ty) || ty.args().raw_data().len() != TYPE_ARGS_LEN {
            continue;
        }
        let data = load_cell_data(index, Source::Input).map_err(sys)?;
        if data.len() < 33 || &data[1..33] != owner {
            continue;
        }
        let hash = load_cell_type_hash(index, Source::Input).map_err(sys)?;
        let stays = QueryIter::new(load_cell_type_hash, Source::Output).any(|other| other == hash);
        if !stays {
            total += load_cell_capacity(index, Source::Input).map_err(sys)? as i128;
        }
    }
    Ok(total)
}

fn create(me: &Script) -> Result<(), i8> {
    check_output_lock(me)?;
    let data = load_cell_data(0, Source::GroupOutput).map_err(sys)?;
    let claimed = Farm::decode(&data).map_err(|_| E_BAD_NEW_FARM)?;
    // Owner and name are free, everything else is fixed.
    let mut fresh = [0u8; MAX_STATE_LEN];
    let len = Farm::new(claimed.owner, claimed.name).encode(&mut fresh);
    if data[..] != fresh[..len] {
        return Err(E_BAD_NEW_FARM);
    }
    // The owner must pay for their own farm. A gifted farm whose owner lock
    // never shows up could never be closed or spent — the capacity in it would
    // be stuck for ever.
    if !owner_pays(&claimed.owner)? {
        return Err(E_NOT_OWNER);
    }
    Ok(())
}

fn close(me: &Script) -> Result<(), i8> {
    let data = load_cell_data(0, Source::GroupInput).map_err(sys)?;
    let farm = Farm::decode(&data).map_err(|e| e as i8)?;
    // The other farms in the transaction replay this farm's action list, and
    // there is no output here to hold its effects.
    if !load_actions(0, Source::GroupInput)?.is_empty() {
        return Err(E_CLOSE_WITH_ACTIONS);
    }
    // The owner is behind this: one of their cells is spent. Without it a
    // stranger could close anybody's farm by sending the owner a tip.
    let flow = owner_flow(&farm.owner)?;
    if !flow.present {
        return Err(E_NOT_OWNER);
    }
    // And the deposit flows home, all of it but the fee. For a lock that wants
    // a signature the owner input already says so; this is what keeps a lock
    // that anybody may spend from handing the deposit to whoever asks.
    let gained = -flow.spent;
    if gained + CLOSE_FEE_ALLOWANCE < closing_deposits(me, &farm.owner)? {
        return Err(E_NOT_OWNER);
    }
    Ok(())
}

/// The action list of a farm cell: the `input_type` field of its witness.
fn load_actions(index: usize, source: Source) -> Result<Vec<u8>, i8> {
    let witness = match load_witness(index, source) {
        Ok(witness) => witness,
        Err(SysError::IndexOutOfBound) => return Ok(Vec::new()),
        Err(_) => return Err(E_SYSCALL),
    };
    if witness.is_empty() {
        return Ok(Vec::new());
    }
    let reader = WitnessArgsReader::from_slice(&witness).map_err(|_| E_WITNESS)?;
    Ok(reader.input_type().to_opt().map(|bytes| bytes.raw_data().to_vec()).unwrap_or_default())
}

fn seconds(timestamp_ms: u64) -> Result<u32, i8> {
    u32::try_from(timestamp_ms / 1000).map_err(|_| E_TIME)
}

/// The block that committed an input cell, if the transaction names it in its
/// header deps.
fn input_block(index: usize) -> Result<Option<BlockRef>, i8> {
    match load_header(index, Source::Input) {
        Ok(header) => Ok(Some(BlockRef {
            timestamp: seconds(header.raw().timestamp().unpack())?,
            hash: ckb_hash::blake2b_256(header.as_slice()),
        })),
        Err(SysError::ItemMissing) => Ok(None),
        Err(_) => Err(E_SYSCALL),
    }
}

/// The newest block the transaction proves to exist: "it is at least this late".
fn proven_time() -> Result<u32, i8> {
    let mut newest = 0u64;
    for header in QueryIter::new(load_header, Source::HeaderDep) {
        let timestamp: u64 = header.raw().timestamp().unpack();
        newest = newest.max(timestamp);
    }
    seconds(newest)
}

struct FarmCell {
    index: u8,
    id: [u8; 32],
    state: Vec<u8>,
    block: Option<BlockRef>,
    actions: Vec<u8>,
}

fn update(me: &Script, args: &[u8], unit: u32) -> Result<(), i8> {
    check_output_lock(me)?;
    let capacity_in = load_cell_capacity(0, Source::GroupInput).map_err(sys)?;
    let capacity_out = load_cell_capacity(0, Source::GroupOutput).map_err(sys)?;
    if capacity_out < capacity_in {
        return Err(E_CAPACITY);
    }

    // Every farm of this world among the inputs.
    let mut cells: Vec<FarmCell> = Vec::new();
    let mut mine = None;
    for (index, ty) in QueryIter::new(load_cell_type, Source::Input).enumerate() {
        let Some(ty) = ty else { continue };
        if !same_code(me, &ty) {
            continue;
        }
        let their_args = ty.args().raw_data();
        if their_args.len() != TYPE_ARGS_LEN || their_args[..UNIT_LEN] != args[..UNIT_LEN] {
            continue;
        }
        if their_args[UNIT_LEN..] == args[UNIT_LEN..] {
            mine = Some(cells.len());
        }
        let mut id = [0u8; 32];
        id.copy_from_slice(&their_args[UNIT_LEN..]);
        cells.push(FarmCell {
            index: u8::try_from(index).map_err(|_| E_TOO_MANY_INPUTS)?,
            id,
            state: load_cell_data(index, Source::Input).map_err(sys)?,
            block: input_block(index)?,
            actions: load_actions(index, Source::Input)?,
        });
    }
    let mine = mine.ok_or(E_SYSCALL)?;
    let farms: Vec<FarmInput> = cells
        .iter()
        .map(|cell| FarmInput {
            index: cell.index,
            id: cell.id,
            state: &cell.state,
            block: cell.block,
            actions: &cell.actions,
        })
        .collect();

    let clock = Clock { now: proven_time()?, unit };
    let outcome = transition(&farms, mine, clock).map_err(|e| e as i8)?;

    // Nobody gets to spend a farm cell just to get in its owner's way.
    if cells[mine].actions.is_empty() && !outcome.needs_owner {
        return Err(E_NOTHING_HAPPENED);
    }
    if outcome.needs_owner && !owner_pays(&outcome.farm.owner)? {
        return Err(E_NOT_OWNER);
    }

    let mut expected = [0u8; MAX_STATE_LEN];
    let len = outcome.farm.encode(&mut expected);
    let actual = load_cell_data(0, Source::GroupOutput).map_err(sys)?;
    if actual[..] != expected[..len] {
        return Err(E_WRONG_STATE);
    }
    Ok(())
}
