//! Exploratory audit probes: cycle usage and abuse scenarios.

use ckb_testtool::ckb_types::prelude::*;
use farm_core::*;
use farm_tests::{act, code, encode, name, FarmCell, World, T0, UNIT};

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

#[test]
fn cycles_two_farm_steal() {
    let mut w = World::new();
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.plots[0] = plot_where(RADISH, calm);
    let ann = w.place(1, &ann, Some(T0));
    let bob = Farm::new(w.owner(2), name("bob"));
    let bob = w.place(2, &bob, Some(T0));
    let ripe = T0 + 2 * HOUR;
    let draft = w.draft(&[(&ann, &act::steal(1, 0)), (&bob, &[])], &[2], Some(ripe)).unwrap();
    let tx = w.build(&draft);
    let cycles = w.verify(&tx).expect("ok");
    println!("two-farm steal cycles: {cycles}");
}

#[test]
fn cycles_many_farms() {
    for n in [5usize, 10, 20, 30] {
        let mut w = World::new();
        let mut ann = Farm::new(w.owner(1), name("ann"));
        ann.plots[0] = plot_where(RADISH, calm);
        let ann = w.place(1, &ann, Some(T0));
        let mut farms: Vec<FarmCell> = vec![ann];
        for p in 2..=(n as u8) {
            let f = Farm::new(w.owner(p), name("x"));
            farms.push(w.place(p, &f, Some(T0)));
        }
        let ripe = T0 + 2 * HOUR;
        let steal = Box::leak(act::steal(1, 0).into_boxed_slice());
        let buy = Box::leak(act::buy(RADISH, 1).into_boxed_slice());
        let pairs: Vec<(&FarmCell, &[u8])> = farms
            .iter()
            .enumerate()
            .map(|(i, f)| (f, if i == 0 { &steal[..] } else { &buy[..] }))
            .collect();
        let signers: Vec<u8> = (2..=(n as u8)).collect();
        let draft = w.draft(&pairs, &signers, Some(ripe)).unwrap();
        let tx = w.build(&draft);
        let cycles = w.verify(&tx).expect("ok");
        println!("{n} active farms, one steal: {cycles} cycles");
    }
}

#[test]
fn cycles_full_farm_busy_day() {
    // 18 settled plots, big inventory, several owner actions in one tx.
    let mut w = World::new();
    let mut f = Farm::new(w.owner(1), name("full"));
    f.land = 18;
    f.gold = 1_000_000;
    f.exp = 1_000_000;
    for i in 0..18 {
        f.plots[i] = plot_where(RADISH, calm);
        f.fruits[0] = 1000;
        f.seeds[0] = 100;
    }
    let cell = w.place(1, &f, Some(T0));
    let now = T0 + 100 * HOUR;
    let mut actions = Vec::new();
    for i in 0..18u8 {
        actions.extend(act::harvest(i));
        actions.extend(act::shovel(i));
        actions.extend(act::plant(i, RADISH));
    }
    actions.extend(act::sell(RADISH, 300));
    let draft = w.draft(&[(&cell, &actions)], &[1], Some(now)).unwrap();
    let tx = w.build(&draft);
    let cycles = w.verify(&tx).expect("ok");
    println!("full farm 55 actions: {cycles} cycles");
}

#[test]
fn probe_self_sybil_steal() {
    // One player, three farms. Stealing is keyed on the OWNER lock hash, so
    // the first farm's steal consumes the plot's slot for the whole player:
    // a second farm of the same player cannot steal again this season.
    let mut w = World::new();
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.plots[0] = plot_where(RADISH, calm);
    let ann = w.place(1, &ann, Some(T0));
    let mut ann2 = Farm::new(w.owner(1), name("ann2"));
    ann2.gold = 500;
    let ann2 = w.place(9, &ann2, Some(T0));
    let mut ann3 = Farm::new(w.owner(1), name("ann3"));
    ann3.gold = 500;
    let ann3 = w.place(10, &ann3, Some(T0));
    let ripe = T0 + 2 * HOUR;
    let cells = w.play(&[(&ann, &act::steal(1, 0)), (&ann2, &[])], &[1], Some(ripe), ripe + 5);
    assert_eq!(cells[0].farm().plots[0].stolen, 1);
    assert_eq!(cells[1].farm().fruits[0], 1);
    // The second farm of the same player: same identity, same slot — refused.
    let reason = w.refused(&[(&cells[0], &act::steal(1, 0)), (&ann3, &[])], &[1], Some(ripe + 10));
    assert_eq!(reason, Error::AlreadyStolen, "same-owner sybil steal must be refused");
}

#[test]
fn probe_owner_closes_victim_mid_visit() {
    // Bob steals from Ann, and Ann's owner closes her farm in the same tx.
    let mut w = World::new();
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.plots[0] = plot_where(RADISH, calm);
    let ann = w.place(1, &ann, Some(T0));
    let bob = Farm::new(w.owner(2), name("bob"));
    let bob = w.place(2, &bob, Some(T0));
    let ripe = T0 + 2 * HOUR;
    let mut draft = w.draft(&[(&ann, &act::steal(1, 0)), (&bob, &[])], &[1, 2], Some(ripe)).unwrap();
    draft.outputs[0] = None; // Ann closes her farm
    let tx = w.build(&draft);
    match w.verify(&tx) {
        Ok(c) => println!("close-with-visitor-actions ACCEPTED, cycles {c}"),
        Err(e) => println!("close-with-visitor-actions refused: {e}"),
    }
}

