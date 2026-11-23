//! Audit round three (qwen4-max, 2026-11-21, evening) against the build with
//! `owner_net` direction authorization and owner-keyed stealing.
//!
//! Round two's fix replaced "an input carries the owner's lock" with "the
//! owner's capacity flows in the right direction". These probes attack THAT:
//! the direction is forgeable by anyone willing to spend their own CKB, so
//! the fix stopped zero-cost ACP theft but not paid impersonation.
//!
//! Like audit_fable.rs, the vulnerability probes print the script's verdict
//! instead of asserting a wish: they document what IS, and keep running
//! after a fix. Read with `-- --nocapture`.

use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{Capacity, TransactionBuilder},
    packed::{CellInput, CellOutput},
    prelude::*,
};
use farm_core::*;
use farm_tests::{act, code, encode, name, World, T0, UNIT};

const CKB: u64 = 100_000_000;
const RADISH: u8 = 1;
const HOUR: u32 = UNIT;

fn plot_where(crop: u8, want: impl Fn(&Plot) -> bool) -> Plot {
    (1u32..)
        .map(|seed| Plot { crop, planted_at: T0, seed, ..Plot::default() })
        .find(|plot| want(plot))
        .expect("some seed")
}

fn calm(plot: &Plot) -> bool {
    (KIND_WEED..=KIND_DRY).all(|k| natural_at(plot, k, UNIT).unwrap().is_none())
}

fn cell(capacity: u64, lock: ckb_testtool::ckb_types::packed::Script) -> CellOutput {
    CellOutput::new_builder().capacity(Capacity::shannons(capacity).pack()).lock(lock).build()
}

/// R3-F1a: a stranger closes ANY farm (strong secp-style owner included) by
/// tipping the owner 61 CKB of the attacker's own money. owner_net < 0 holds,
/// no owner signature exists anywhere. The attacker keeps deposit - 61.
/// This is a regression introduced by the round-two "fix": v1 refused it.
#[test]
fn r3_stranger_closes_farm_for_a_tip() {
    let mut w = World::new();
    let mut farm = Farm::new(w.owner(1), name("victim"));
    farm.gold = 250_000;
    farm.exp = exp_for_level(25) as u32;
    let victim = w.place(1, &farm, None);

    let attacker = w.wallet(2);
    let purse = w.ctx.create_cell(cell(100 * CKB, attacker.clone()), Bytes::new());
    let tip = 61 * CKB;
    let fee = 1_000;
    let loot = 100 * CKB + victim.capacity - tip - fee;
    let tx = TransactionBuilder::default()
        .input(CellInput::new(victim.out_point.clone(), 0))
        .input(CellInput::new(purse, 0))
        .output(cell(tip, w.wallet(1)))
        .output(cell(loot, attacker))
        .output_data(Bytes::new().pack())
        .output_data(Bytes::new().pack())
        .build();
    let tx = w.ctx.complete_tx(tx);
    match w.verify(&tx) {
        Ok(_) => println!(
            "R3-F1a VULNERABLE: stranger closed the farm for a 61-CKB tip, profits {} CKB, no owner signature",
            (loot - 100 * CKB) / CKB
        ),
        Err(e) => println!("R3-F1a ok: stranger close refused: {e}"),
    }
}

/// R3-F1b: full-refund forced close. The stranger gains nothing but wipes
/// months of progress for one fee. Griefing any farm at will.
#[test]
fn r3_stranger_force_close_full_refund() {
    let mut w = World::new();
    let farm = Farm::new(w.owner(1), name("victim"));
    let victim = w.place(1, &farm, None);
    let attacker = w.wallet(2);
    let purse = w.ctx.create_cell(cell(100 * CKB, attacker.clone()), Bytes::new());
    let tx = TransactionBuilder::default()
        .input(CellInput::new(victim.out_point.clone(), 0))
        .input(CellInput::new(purse, 0))
        .output(cell(victim.capacity, w.wallet(1)))
        .output(cell(100 * CKB - 1_000, attacker))
        .output_data(Bytes::new().pack())
        .output_data(Bytes::new().pack())
        .build();
    let tx = w.ctx.complete_tx(tx);
    match w.verify(&tx) {
        Ok(_) => println!("R3-F1b VULNERABLE: stranger force-closed the farm (full refund, progress destroyed, cost: one fee)"),
        Err(e) => println!("R3-F1b ok: forced close refused: {e}"),
    }
}

