//! Audit regression tests (Gemini 4 Neon, 2026-11-23):
//!
//! * OPEN-03 / GN-03: historical header day-stepping (time-travel counter reset)
//!   must not reset `mischief_today` or `help_today`, nor allow mischief with a
//!   timestamp predating the target plot's planting.
//! * OPEN-04 / GN-05 / FB-5: same-transaction `OP_MISCHIEF` + `OP_HELP` cancel-out
//!   and visitor-only zero-state-change spends must be rejected so strangers
//!   cannot churn a farm's outpoint without changing its state.

use farm_core::*;
use farm_tests::{act, name, World, T0, UNIT};

const RADISH: u8 = 1;
const DAY: u32 = HOURS_PER_DAY * UNIT;

fn plot_where(crop: u8, planted_at: u32, want: impl Fn(&Plot) -> bool) -> Plot {
    (1u32..)
        .map(|seed| Plot { crop, planted_at, seed, ..Plot::default() })
        .find(|plot| want(plot))
        .expect("some seed")
}

fn calm(plot: &Plot) -> bool {
    (KIND_WEED..=KIND_DRY).all(|k| natural_at(plot, k, UNIT).unwrap().is_none())
}

/// OPEN-03: A brand-new farm (`day = 0`) committed today cannot omit its own
/// block header and pass an older historical block header to step through past
/// days and reset `mischief_today` repeatedly.
#[test]
fn gn03_historical_header_day_stepping_is_refused() {
    let mut w = World::new();
    let old_planted = T0 - 20 * DAY;
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.day = T0 / DAY;
    ann.plots[0] = plot_where(RADISH, old_planted, calm);
    let ann = w.place(1, &ann, Some(T0));

    // Bob's freshly created farm (`day = 0`), committed today at T0.
    let bob = Farm::new(w.owner(2), name("bob"));
    let bob = w.place(2, &bob, Some(T0));

    // Attack 1: omit farm headers and pass a historical header from 10 days ago.
    let weed = act::mischief(1, 0, KIND_WEED);
    let mut draft = w.draft(&[(&ann, &weed), (&bob, &[])], &[2], Some(T0)).unwrap();
    draft.skip_farm_headers = true;
    draft.now = Some(T0 - 10 * DAY);
    assert_eq!(
        w.reject(&draft),
        Error::MissingHeader as i8,
        "daily-capped visit without visitor's own block header must be refused"
    );

    // Attack 2: mischief with a timestamp predating a settled plot's planting.
    let mut fresh_ann = Farm::new(w.owner(1), name("ann2"));
    fresh_ann.plots[0] = plot_where(RADISH, T0, calm);
    let fresh_ann = w.place(3, &fresh_ann, Some(T0));
    let dormant_bob = Farm::new(w.owner(2), name("dormant"));
    let dormant_bob = w.place(4, &dormant_bob, Some(T0 - 5 * DAY));

    let mut draft = w
        .draft(&[(&fresh_ann, &weed), (&dormant_bob, &[])], &[2], Some(T0))
        .unwrap();
    // Keep only dormant_bob's old header (T0 - 5 days) and drop fresh_ann's T0 header.
    draft.farms[0].0.block = None;
    draft.now = None;
    assert_eq!(
        w.reject(&draft),
        Error::NeedTime as i8,
        "mischief with now < plot.planted_at must be refused"
    );

    // Positive control: honest visit with visitor's block header passes and
    // immediately snaps `bob.day` to today (T0 / DAY), not a historical day.
    let cells = w.play(&[(&ann, &weed), (&bob, &[])], &[2], Some(T0 + 10), T0 + 20);
    assert_eq!(cells[1].farm().day, T0 / DAY);
    assert_eq!(cells[1].farm().mischief_today, 1);
}

/// OPEN-03: Natural-problem `OP_HELP` also anchors `day` to the visitor's own
/// block header, blocking multi-day historical header stepping on aged crops.
#[test]
fn gn03_help_also_requires_visitor_block_header() {
    let mut w = World::new();
    let old_planted = T0 - 5 * DAY;
    let plot = plot_where(RADISH, old_planted, |p| {
        natural_at(p, KIND_WEED, UNIT).unwrap().is_some()
    });
    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.day = T0 / DAY;
    ann.plots[0] = plot;
    let ann = w.place(1, &ann, Some(old_planted));

    let bob = Farm::new(w.owner(2), name("bob"));
    let bob = w.place(2, &bob, Some(T0));

    let help = act::help(1, 0, KIND_WEED);
    let mut draft = w.draft(&[(&ann, &help), (&bob, &[])], &[2], Some(T0)).unwrap();
    draft.skip_farm_headers = true;
    draft.now = Some(T0 - 2 * DAY);
    assert_eq!(
        w.reject(&draft),
        Error::MissingHeader as i8,
        "OP_HELP without visitor's own block header must be refused"
    );

    // Honest help with visitor's block header passes and records today's day.
    let cells = w.play(&[(&ann, &help), (&bob, &[])], &[2], Some(T0 + 10), T0 + 20);
    assert_eq!(cells[1].farm().day, T0 / DAY);
    assert_eq!(cells[1].farm().help_today, 1);
    assert_eq!(cells[1].farm().exp, EXP_HELP);
}

/// OPEN-04 / FB-5: Planting a weed/pest and immediately pulling it in the same
/// transaction leaves the visited farm unchanged and must be refused.
#[test]
fn gn04_same_tx_mischief_and_help_is_refused() {
    let mut w = World::new();
    let now = T0 + 10;
    let today = now / DAY;

    let mut ann = Farm::new(w.owner(1), name("ann"));
    ann.day = today;
    ann.plots[0] = plot_where(RADISH, T0, calm);
    let ann = w.place(1, &ann, Some(T0));
    let mut bob = Farm::new(w.owner(2), name("bob"));
    bob.day = today;
    let bob = w.place(2, &bob, Some(T0));

    let roundtrip = [act::mischief(1, 0, KIND_WEED), act::help(1, 0, KIND_WEED)].concat();
    assert_eq!(
        w.refused(&[(&ann, &roundtrip), (&bob, &[])], &[2], Some(now)),
        Error::BadAction
    );

    // Same for pests.
    let pest_rt = [act::mischief(1, 0, KIND_PEST), act::help(1, 0, KIND_PEST)].concat();
    assert_eq!(
        w.refused(&[(&ann, &pest_rt), (&bob, &[])], &[2], Some(now)),
        Error::BadAction
    );

    // Even when the target plot is still pending or on a day rollover, same-tx
    // mischief + help is still refused.
    let mut pending_ann = Farm::new(w.owner(1), name("pending"));
    pending_ann.plots[0] = Plot { crop: RADISH, ..Plot::default() };
    let pending_ann = w.place(3, &pending_ann, Some(T0));
    assert_eq!(
        w.refused(&[(&pending_ann, &roundtrip), (&bob, &[])], &[2], Some(now + DAY)),
        Error::BadAction
    );

    // Positive control: planting a weed in tx 1 and clearing it in tx 2 works.
    let cells = w.play(&[(&ann, &act::mischief(1, 0, KIND_WEED)), (&bob, &[])], &[2], Some(now), now + 5);
    let cells = w.play(
        &[(&cells[0], &act::help(1, 0, KIND_WEED)), (&cells[1], &[])],
        &[2],
        Some(now + 10),
        now + 15,
    );
    assert_eq!(cells[0].farm().plots[0].flags & F_FRIEND_WEED, 0);
    assert_eq!(cells[1].farm().exp, 0);
}
