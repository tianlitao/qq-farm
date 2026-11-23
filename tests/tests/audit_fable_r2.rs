//! Audit round five (Fable 5.2, 2026-11-23): the visitor that leaves.
//!
//! A visitor action names the visitor's farm by its input index, and the
//! visitor's half of the action (stolen fruit, the daily counters) is written
//! by the visitor farm's own script run. A farm that is being CLOSED in the
//! same transaction is still among the inputs, so it can be named as the
//! visitor — and the build before this round let it: `close` never looked at
//! the credits, so the day's mischief limit did not count on the way out.
//! A close is now refused (54) while another farm names the closing farm as
//! its visitor.
//!
//! To see the old build accept these:
//! `FARM_BINARY=/path/to/old/farm cargo test -p farm-tests --test audit_fable_r2`.

use farm_core::*;
use farm_tests::{act, code, encode, name, Draft, FarmCell, World, T0, UNIT};

const RADISH: u8 = 1;
const HOUR: u32 = UNIT;
const E_NOT_OWNER: i8 = 46;
const E_CLOSING_VISITOR: i8 = 54;

fn plot_where(crop: u8, want: impl Fn(&Plot) -> bool) -> Plot {
    (1u32..)
        .map(|seed| Plot { crop, planted_at: T0, seed, ..Plot::default() })
        .find(|plot| want(plot))
        .expect("some seed")
}

fn calm(plot: &Plot) -> bool {
    (KIND_WEED..=KIND_DRY).all(|k| natural_at(plot, k, UNIT).unwrap().is_none())
}

/// The visited farm's honest output, with the visitor farm (input 1) closed.
/// `signers` are the players whose wallet is among the inputs.
fn visit_and_leave(w: &mut World, host: &FarmCell, visitor: &FarmCell, actions: &[u8], signers: &[u8], now: u32) -> Draft {
    let inputs = [
        FarmInput { index: 0, id: host.id, state: &host.state, block: host.block, actions },
        FarmInput { index: 1, id: visitor.id, state: &visitor.state, block: visitor.block, actions: &[] },
    ];
    // Only the visited farm's half: the visitor's half has nowhere to land.
    let outcome = transition(&inputs, 0, Clock { now, unit: UNIT }).expect("the visited farm's rules allow it");
    let state = encode(&outcome.farm);
    let capacity = host.capacity.max(w.farm_capacity(&state));
    Draft {
        farms: vec![(host.clone(), actions.to_vec()), (visitor.clone(), Vec::new())],
        signers: signers.to_vec(),
        now: Some(now),
        skip_farm_headers: false,
        outputs: vec![Some((state, capacity)), None],
    }
}

/// A visitor who has used up the day's mischief closes their farm in the very
/// transaction that plants one more weed. The rules refuse the weed when the
/// visitor's farm stays (`MischiefLimit`); leaving must not get around it.
#[test]
fn a_closing_farm_cannot_plant_a_weed() {
    let mut w = World::new();
    let now = T0 + 10;
    let today = now / (HOURS_PER_DAY * UNIT);

    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.day = today;
    ann.plots[0] = Plot { crop: RADISH, planted_at: T0, seed: 1, ..Plot::default() };
    let ann = w.place(1, &ann, Some(T0));
    let mut bob = Farm::new(w.owner(2), name("bob"));
    bob.day = today;
    bob.mischief_today = MISCHIEF_PER_DAY;
    let bob = w.place(2, &bob, Some(T0));

    let weed = act::mischief(1, 0, KIND_WEED);
    // With Bob's farm staying, the rules and the script say no.
    assert_eq!(w.refused(&[(&ann, &weed), (&bob, &[])], &[2], Some(now)), Error::MischiefLimit);

    let draft = visit_and_leave(&mut w, &ann, &bob, &weed, &[2], now);
    assert_eq!(w.reject(&draft), E_CLOSING_VISITOR, "a farm that leaves cannot be the visitor");

    // Nor with the day's allowance untouched: the count has nowhere to land.
    let fresh = Farm::new(w.owner(2), name("bob3"));
    let fresh = w.place(5, &fresh, Some(T0));
    let draft = visit_and_leave(&mut w, &ann, &fresh, &weed, &[2], now);
    assert_eq!(w.reject(&draft), E_CLOSING_VISITOR);
}

/// The same door for stealing and helping: the fruit and the experience would
/// have no farm to land in.
#[test]
fn a_closing_farm_cannot_steal_or_help() {
    let mut w = World::new();
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.plots[0] = plot_where(RADISH, calm);
    ann.plots[1] = Plot { flags: F_FRIEND_WEED, ..plot_where(RADISH, calm) };
    let ann = w.place(1, &ann, Some(T0));
    let bob = Farm::new(w.owner(2), name("bob"));
    let bob = w.place(2, &bob, Some(T0));
    let ripe = T0 + 2 * HOUR;

    let steal = act::steal(1, 0);
    let draft = visit_and_leave(&mut w, &ann, &bob, &steal, &[2], ripe);
    assert_eq!(w.reject(&draft), E_CLOSING_VISITOR);

    let help = act::help(1, 1, KIND_WEED);
    let draft = visit_and_leave(&mut w, &ann, &bob, &help, &[2], ripe);
    assert_eq!(w.reject(&draft), E_CLOSING_VISITOR);

    // Staying, Bob steals as before.
    let cells = w.play(&[(&ann, &steal), (&bob, &[])], &[2], Some(ripe), ripe + 5);
    assert_eq!(cells[1].farm().fruits[0], steal_amount(RADISH).unwrap() as u16);
}