#[test]
fn probe_dog_until_inflation() {
    // Feed the dog using a header timestamp far in the future? Not possible on
    // chain, but check what the rules do if 'now' jumps: dog_until = max(old, now)+24h.
    let mut w = World::new();
    let mut f = Farm::new(w.owner(1), name("f"));
    f.exp = exp_for_level(3) as u32;
    f.gold = 10_000;
    let cell = w.place(1, &f, None);
    let now = T0 + 10 * HOUR;
    let actions = [act::feed_dog(), act::feed_dog(), act::feed_dog()].concat();
    let cells = w.play(&[(&cell, &actions)], &[1], Some(now), now + 5);
    println!("dog after 3 feeds same tx: {} (now {now})", cells[0].farm().dog_until);
}

#[test]
fn probe_two_outputs_same_farm() {
    // Try to fork a farm into two output cells with the same type script.
    use ckb_testtool::ckb_types::{bytes::Bytes, packed::CellOutput};
    let mut w = World::new();
    let f = Farm::new(w.owner(1), name("f"));
    let cell = w.place(1, &f, None);
    let mut draft = w.draft(&[(&cell, &act::buy(RADISH, 1))], &[1], None).unwrap();
    let tx = w.build(&draft);
    let dup = tx.output(0).unwrap();
    let tx = tx
        .as_advanced_builder()
        .output(dup)
        .output_data(Bytes::from(tx.outputs_data().get(0).unwrap().raw_data()).pack())
        .build();
    let tx = w.ctx.complete_tx(tx);
    match w.verify(&tx) {
        Ok(_) => println!("DUPLICATE FARM OUTPUT ACCEPTED — farm duplicated!"),
        Err(e) => println!("duplicate farm output refused: {e}"),
    }
}

#[test]
fn probe_fake_owner_zero_lockhash() {
    // A farm whose owner field is the blake2b hash of nothing real: can its
    // gold ever be spent? (Sanity: creation lets owner be arbitrary.)
    let mut w = World::new();
    let mut f = Farm::new([0xee; 32], name("ghost"));
    f.gold = 500;
    let (tx, _) = w.creation(1, encode(&f));
    // The owner must pay for their own farm: a ghost owner (a lock nobody can
    // satisfy) could never close the farm or spend its gold, so creation
    // refuses.
    let code = code(w.verify(&tx));
    assert_eq!(code, 46, "ghost-owner farm must be refused at creation");
}

/// Models an anyone-can-pay-style owner lock: a cell anybody may spend
/// (here: always-success, the same property ACP has for a capacity-preserving
/// spend). The farm script's owner check is "an input carries the owner's
/// lock hash" — it never asks whether that lock actually demanded a signature.
#[test]
fn probe_acp_owner_robbed_via_close() {
    use ckb_testtool::ckb_types::{
        bytes::Bytes,
        core::TransactionBuilder,
        packed::{CellInput, CellOutput},
    };
    let mut w = World::new();
    // Victim's farm. Owner = hash of the victim's anyone-can-pay lock.
    let victim_acp = w.wallet(1); // always-success: spendable by anybody
    let owner: [u8; 32] = victim_acp.calc_script_hash().unpack();
    let farm = Farm::new(owner, name("victim"));
    let cell = w.place(1, &farm, None);

    // The victim's ACP cell, holding some CKB.
    let acp_cell = CellOutput::new_builder()
        .capacity(ckb_testtool::ckb_types::core::Capacity::shannons(200_0000_0000).pack())
        .lock(victim_acp.clone())
        .build();
    let acp_point = w.ctx.create_cell(acp_cell.clone(), Bytes::new());

    // Attacker's lock (player 2). No signature from the victim anywhere.
    let attacker = w.wallet(2);

    // Attacker's tx: spend the farm (close) + spend the victim's ACP cell,
    // recreate the ACP cell with the same capacity (what ACP rules allow
    // without the owner's signature), take the farm's CKB.
    let stolen = CellOutput::new_builder()
        .capacity(ckb_testtool::ckb_types::core::Capacity::shannons(cell.capacity).pack())
        .lock(attacker)
        .build();
    let tx = TransactionBuilder::default()
        .input(CellInput::new(cell.out_point.clone(), 0))
        .input(CellInput::new(acp_point, 0))
        .output(acp_cell) // ACP cell preserved: ACP lock would pass
        .output(stolen) // farm's deposit goes to the attacker
        .output_data(Bytes::new().pack())
        .output_data(Bytes::new().pack())
        .build();
    let tx = w.ctx.complete_tx(tx);
    // Closing requires the owner to GAIN capacity; here the deposit goes to
    // the attacker and the owner nets zero, so the script refuses.
    let code = code(w.verify(&tx));
    assert_eq!(code, 46, "ACP-owner farm must not be closable by a stranger");
}