/// R3-F1c: the same forgery tried on OWNER ACTIONS. The attacker tips the
/// owner 61 CKB (owner_net < 0) and buys seeds with the victim's gold.
/// RESULT: refused (46) — the update path's direction check holds here,
/// unlike close(). Why the asymmetry? close() accepts net < 0 (owner gains),
/// which a tip forges; update() demands net > 0 (owner pays), and a tip to
/// the owner makes net MORE negative, so it cannot forge payment. The owner
/// would have to actually spend their own cell — which needs their signature
/// on strong locks. ACP variant (net == 0) also refused. Owner actions are
/// safe under this scheme; CLOSE is the hole (F1a/F1b).
#[test]
fn r3_stranger_spends_victim_gold() {
    let mut w = World::new();
    let farm = Farm::new(w.owner(1), name("victim"));
    let victim = w.place(1, &farm, None);
    let actions = act::buy(RADISH, 6); // 480 of the victim's 500 gold

    // Honest outcome per the rules.
    let inputs = [FarmInput { index: 0, id: victim.id, state: &victim.state, block: None, actions: &actions }];
    let outcome = transition(&inputs, 0, Clock { now: 0, unit: UNIT }).unwrap();
    let next = encode(&outcome.farm);

    let attacker = w.wallet(2);
    let purse = w.ctx.create_cell(cell(200 * CKB, attacker.clone()), Bytes::new());
    let farm_out = CellOutput::new_builder()
        .capacity(Capacity::shannons(victim.capacity).pack())
        .lock(w.farm_lock())
        .type_(Some(w.farm_type(&victim.id, UNIT)).pack())
        .build();
    let tip = 61 * CKB; // smallest legal cell under the owner's lock
    let change = 200 * CKB - tip - 1_000;
    let tx = TransactionBuilder::default()
        .input(CellInput::new(victim.out_point.clone(), 0))
        .input(CellInput::new(purse, 0))
        .output(farm_out.clone())
        .output_data(Bytes::from(next.clone()).pack())
        .output(cell(tip, w.wallet(1))) // the forged "direction": owner nets -61 CKB
        .output(cell(change, attacker))
        .output_data(Bytes::new().pack())
        .output_data(Bytes::new().pack())
        .witness(
            ckb_testtool::ckb_types::packed::WitnessArgs::new_builder()
                .input_type(Some(Bytes::from(actions.clone())).pack())
                .build()
                .as_bytes()
                .pack(),
        )
        .witness(Bytes::new().pack())
        .build();
    let tx = w.ctx.complete_tx(tx);
    match w.verify(&tx) {
        Ok(_) => println!("R3-F1c VULNERABLE: stranger burned 480 of the victim's 500 gold for a 61-CKB tip, no owner signature"),
        Err(e) => println!("R3-F1c ok: stranger owner-action refused: {e}"),
    }

    // Positive control: the OWNER signs (their wallet cell is an input and
    // pays the fee). Same farm, same action — must pass. If this also fails
    // with 46, the probe's tx shape is wrong, not the authorization.
    let owner_wallet = w.wallet(1);
    let ow_cell = cell(100 * CKB, owner_wallet.clone());
    let ow_point = w.ctx.create_cell(ow_cell, Bytes::new());
    let tx0 = TransactionBuilder::default()
        .input(CellInput::new(victim.out_point.clone(), 0))
        .input(CellInput::new(ow_point, 0))
        .output(farm_out.clone())
        .output_data(Bytes::from(next.clone()).pack())
        .output(cell(100 * CKB - 1_000, owner_wallet))
        .output_data(Bytes::new().pack())
        .witness(ckb_testtool::ckb_types::packed::WitnessArgs::new_builder().input_type(Some(Bytes::from(actions.clone())).pack()).build().as_bytes().pack())
        .witness(Bytes::new().pack())
        .build();
    let tx0 = w.ctx.complete_tx(tx0);
    match w.verify(&tx0) {
        Ok(_) => println!("  [control] honest owner buy: ACCEPTED"),
        Err(e) => println!("  [control] honest owner buy REFUSED: {e}"),
    }

    // Variant: does the direction check care WHERE the owner's gain comes
    // from? Put the tip INSIDE the farm output's capacity surplus instead:
    // farm output capacity grows by 61 CKB (attacker funds it), and a 61-CKB
    // owner cell appears. Same net. If the script only reads net, identical.
    // Instead try: NO tip cell, but the attacker spends an owner-locked cell
    // they were given earlier (a real ACP top-up cell). Owner input 61, no
    // owner output: net +61 > 0. That is the ACP case the fix claims to stop.
    let owner_acp = w.wallet(1);
    let acp_cell = cell(61 * CKB, owner_acp);
    let acp_point = w.ctx.create_cell(acp_cell.clone(), Bytes::new());
    let tx2 = TransactionBuilder::default()
        .input(CellInput::new(victim.out_point.clone(), 0))
        .input(CellInput::new(acp_point, 0))
        .output(farm_out.clone())
        .output_data(Bytes::from(encode(&transition(&[FarmInput { index: 0, id: victim.id, state: &victim.state, block: None, actions: &act::buy(RADISH, 6) }], 0, Clock { now: 0, unit: UNIT }).unwrap().farm)).pack())
        .output(acp_cell) // ACP preserved: its own lock is happy, owner_net = 0
        .output_data(Bytes::new().pack())
        .witness(ckb_testtool::ckb_types::packed::WitnessArgs::new_builder().input_type(Some(Bytes::from(act::buy(RADISH, 6))).pack()).build().as_bytes().pack())
        .witness(Bytes::new().pack())
        .build();
    let tx2 = w.ctx.complete_tx(tx2);
    match w.verify(&tx2) {
        Ok(_) => println!("R3-F1c-ACP VULNERABLE: owner-locked ACP cell preserved, net 0, yet owner action ran"),
        Err(e) => println!("R3-F1c-ACP ok: refused: {e}"),
    }
}


