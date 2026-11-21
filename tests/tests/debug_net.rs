//! Temporary: dump lock hashes / capacities around a two-farm steal.
use ckb_testtool::ckb_types::prelude::*;
use farm_core::*;
use farm_tests::{act, name, World, T0, UNIT};

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
fn dump_two_farm() {
    let mut w = World::new();
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.plots[0] = plot_where(RADISH, calm);
    let ann = w.place(1, &ann, Some(T0));
    let bob = Farm::new(w.owner(2), name("bob"));
    let bob = w.place(2, &bob, Some(T0));
    let ripe = T0 + 2 * HOUR;
    let draft = w.draft(&[(&ann, &act::steal(1, 0)), (&bob, &[])], &[2], Some(ripe)).unwrap();
    let tx = w.build(&draft);
    let bob_owner: [u8; 32] = w.owner(2);
    println!("bob owner hash: {}", hex(&bob_owner));
    for (i, io) in tx.inputs().into_iter().enumerate() {
        let point = io.previous_output();
        if let Some((cell, _)) = w.ctx.get_cell(&point) {
            let cap: u64 = cell.capacity().unpack();
            let lh = cell.lock().calc_script_hash();
            println!("input {i}: capacity {cap} lock-hash {}", hex(lh.as_slice()));
        } else {
            println!("input {i}: unknown cell");
        }
    }
    for (i, o) in tx.outputs().into_iter().enumerate() {
        let cap: u64 = o.capacity().unpack();
        println!("output {i}: capacity {cap} lock-hash {}", hex(o.calc_lock_hash().as_slice()));
    }
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
