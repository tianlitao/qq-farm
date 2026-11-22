//! Audit round three (Fable 5.2, 2026-11-21): who may close a farm.
//!
//! The build before this round authorised a close by direction alone ("the
//! owner's lock ends up with more capacity"). No owner input was needed, so a
//! stranger could close anybody's farm by sending the owner a minimal cell and
//! keeping the rest of the deposit. A close now needs both an input locked by
//! the owner and the deposit flowing home.
//!
//! To see the old build fail these:
//! `FARM_BINARY=/path/to/old/farm cargo test -p farm-tests --test audit_fable`.

use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{Capacity, TransactionBuilder, TransactionView},
    packed::{CellInput, CellOutput, OutPoint},
    prelude::*,
};
use farm_core::*;
use farm_tests::{act, code, name, FarmCell, World, T0, UNIT};

const CKB: u64 = 100_000_000;
const FEE: u64 = 10_000;
const E_NOT_OWNER: i8 = 46;
const RADISH: u8 = 1;

/// A plain cell of `player` holding `shannons`.
fn purse(w: &mut World, player: u8, shannons: u64) -> (OutPoint, CellOutput) {
    let cell = pay(w, player, shannons);
    (w.ctx.create_cell(cell.clone(), Bytes::new()), cell)
}

fn pay(w: &mut World, player: u8, shannons: u64) -> CellOutput {
    CellOutput::new_builder()
        .capacity(Capacity::shannons(shannons).pack())
        .lock(w.wallet(player))
        .build()
}

/// Spends `farms` (closing them, no farm outputs) and `purses`, creating `outputs`.
fn closing_tx(w: &mut World, farms: &[&FarmCell], purses: &[OutPoint], outputs: Vec<CellOutput>) -> TransactionView {
    let mut tx = TransactionBuilder::default();
    for farm in farms {
        tx = tx.input(CellInput::new(farm.out_point.clone(), 0));
    }
    for point in purses {
        tx = tx.input(CellInput::new(point.clone(), 0));
    }
    for output in outputs {
        tx = tx.output(output).output_data(Bytes::new().pack());
    }
    w.ctx.complete_tx(tx.build())
}

/// The attack: the owner's lock is on no input, so nothing of theirs was
/// signed. The stranger tips the owner the smallest cell a real chain allows
/// and pockets the rest of the deposit.
#[test]
fn stranger_cannot_close_a_farm_for_a_tip() {
    let mut w = World::new();
    let mut farm = Farm::new(w.owner(1), name("victim"));
    farm.gold = 250_000;
    farm.exp = exp_for_level(25) as u32;
    let cell = w.place(1, &farm, None);

    let (attacker_purse, _) = purse(&mut w, 2, 100 * CKB);
    let tip = 61 * CKB;
    let loot = 100 * CKB + cell.capacity - tip - FEE;
    let outputs = vec![pay(&mut w, 1, tip), pay(&mut w, 2, loot)];
    let tx = closing_tx(&mut w, &[&cell], &[attacker_purse], outputs);
    assert_eq!(code(w.verify(&tx)), E_NOT_OWNER, "a tip to the owner must not authorise a close");
}

/// Even handing the owner the whole deposit does not make it the stranger's
/// call: the farm (level, gold, land) is the owner's to give up.
#[test]
fn stranger_cannot_close_a_farm_even_with_a_full_refund() {
    let mut w = World::new();
    let farm = Farm::new(w.owner(1), name("victim"));
    let cell = w.place(1, &farm, None);

    let (attacker_purse, _) = purse(&mut w, 2, 100 * CKB);
    let outputs = vec![pay(&mut w, 1, cell.capacity), pay(&mut w, 2, 100 * CKB - FEE)];
    let tx = closing_tx(&mut w, &[&cell], &[attacker_purse], outputs);
    assert_eq!(code(w.verify(&tx)), E_NOT_OWNER, "no owner input, no close");
}

/// An owner whose lock anybody may spend (anyone-can-pay style; the test
/// wallets are always-success, which is that property). A stranger can put the
/// owner's cell among the inputs, so presence proves nothing here: the deposit
/// has to come home, all of it but a fee.
#[test]
fn weak_owner_lock_cannot_be_skimmed() {
    let mut w = World::new();
    let farm = Farm::new(w.owner(1), name("victim"));
    let cell = w.place(1, &farm, None);

    let (owner_purse, _) = purse(&mut w, 1, 200 * CKB);
    let (attacker_purse, _) = purse(&mut w, 2, 100 * CKB);
    // The owner's cell grows by one shannon (what anyone-can-pay accepts),
    // the deposit goes to the attacker.
    let outputs = vec![pay(&mut w, 1, 200 * CKB + 1), pay(&mut w, 2, 100 * CKB + cell.capacity - FEE)];
    let tx = closing_tx(&mut w, &[&cell], &[owner_purse.clone(), attacker_purse.clone()], outputs);
    assert_eq!(code(w.verify(&tx)), E_NOT_OWNER, "one shannon is not the deposit");

    // Two CKB short of the deposit is still short: the fee allowance is one.
    let outputs = vec![
        pay(&mut w, 1, 200 * CKB + cell.capacity - 2 * CKB),
        pay(&mut w, 2, 100 * CKB + 2 * CKB - FEE),
    ];
    let tx = closing_tx(&mut w, &[&cell], &[owner_purse, attacker_purse], outputs);
    assert_eq!(code(w.verify(&tx)), E_NOT_OWNER, "the deposit must come home but for a fee");
}