/// R3-F2: help-exp farming loop. Mischief then help, 30 rounds in one tx:
/// the visited farm ends unchanged, the visitor mints 90 exp with no owner
/// involvement. Repeatable daily; ~level 25 in a month of looping.
#[test]
fn r3_help_exp_mischief_loop() {
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
    match w.draft(&[(&ann, &actions), (&bob, &[])], &[2], Some(now)) {
        Err(e) => println!("R3-F2 ok: mischief-help loop refused by rules ({e:?})"),
        Ok(draft) => {
            let tx = w.build(&draft);
            match w.verify(&tx) {
                Err(e) => println!("R3-F2 ok: mischief-help loop refused by script ({e})"),
                Ok(_) => {
                    let cells = w.commit(&draft, &tx, now + 5);
                    println!(
                        "R3-F2 {}: mischief-help loop, visited unchanged={}, visitor exp={} per tx",
                        if cells[1].farm().exp > 0 { "VULNERABLE" } else { "ok" },
                        cells[0].state == ann.state,
                        cells[1].farm().exp
                    );
                }
            }
        }
    }
}

/// R3-F3: dog verdict is still grindable. The seed is public after settle and
/// dog_blocks is deterministic in (owner, seed); a thief picks an owner key
/// whose hash passes every plot. 2^18 tries ≈ seconds of CPU for 18 plots.
#[test]
fn r3_dog_grind_still_possible() {
    let plots: Vec<Plot> = (0..18u32)
        .map(|i| Plot { crop: RADISH, planted_at: T0, seed: i + 1, ..Plot::default() })
        .collect();
    // Find an owner id that no fed dog blocks on any of the 18 plots.
    let (attempt, _) = (0u32..)
        .map(|n| {
            let mut id = [0u8; 32];
            id[4..8].copy_from_slice(&n.to_le_bytes());
            (n, id)
        })
        .find(|(_, id)| plots.iter().all(|p| !dog_blocks(p, id)))
        .expect("some id passes");
    println!("R3-F3: dog-grind found an owner id passing all 18 plots at attempt {attempt} (2^18 expected)");
}

