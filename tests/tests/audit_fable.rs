//! Audit probes (Fable 5.2, 2026-11-21) against the build that checks owner
//! authorisation by capacity direction (`owner_net`).
//!
//! Each probe prints what the script decided. They assert nothing about the
//! verdict, so they keep running before and after a fix; read the output with
//! `cargo test -p farm-tests --test audit_fable -- --nocapture`.

use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{Capacity, TransactionBuilder},
    packed::{CellInput, CellOutput},
    prelude::*,
};
use farm_core::*;
use farm_tests::{act, name, World, T0, UNIT};

const CKB: u64 = 100_000_000;
const RADISH: u8 = 1;

/// A stranger closes somebody else's farm. The owner's lock is nowhere among
/// the inputs (so no signature of theirs could exist); the stranger just adds
/// an output that tips the owner a minimal cell and keeps the rest of the
/// farm's deposit.
#[test]
fn probe_stranger_closes_farm_for_a_tip() {
    let mut w = World::new();
    let mut farm = Farm::new(w.owner(1), name("victim"));
    // A farm somebody has put months into.
    farm.gold = 250_000;
    farm.exp = exp_for_level(25) as u32;
    let cell = w.place(1, &farm, None);

    // The attacker's own money.
    let attacker = w.wallet(2);
    let purse = CellOutput::new_builder()
        .capacity(Capacity::shannons(100 * CKB).pack())
        .lock(attacker.clone())
        .build();
    let purse_point = w.ctx.create_cell(purse, Bytes::new());

    // 61 CKB is what the smallest secp256k1 cell costs on a real chain.
    let tip = 61 * CKB;
    let fee = 1_000;
    let to_owner = CellOutput::new_builder()
        .capacity(Capacity::shannons(tip).pack())
        .lock(w.wallet(1))
        .build();
    let loot = 100 * CKB + cell.capacity - tip - fee;
    let to_attacker = CellOutput::new_builder()
        .capacity(Capacity::shannons(loot).pack())
        .lock(attacker)
        .build();

    let tx = TransactionBuilder::default()
        .input(CellInput::new(cell.out_point.clone(), 0))
        .input(CellInput::new(purse_point, 0))
        .output(to_owner)
        .output(to_attacker)
        .output_data(Bytes::new().pack())
        .output_data(Bytes::new().pack())
        .build();
    let tx = w.ctx.complete_tx(tx);
    match w.verify(&tx) {
        Ok(cycles) => println!(
            "VULNERABLE: stranger closed the farm with no owner input. deposit {} CKB, owner got {} CKB, attacker profit {:.4} CKB ({cycles} cycles)",
            cell.capacity / CKB,
            tip / CKB,
            (loot - 100 * CKB) as f64 / CKB as f64,
        ),
        Err(e) => println!("ok: stranger close refused: {e}"),
    }
}

/// Same, but the whole deposit goes to the owner: the stranger gains nothing
/// and still wipes the farm (level, gold, land) without the owner's consent.
#[test]
fn probe_stranger_closes_farm_refunding_everything() {
    let mut w = World::new();
    let farm = Farm::new(w.owner(1), name("victim"));
    let cell = w.place(1, &farm, None);
    let attacker = w.wallet(2);
    let purse = CellOutput::new_builder()
        .capacity(Capacity::shannons(100 * CKB).pack())
        .lock(attacker.clone())
        .build();
    let purse_point = w.ctx.create_cell(purse, Bytes::new());
    let to_owner = CellOutput::new_builder()
        .capacity(Capacity::shannons(cell.capacity).pack())
        .lock(w.wallet(1))
        .build();
    let to_attacker = CellOutput::new_builder()
        .capacity(Capacity::shannons(100 * CKB - 1_000).pack())
        .lock(attacker)
        .build();
    let tx = TransactionBuilder::default()
        .input(CellInput::new(cell.out_point.clone(), 0))
        .input(CellInput::new(purse_point, 0))
        .output(to_owner)
        .output(to_attacker)
        .output_data(Bytes::new().pack())
        .output_data(Bytes::new().pack())
        .build();
    let tx = w.ctx.complete_tx(tx);
    match w.verify(&tx) {
        Ok(_) => println!("VULNERABLE: stranger force-closed a farm (full refund, progress destroyed, cost: one fee)"),
        Err(e) => println!("ok: forced close refused: {e}"),
    }
}

/// A visitor plants a weed and pulls it out again, thirty times in one
/// transaction. The visited farm ends up exactly as it was; the visitor is
/// paid help experience for every round.
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
    // Only Bob signs. Ann's owner is not in the transaction.
    match w.draft(&[(&ann, &actions), (&bob, &[])], &[2], Some(now)) {
        Err(e) => println!("ok: rules refuse the weed round trip: {e:?}"),
        Ok(draft) => {
            let tx = w.build(&draft);
            match w.verify(&tx) {
                Err(e) => println!("ok: script refuses the weed round trip: {e}"),
                Ok(_) => {
                    let cells = w.commit(&draft, &tx, now + 5);
                    println!(
                        "visited farm unchanged: {}; visitor exp {} -> {} (help_today {}), no owner signature on the visited farm",
                        cells[0].state == ann.state,
                        bob.farm().exp,
                        cells[1].farm().exp,
                        cells[1].farm().help_today,
                    );
                }
            }
        }
    }
}

/// The honest close still works: owner signs, deposit flows home.
#[test]
fn probe_owner_close_still_works() {
    let mut w = World::new();
    let farm = Farm::new(w.owner(1), name("mine"));
    let cell = w.place(1, &farm, None);
    let mut draft = w.draft(&[(&cell, &[])], &[1], None).unwrap();
    draft.outputs[0] = None;
    let tx = w.build(&draft);
    match w.verify(&tx) {
        Ok(_) => println!("ok: owner close accepted"),
        Err(e) => println!("BROKEN: owner close refused: {e}"),
    }
}