/// One refund must not vouch for two closes.
#[test]
fn one_refund_cannot_cover_two_closes() {
    let mut w = World::new();
    let first = Farm::new(w.owner(1), name("first"));
    let first = w.place(1, &first, None);
    let second = Farm::new(w.owner(1), name("second"));
    let second = w.place(2, &second, None);

    let (owner_purse, _) = purse(&mut w, 1, 200 * CKB);
    let (attacker_purse, _) = purse(&mut w, 2, 100 * CKB);
    let outputs = vec![
        pay(&mut w, 1, 200 * CKB + first.capacity),
        pay(&mut w, 2, 100 * CKB + second.capacity - FEE),
    ];
    let tx = closing_tx(&mut w, &[&first, &second], &[owner_purse, attacker_purse], outputs);
    assert_eq!(code(w.verify(&tx)), E_NOT_OWNER, "both deposits must come home");
}

/// The honest close: the owner's cell is spent, the deposit comes home, the
/// owner pays the fee.
#[test]
fn owner_closes_their_farm() {
    let mut w = World::new();
    let farm = Farm::new(w.owner(1), name("mine"));
    let cell = w.place(1, &farm, None);

    let (owner_purse, _) = purse(&mut w, 1, 200 * CKB);
    let outputs = vec![pay(&mut w, 1, 200 * CKB + cell.capacity - FEE)];
    let tx = closing_tx(&mut w, &[&cell], &[owner_purse], outputs);
    w.verify(&tx).expect("the owner may close their farm");
}

/// And two farms at once.
#[test]
fn owner_closes_two_farms_at_once() {
    let mut w = World::new();
    let first = Farm::new(w.owner(1), name("first"));
    let first = w.place(1, &first, None);
    let second = Farm::new(w.owner(1), name("second"));
    let second = w.place(2, &second, None);

    let mut draft = w.draft(&[(&first, &[]), (&second, &[])], &[1], None).unwrap();
    draft.outputs[0] = None;
    draft.outputs[1] = None;
    let tx = w.build(&draft);
    w.verify(&tx).expect("the owner may close both farms");
}

/// Closing one farm leaves the owner's other farm alone: only farms that leave
/// the chain count towards what must come home.
#[test]
fn owner_closes_one_farm_and_keeps_another() {
    let mut w = World::new();
    let now = T0 + 10;
    let gone = Farm::new(w.owner(1), name("gone"));
    let gone = w.place(1, &gone, Some(T0));
    let mut keep = Farm::new(w.owner(1), name("keep"));
    keep.plots[0] = Plot { crop: RADISH, planted_at: T0, seed: 1, ..Plot::default() };
    let keep = w.place(2, &keep, Some(T0));
    let bob = Farm::new(w.owner(2), name("bob"));
    let bob = w.place(3, &bob, Some(T0));

    // In the same transaction Bob drops a weed on the farm the owner keeps.
    let weed = act::mischief(2, 0, KIND_WEED);
    let mut draft = w.draft(&[(&gone, &[]), (&keep, &weed), (&bob, &[])], &[1, 2], Some(now)).unwrap();
    draft.outputs[0] = None;
    let tx = w.build(&draft);
    w.verify(&tx).expect("closing one farm does not ask for the other's deposit");
}

/// Not fixed in this round, kept as a probe: a visitor plants a weed and pulls
/// it out again, thirty times in one transaction. The visited farm ends up
/// exactly as it was (its cell was spent without its owner), and the visitor
/// is paid help experience for every round.
#[test]
fn probe_exp_from_clearing_own_mischief() {
    let mut w = World::new();
    let now = T0 + 10;
    let today = now / (HOURS_PER_DAY * UNIT);

    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.day = today;
    ann.plots[0] = Plot { crop: RADISH, planted_at: T0, seed: 1, ..Plot::default() };
    let ann = w.place(1, &ann, Some(T0));
    let mut bob = Farm::new(w.owner(2), name("bob"));
    bob.day = today;
    let bob = w.place(2, &bob, Some(T0));

    let mut actions = Vec::new();
    for _ in 0..MISCHIEF_PER_DAY {
        actions.extend(act::mischief(1, 0, KIND_WEED));
        actions.extend(act::help(1, 0, KIND_WEED));
    }
    // Only Bob signs.
    match w.draft(&[(&ann, &actions), (&bob, &[])], &[2], Some(now)) {
        Err(e) => println!("weed round trip refused by the rules: {e:?}"),
        Ok(draft) => {
            let tx = w.build(&draft);
            match w.verify(&tx) {
                Err(e) => println!("weed round trip refused by the script: {e}"),
                Ok(_) => {
                    let cells = w.commit(&draft, &tx, now + 5);
                    // The transaction may pass — the visited farm nets zero —
                    // but a weed round trip must earn NOTHING: nature's weeds
                    // pay experience, what the helper planted does not.
                    assert_eq!(cells[0].state, ann.state, "the visited farm must net zero");
                    assert_eq!(cells[1].farm().exp, bob.farm().exp, "weed round trip must earn no experience");
                    assert_eq!(cells[1].farm().help_today, MISCHIEF_PER_DAY.min(HELP_EXP_PER_DAY) as u8, "the daily cap still ticks");
                    println!("weed round trip accepted, earned nothing: help_today {}", cells[1].farm().help_today);
                }
            }
        }
    }
}