/// Regression: the round-two sybil fix holds — same owner, second farm,
/// same slot, refused. And a DIFFERENT owner still steals fine.
#[test]
fn r3_sybil_fix_holds_and_honest_steal_works() {
    let mut w = World::new();
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.plots[0] = plot_where(RADISH, calm);
    let ann = w.place(1, &ann, Some(T0));
    let ann2 = Farm::new(w.owner(1), name("ann2"));
    let ann2 = w.place(9, &ann2, Some(T0));
    let bob = Farm::new(w.owner(2), name("bob"));
    let bob = w.place(2, &bob, Some(T0));
    let ripe = T0 + 2 * HOUR;
    let cells = w.play(&[(&ann, &act::steal(1, 0)), (&ann2, &[])], &[1], Some(ripe), ripe + 5);
    assert_eq!(w.refused(&[(&cells[0], &act::steal(1, 0)), (&ann2, &[])], &[1], Some(ripe + 10)), Error::AlreadyStolen);
    // A different player is unaffected.
    let cells = w.play(&[(&cells[0], &act::steal(1, 0)), (&bob, &[])], &[2], Some(ripe + 20), ripe + 25);
    assert_eq!(cells[1].farm().fruits[0], 1);
    println!("sybil fix holds; honest neighbour steal works");
}

/// R3-F1d: ACP owner tries to close their OWN farm without a signature.
/// The new close demands presence + deposit-home. An ACP cell can be spent
/// by anybody (capacity preserved), so presence is forgeable; but the deposit
/// must flow to the owner, so the attacker gains nothing. Verify: a stranger
/// spending the victim's ACP cell to close the farm, deposit to the owner,
/// is accepted (griefing, owner made whole) — and a variant keeping the
/// deposit is refused.
#[test]
fn r3_acp_close_deposit_must_go_home() {
    let mut w = World::new();
    let victim_acp = w.wallet(1);
    let owner: [u8; 32] = victim_acp.calc_script_hash().unpack();
    let farm = Farm::new(owner, name("acp"));
    let victim = w.place(1, &farm, None);
    let acp = cell(200 * CKB, victim_acp.clone());
    let acp_point = w.ctx.create_cell(acp.clone(), Bytes::new());
    let attacker = w.wallet(2);
    let purse = w.ctx.create_cell(cell(100 * CKB, attacker.clone()), Bytes::new());

    // Variant A: deposit goes to the attacker. Must be refused.
    let tx = TransactionBuilder::default()
        .input(CellInput::new(victim.out_point.clone(), 0))
        .input(CellInput::new(acp_point.clone(), 0))
        .input(CellInput::new(purse.clone(), 0))
        .output(acp.clone())
        .output(cell(victim.capacity, attacker.clone()))
        .output(cell(100 * CKB - 1_000, attacker.clone()))
        .output_data(Bytes::new().pack())
        .output_data(Bytes::new().pack())
        .output_data(Bytes::new().pack())
        .build();
    let tx = w.ctx.complete_tx(tx);
    let a = w.verify(&tx);
    println!("R3-F1d ACP close, deposit to attacker: {}", if a.is_err() { "ok: refused" } else { "VULNERABLE" });

    // Variant B: deposit goes home to the owner (ACP cell preserved).
    let tx = TransactionBuilder::default()
        .input(CellInput::new(victim.out_point.clone(), 0))
        .input(CellInput::new(acp_point, 0))
        .input(CellInput::new(purse, 0))
        .output(acp)
        .output(cell(victim.capacity, victim_acp))
        .output(cell(100 * CKB - 1_000, attacker))
        .output_data(Bytes::new().pack())
        .output_data(Bytes::new().pack())
        .output_data(Bytes::new().pack())
        .build();
    let tx = w.ctx.complete_tx(tx);
    let b = w.verify(&tx);
    println!("R3-F1d ACP close, deposit home: {} (griefing, owner made whole)", if b.is_ok() { "ACCEPTED" } else { "refused" });
    assert!(a.is_err(), "deposit must not be skimmable");
}