/// The fix must not get in the way of an honest close: a farm with a planting
/// still pending (no header of its own in the transaction) closes, alone or
/// beside another farm of the same owner, and beside farms that visit each
/// other without naming it.
#[test]
fn honest_closes_still_pass() {
    let mut w = World::new();
    let now = T0 + 10;
    let mut pending = Farm::new(w.owner(1), name("pending"));
    pending.plots[0] = Plot { crop: RADISH, ..Plot::default() };
    assert!(has_pending(&pending));
    let pending = w.place(1, &pending, None);
    let other = Farm::new(w.owner(1), name("other"));
    let other = w.place(2, &other, None);

    // Alone, without any header dep.
    let mut draft = w.draft(&[(&other, &[])], &[1], None).unwrap();
    draft.outputs[0] = None;
    let tx = w.build(&draft);
    w.verify(&tx).expect("a plain close");

    // Two at once, one of them with a pending planting and no header.
    let draft = Draft {
        farms: vec![(pending.clone(), Vec::new()), (other.clone(), Vec::new())],
        signers: vec![1],
        now: None,
        skip_farm_headers: false,
        outputs: vec![None, None],
    };
    let tx = w.build(&draft);
    w.verify(&tx).expect("closing a farm with a pending planting");

    // Beside a visit between two other farms.
    let mut ann = Farm::new(w.owner(3), name("ann"));
    ann.plots[0] = Plot { crop: RADISH, planted_at: T0, seed: 1, ..Plot::default() };
    let ann = w.place(3, &ann, Some(T0));
    let bob = Farm::new(w.owner(2), name("bob"));
    let bob = w.place(4, &bob, Some(T0));
    let weed = act::mischief(2, 0, KIND_WEED);
    let mut draft = w.draft(&[(&other, &[]), (&ann, &weed), (&bob, &[])], &[1, 2], Some(now)).unwrap();
    draft.outputs[0] = None;
    let tx = w.build(&draft);
    w.verify(&tx).expect("a close beside somebody else's visit");
}

/// What must hold either way: a stranger cannot make somebody ELSE's farm the
/// leaving visitor. Closing it needs its owner.
#[test]
fn a_stranger_cannot_close_a_farm_as_the_visitor() {
    let mut w = World::new();
    let now = T0 + 10;
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.plots[0] = Plot { crop: RADISH, planted_at: T0, seed: 1, ..Plot::default() };
    let ann = w.place(1, &ann, Some(T0));
    let carol = Farm::new(w.owner(3), name("carol"));
    let carol = w.place(3, &carol, Some(T0));

    // Player 2 signs; Carol's farm is named as the visitor and closed.
    let weed = act::mischief(1, 0, KIND_WEED);
    let draft = visit_and_leave(&mut w, &ann, &carol, &weed, &[2], now);
    let tx = w.build(&draft);
    assert_eq!(code(w.verify(&tx)), E_NOT_OWNER, "only Carol closes Carol's farm");
}

/// And nobody's farm is made the visitor while it stays: the visitor's script
/// applies the credit and asks for its owner.
#[test]
fn a_stranger_cannot_visit_in_somebody_elses_name() {
    let mut w = World::new();
    let now = T0 + 10;
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.plots[0] = Plot { crop: RADISH, planted_at: T0, seed: 1, ..Plot::default() };
    let ann = w.place(1, &ann, Some(T0));
    let carol = Farm::new(w.owner(3), name("carol"));
    let carol = w.place(3, &carol, Some(T0));

    let weed = act::mischief(1, 0, KIND_WEED);
    let draft = w.draft(&[(&ann, &weed), (&carol, &[])], &[2], Some(now)).expect("the rules allow the weed");
    assert_eq!(w.reject(&draft), E_NOT_OWNER, "Carol's farm visits only with Carol's signature");
}

/// The daily mischief limit is kept per farm. A player with a second farm has
/// a second allowance; this prints it so the report states a measured fact.
#[test]
fn probe_mischief_limit_is_per_farm() {
    let mut w = World::new();
    let now = T0 + 10;
    let today = now / (HOURS_PER_DAY * UNIT);
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.day = today;
    ann.plots[0] = Plot { crop: RADISH, planted_at: T0, seed: 1, ..Plot::default() };
    let ann = w.place(1, &ann, Some(T0));
    let mut spent = Farm::new(w.owner(2), name("bob"));
    spent.day = today;
    spent.mischief_today = MISCHIEF_PER_DAY;
    let _spent = w.place(2, &spent, Some(T0));
    let mut second = Farm::new(w.owner(2), name("bob2"));
    second.day = today;
    let second = w.place(4, &second, Some(T0));

    let weed = act::mischief(1, 0, KIND_WEED);
    match w.draft(&[(&ann, &weed), (&second, &[])], &[2], Some(now)) {
        Err(e) => println!("R5-F3 ok: the second farm shares the limit: {e:?}"),
        Ok(draft) => {
            let tx = w.build(&draft);
            match w.verify(&tx) {
                Ok(_) => println!("R5-F3 CONFIRMED: the same player's second farm has its own {MISCHIEF_PER_DAY} a day"),
                Err(e) => println!("R5-F3 ok: refused by the script: {e}"),
            }
        }
    }
}