/// R4: cycle re-baseline on the round-four/five binary (close checks replay
/// the world too). Same shapes as the round-one benchmarks.
#[test]
fn r4_cycles_rebaseline() {
    let mut w = World::new();
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.plots[0] = plot_where(RADISH, calm);
    let ann = w.place(1, &ann, Some(T0));
    let bob = Farm::new(w.owner(2), name("bob"));
    let bob = w.place(2, &bob, Some(T0));
    let ripe = T0 + 2 * HOUR;
    let draft = w.draft(&[(&ann, &act::steal(1, 0)), (&bob, &[])], &[2], Some(ripe)).unwrap();
    let tx = w.build(&draft);
    println!("R4 two-farm steal cycles: {}", w.verify(&tx).expect("ok"));

    for n in [10usize, 24, 30] {
        let mut w = World::new();
        let mut ann = Farm::new(w.owner(1), name("ann"));
        ann.plots[0] = plot_where(RADISH, calm);
        let ann = w.place(1, &ann, Some(T0));
        let mut farms: Vec<farm_tests::FarmCell> = vec![ann];
        for p in 2..=(n as u8) {
            let f = Farm::new(w.owner(p), name("x"));
            farms.push(w.place(p, &f, Some(T0)));
        }
        let steal = Box::leak(act::steal(1, 0).into_boxed_slice());
        let buy = Box::leak(act::buy(RADISH, 1).into_boxed_slice());
        let pairs: Vec<(&farm_tests::FarmCell, &[u8])> = farms
            .iter()
            .enumerate()
            .map(|(i, f)| (f, if i == 0 { &steal[..] } else { &buy[..] }))
            .collect();
        let signers: Vec<u8> = (2..=(n as u8)).collect();
        let draft = w.draft(&pairs, &signers, Some(ripe)).unwrap();
        let tx = w.build(&draft);
        println!("R4 {n} active farms, one steal: {} cycles", w.verify(&tx).expect("ok"));
    }
}

/// R4-FB3: the daily mischief limit is per FARM, not per player. Stealing was
/// re-keyed to the owner, mischief was not: one player's second farm gets a
/// fresh 30-a-day allowance on the same victim.
#[test]
fn r4_mischief_limit_is_per_farm_not_per_player() {
    let mut w = World::new();
    let now = T0 + 10;
    let today = now / (HOURS_PER_DAY * UNIT);
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.day = today;
    ann.plots[0] = Plot { crop: RADISH, planted_at: T0, seed: 1, ..Plot::default() };
    ann.plots[1] = Plot { crop: RADISH, planted_at: T0, seed: 2, ..Plot::default() };
    let ann = w.place(1, &ann, Some(T0));
    let mut bob = Farm::new(w.owner(2), name("bob"));
    bob.day = today;
    bob.mischief_today = MISCHIEF_PER_DAY; // used up on farm 1
    let bob = w.place(2, &bob, Some(T0));
    let mut bob2 = Farm::new(w.owner(2), name("bob2")); // same player, farm 2
    bob2.day = today;
    let bob2 = w.place(9, &bob2, Some(T0));
    let weed = act::mischief(1, 0, KIND_WEED);
    // Farm 1 is refused (limit)…
    assert_eq!(w.refused(&[(&ann, &weed), (&bob, &[])], &[2], Some(now)), Error::MischiefLimit);
    // …but the same player's farm 2 plants it fine.
    let cells = w.play(&[(&ann, &weed), (&bob2, &[])], &[2], Some(now), now + 5);
    println!(
        "R4-FB3 {}: same owner's second farm mischief after limit, bob2 mischief_today={}",
        if cells[1].farm().mischief_today == 1 { "CONFIRMED" } else { "fixed?" },
        cells[1].farm().mischief_today
    );
}
