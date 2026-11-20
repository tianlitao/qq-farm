//! The farm script, run on CKB-VM.
//!
//! Each test plays honest transactions through `World::play` (which fails if
//! the script rejects them) and then checks what the script must refuse.

use ckb_testtool::ckb_types::prelude::*;
use farm_core::*;
use farm_tests::{act, code, encode, name, FarmCell, World, T0, UNIT};

// Script errors, see contracts/farm/src/main.rs.
const E_NOT_A_FARM: i8 = 42;
const E_LOCK: i8 = 44;
const E_CAPACITY: i8 = 45;
const E_NOT_OWNER: i8 = 46;
const E_WRONG_STATE: i8 = 47;
const E_BAD_NEW_FARM: i8 = 48;
const E_NOTHING_HAPPENED: i8 = 51;
const E_CLOSE_WITH_ACTIONS: i8 = 52;

const RADISH: u8 = 1;
const TOMATO: u8 = 6;
const ANN: u8 = 1;
const BOB: u8 = 2;
const HOUR: u32 = UNIT;

fn new_farm(w: &mut World, player: u8) -> Farm {
    Farm::new(w.owner(player), name("farm"))
}

/// A plot planted at T0 whose weather satisfies `want`.
fn plot_where(crop: u8, want: impl Fn(&Plot) -> bool) -> Plot {
    (1u32..)
        .map(|seed| Plot { crop, planted_at: T0, seed, ..Plot::default() })
        .find(|plot| want(plot))
        .expect("some seed")
}

fn has(plot: &Plot, kind: u8) -> bool {
    natural_at(plot, kind, UNIT).unwrap().is_some()
}

fn calm(plot: &Plot) -> bool {
    !has(plot, KIND_WEED) && !has(plot, KIND_PEST) && !has(plot, KIND_DRY)
}

/// Ann's farm with one plot, and Bob's fresh farm.
fn neighbours(w: &mut World, plot: Plot) -> (FarmCell, FarmCell) {
    let mut ann = new_farm(w, ANN);
    ann.plots[0] = plot;
    let bob = new_farm(w, BOB);
    (w.place(ANN, &ann, Some(T0)), w.place(BOB, &bob, Some(T0)))
}

#[test]
fn a_farm_is_born_in_the_starting_state() {
    let mut w = World::new();
    let farm = new_farm(&mut w, ANN);
    let (tx, _) = w.creation(ANN, encode(&farm));
    w.verify(&tx).expect("an honest creation");

    let mut rich = farm.clone();
    rich.gold = 1_000_000;
    let (tx, _) = w.creation(ANN, encode(&rich));
    assert_eq!(code(w.verify(&tx)), E_BAD_NEW_FARM);

    let mut planted = farm.clone();
    planted.plots[0] = Plot { crop: 16, planted_at: 1, ..Plot::default() };
    let (tx, _) = w.creation(ANN, encode(&planted));
    assert_eq!(code(w.verify(&tx)), E_BAD_NEW_FARM);

    let mut big = farm;
    big.land = 18;
    let (tx, _) = w.creation(ANN, encode(&big));
    assert_eq!(code(w.verify(&tx)), E_BAD_NEW_FARM);
}

#[test]
fn a_farm_cell_must_keep_the_farm_lock() {
    let mut w = World::new();
    let farm = new_farm(&mut w, ANN);
    let (tx, _) = w.creation(ANN, encode(&farm));
    let wallet = w.wallet(ANN);
    let output = tx.output(0).unwrap().as_builder().lock(wallet).build();
    let tx = tx.as_advanced_builder().set_outputs(vec![output]).build();
    assert_eq!(code(w.verify(&tx)), E_LOCK);
}

#[test]
fn the_farm_lock_only_guards_farm_cells() {
    use ckb_testtool::ckb_types::{
        bytes::Bytes,
        core::TransactionBuilder,
        packed::{CellInput, CellOutput},
    };
    let mut w = World::new();
    let lock = w.farm_lock();
    let cell = CellOutput::new_builder().capacity(500_0000_0000u64).lock(lock).build();
    let out_point = w.ctx.create_cell(cell.clone(), Bytes::new());
    let tx = TransactionBuilder::default()
        .input(CellInput::new(out_point, 0))
        .output(cell.as_builder().lock(w.wallet(BOB)).build())
        .output_data(Bytes::new().pack())
        .build();
    let tx = w.ctx.complete_tx(tx);
    assert_eq!(code(w.verify(&tx)), E_NOT_A_FARM);
}

#[test]
fn sow_wait_and_harvest() {
    let mut w = World::new();
    let farm = new_farm(&mut w, ANN);
    let cell = w.place(ANN, &farm, None);

    let actions = [act::buy(RADISH, 2), act::plant(0, RADISH), act::plant(1, RADISH)].concat();
    let cells = w.play(&[(&cell, &actions)], &[ANN], None, T0);
    let farm = cells[0].farm();
    assert_eq!(farm.gold, INIT_GOLD - 160);
    assert_eq!(farm.seeds[0], 0);
    assert!(farm.plots[0].is_pending() && farm.plots[1].is_pending());

    // The planting block is what starts the clock.
    let ripe = T0 + 2 * HOUR;
    let harvest = [act::harvest(0), act::harvest(1)].concat();
    assert_eq!(w.refused(&[(&cells[0], &harvest)], &[ANN], Some(ripe - 1)), Error::NotRipe);
    assert_eq!(w.refused(&[(&cells[0], &harvest)], &[ANN], None), Error::NotRipe);

    // Without the header of the planting block there is no telling.
    let mut draft = w.draft(&[(&cells[0], &harvest)], &[ANN], Some(ripe)).unwrap();
    draft.skip_farm_headers = true;
    assert_eq!(w.reject(&draft), Error::MissingHeader as i8);

    let cells = w.play(&[(&cells[0], &harvest)], &[ANN], Some(ripe), ripe + 10);
    let farm = cells[0].farm();
    assert!(farm.plots[0].is_withered());
    assert_eq!(farm.exp, 12);
    // The weather came with the planting block; `neglect_costs_fruit` pins it.
    assert!((24..=32).contains(&farm.fruits[0]), "fruit: {}", farm.fruits[0]);

    // Sell the lot, clear the field.
    let actions = [act::sell(RADISH, farm.fruits[0]), act::shovel(0), act::shovel(1)].concat();
    let cells = w.play(&[(&cells[0], &actions)], &[ANN], None, ripe + 20);
    let after = cells[0].farm();
    assert_eq!(after.gold, farm.gold + 10 * farm.fruits[0] as u64);
    assert_eq!(after.exp, 12 + 2 * EXP_SHOVEL);
    assert!(after.plots[0].is_empty() && after.plots[1].is_empty());
}

#[test]
fn only_the_owner_farms() {
    let mut w = World::new();
    let farm = new_farm(&mut w, ANN);
    let cell = w.place(ANN, &farm, None);
    let actions = act::buy(RADISH, 1);

    let mut draft = w.draft(&[(&cell, &actions)], &[ANN], None).unwrap();
    draft.signers = vec![];
    assert_eq!(w.reject(&draft), E_NOT_OWNER);
    draft.signers = vec![BOB];
    assert_eq!(w.reject(&draft), E_NOT_OWNER);
    draft.signers = vec![ANN];
    let tx = w.build(&draft);
    w.verify(&tx).expect("the owner may");
}

#[test]
fn the_output_is_what_the_rules_say() {
    let mut w = World::new();
    let farm = new_farm(&mut w, ANN);
    let cell = w.place(ANN, &farm, None);
    let actions = act::buy(RADISH, 1);
    let honest = w.draft(&[(&cell, &actions)], &[ANN], None).unwrap();

    let bend = |change: &dyn Fn(&mut Farm)| {
        let mut farm = Farm::decode(&honest.outputs[0].as_ref().unwrap().0).unwrap();
        change(&mut farm);
        encode(&farm)
    };
    for state in [
        bend(&|f| f.gold += 1),
        bend(&|f| f.exp += 1),
        bend(&|f| f.seeds[0] += 1),
        bend(&|f| f.seeds[15] = 1),
        bend(&|f| f.fruits[3] = 9),
        bend(&|f| f.owner = [7; 32]),
        bend(&|f| f.dog_until = u32::MAX),
        bend(&|f| f.land = 7),
        bend(&|f| f.plots[5] = Plot { crop: 1, planted_at: 1, ..Plot::default() }),
    ] {
        let mut draft = w.draft(&[(&cell, &actions)], &[ANN], None).unwrap();
        let capacity = w.farm_capacity(&state);
        draft.outputs[0] = Some((state, capacity));
        assert_eq!(w.reject(&draft), E_WRONG_STATE);
    }
}

#[test]
fn what_the_rules_refuse_the_script_refuses() {
    let mut w = World::new();
    let mut farm = new_farm(&mut w, ANN);
    farm.plots[0] = plot_where(RADISH, calm);
    let cell = w.place(ANN, &farm, Some(T0));
    let late = Some(T0 + 100 * HOUR);

    let cases: Vec<(Vec<u8>, Error)> = vec![
        (act::buy(RADISH, 7), Error::NotEnoughGold),
        (act::buy(3, 1), Error::LevelTooLow),
        (act::buy(0, 1), Error::BadCrop),
        (act::buy(17, 1), Error::BadCrop),
        (act::buy(RADISH, 0), Error::BadAction),
        (act::plant(1, RADISH), Error::NotEnoughSeeds),
        ([act::buy(RADISH, 1), act::plant(0, RADISH)].concat(), Error::PlotNotEmpty),
        ([act::buy(RADISH, 1), act::plant(6, RADISH)].concat(), Error::BadPlot),
        (act::harvest(1), Error::PlotEmpty),
        (act::shovel(1), Error::PlotEmpty),
        (act::sell(RADISH, 1), Error::NotEnoughFruit),
        (act::expand(), Error::LevelTooLow),
        (act::feed_dog(), Error::LevelTooLow),
        (act::clear(0, KIND_WEED), Error::NothingToClear),
        (act::clear(0, 3), Error::BadAction),
        (vec![99], Error::BadAction),
        (vec![OP_BUY_SEED, 1], Error::BadAction),
        // A farm cannot visit itself.
        (act::steal(0, 0), Error::BadActor),
        // Nor can a wallet cell.
        (act::steal(1, 0), Error::BadActor),
    ];
    for (actions, reason) in cases {
        assert_eq!(w.refused(&[(&cell, &actions)], &[ANN], late), reason, "{actions:?}");
    }
}

#[test]
fn neglect_costs_fruit() {
    let mut w = World::new();
    let mut farm = new_farm(&mut w, ANN);
    // Weeds and pests, never dry. The weed gets pulled, the pest stays.
    farm.plots[0] = plot_where(RADISH, |p| has(p, KIND_WEED) && has(p, KIND_PEST) && !has(p, KIND_DRY));
    farm.plots[1] = plot_where(RADISH, calm);
    let weed_at = natural_at(&farm.plots[0], KIND_WEED, UNIT).unwrap().unwrap() as u32;
    let ripe = T0 + 2 * HOUR;
    assert!(weed_at > T0 && weed_at < ripe);
    let cell = w.place(ANN, &farm, Some(T0));

    // Not before it has shown up.
    let pull = act::clear(0, KIND_WEED);
    assert_eq!(w.refused(&[(&cell, &pull)], &[ANN], Some(weed_at - 1)), Error::NothingToClear);
    let cells = w.play(&[(&cell, &pull)], &[ANN], Some(weed_at), weed_at + 5);
    assert_eq!(cells[0].farm().exp, EXP_CLEAR);
    // Once.
    assert_eq!(w.refused(&[(&cells[0], &pull)], &[ANN], Some(ripe)), Error::NothingToClear);

    let harvest = [act::harvest(0), act::harvest(1)].concat();
    let cells = w.play(&[(&cells[0], &harvest)], &[ANN], Some(ripe), ripe + 5);
    // 16 from the calm plot, 16 less a tenth (rounded down: 1) from the other.
    assert_eq!(cells[0].farm().fruits[0], 16 + 15);
}

#[test]
fn a_neighbour_steals_ripe_fruit() {
    let mut w = World::new();
    let (ann, bob) = neighbours(&mut w, plot_where(RADISH, calm));
    let ripe = T0 + 2 * HOUR;
    // Ann's farm is input 0, Bob's is input 1.
    let steal = act::steal(1, 0);

    assert_eq!(w.refused(&[(&ann, &steal), (&bob, &[])], &[BOB], Some(ripe - 1)), Error::NotRipe);

    // Bob signs, Ann does not have to.
    let honest = w.draft(&[(&ann, &steal), (&bob, &[])], &[BOB], Some(ripe)).unwrap();
    let mut draft = w.draft(&[(&ann, &steal), (&bob, &[])], &[BOB], Some(ripe)).unwrap();
    draft.signers = vec![];
    assert_eq!(w.reject(&draft), E_NOT_OWNER);
    // Ann signing instead does not make Bob a thief.
    draft.signers = vec![ANN];
    assert_eq!(w.reject(&draft), E_NOT_OWNER);

    // Bob's farm gets exactly what Ann's lost.
    let changes: Vec<(usize, Box<dyn Fn(&mut Farm)>)> = vec![
        (0, Box::new(|f: &mut Farm| f.plots[0].stolen = 0)),
        (0, Box::new(|f: &mut Farm| f.plots[0].thieves = 0)),
        (1, Box::new(|f: &mut Farm| f.fruits[0] += 1)),
        (1, Box::new(|f: &mut Farm| f.fruits[0] = 0)),
        (1, Box::new(|f: &mut Farm| f.gold += 1)),
    ];
    for (who, change) in changes {
        let mut draft = w.draft(&[(&ann, &steal), (&bob, &[])], &[BOB], Some(ripe)).unwrap();
        let (state, capacity) = honest.outputs[who].clone().unwrap();
        let mut farm = Farm::decode(&state).unwrap();
        change(&mut farm);
        draft.outputs[who] = Some((encode(&farm), capacity));
        assert_eq!(w.reject(&draft), E_WRONG_STATE);
    }

    let cells = w.play(&[(&ann, &steal), (&bob, &[])], &[BOB], Some(ripe), ripe + 5);
    let (ann, bob) = (&cells[0], &cells[1]);
    assert_eq!(ann.farm().plots[0].stolen, 1);
    assert_eq!(bob.farm().fruits[0], 1);
    assert_eq!(bob.farm().gold, INIT_GOLD);

    // Once per thief and season.
    let again = [(ann, &steal[..]), (bob, &[][..])];
    assert_eq!(w.refused(&again, &[BOB], Some(ripe + 60)), Error::AlreadyStolen);

    // Ann harvests what is left.
    let cells = w.play(&[(ann, &act::harvest(0))], &[ANN], Some(ripe + 60), ripe + 70);
    assert_eq!(cells[0].farm().fruits[0], 15);
}

#[test]
fn thieves_cannot_strip_a_field() {
    let mut w = World::new();
    let plot = plot_where(RADISH, calm);
    let cap = steal_cap(RADISH).unwrap();
    let mut ann = new_farm(&mut w, ANN);
    ann.plots[0] = Plot { stolen: cap, ..plot };
    let ann = w.place(ANN, &ann, Some(T0));
    let bob = new_farm(&mut w, BOB);
    let bob = w.place(BOB, &bob, Some(T0));
    let ripe = Some(T0 + 2 * HOUR);
    assert_eq!(
        w.refused(&[(&ann, &act::steal(1, 0)), (&bob, &[])], &[BOB], ripe),
        Error::NothingLeftToSteal
    );
}

#[test]
fn a_fed_dog_guards_the_farm() {
    let mut w = World::new();
    let ripe = T0 + 2 * HOUR;
    let bob_id = [BOB; 32];
    let guarded = plot_where(RADISH, |p| calm(p) && dog_blocks(p, &bob_id));
    let unguarded = plot_where(RADISH, |p| calm(p) && !dog_blocks(p, &bob_id));

    let mut ann = new_farm(&mut w, ANN);
    ann.plots[0] = guarded;
    ann.plots[1] = unguarded;
    ann.exp = exp_for_level(DOG_LEVEL) as u32;
    // No header at all in the first transaction: the plots are long settled.
    let ann = w.place(ANN, &ann, None);
    let bob = new_farm(&mut w, BOB);
    let bob = w.place(BOB, &bob, Some(T0));

    // Feeding needs a clock.
    assert_eq!(w.refused(&[(&ann, &act::feed_dog())], &[ANN], None), Error::NeedTime);
    let cells = w.play(&[(&ann, &act::feed_dog())], &[ANN], Some(ripe), ripe + 5);
    let ann = &cells[0];
    assert_eq!(ann.farm().gold, INIT_GOLD - DOG_FOOD_PRICE);
    assert_eq!(ann.farm().dog_until, ripe + 24 * HOUR);

    let on_guard = Some(ripe + HOUR);
    assert_eq!(
        w.refused(&[(ann, &act::steal(1, 0)), (&bob, &[])], &[BOB], on_guard),
        Error::DogOnGuard
    );
    // The dog cannot be everywhere.
    w.draft(&[(ann, &act::steal(1, 1)), (&bob, &[])], &[BOB], on_guard).expect("the other plot");
    // And it gets hungry.
    let hungry = Some(ripe + 24 * HOUR);
    w.play(&[(ann, &act::steal(1, 0)), (&bob, &[])], &[BOB], hungry, ripe + 25 * HOUR);
}

#[test]
fn neighbours_help_and_make_mischief() {
    let mut w = World::new();
    let plot = plot_where(TOMATO, |p| has(p, KIND_DRY) && !has(p, KIND_WEED) && !has(p, KIND_PEST));
    let dry_at = natural_at(&plot, KIND_DRY, UNIT).unwrap().unwrap() as u32;
    let (ann, bob) = neighbours(&mut w, plot);

    // Bob waters Ann's tomato and drops a weed while he is at it.
    let actions = [act::help(1, 0, KIND_DRY), act::mischief(1, 0, KIND_WEED)].concat();
    let cells = w.play(&[(&ann, &actions), (&bob, &[])], &[BOB], Some(dry_at), dry_at + 5);
    let (ann, bob) = (&cells[0], &cells[1]);
    let plot = ann.farm().plots[0];
    assert_ne!(plot.flags & F_DRY_CLEARED, 0);
    assert_ne!(plot.flags & F_FRIEND_WEED, 0);
    assert_eq!(bob.farm().exp, EXP_HELP);
    assert_eq!((bob.farm().help_today, bob.farm().mischief_today), (1, 1));
    assert_eq!(bob.farm().day, dry_at / (24 * HOUR));

    // The same weed twice does not fit.
    let more = act::mischief(1, 0, KIND_WEED);
    assert_eq!(w.refused(&[(ann, &more), (bob, &[])], &[BOB], Some(dry_at)), Error::AlreadyThere);
    // Nobody can dry out a field.
    let dry = act::mischief(1, 0, KIND_DRY);
    assert_eq!(w.refused(&[(ann, &dry), (bob, &[])], &[BOB], Some(dry_at)), Error::BadAction);

    // Ann pulls Bob's weed herself: no experience for that.
    let cells = w.play(&[(ann, &act::clear(0, KIND_WEED))], &[ANN], Some(dry_at), dry_at + 9);
    assert_eq!(cells[0].farm().exp, 0);
    assert_eq!(cells[0].farm().plots[0].flags & F_FRIEND_WEED, 0);
}

#[test]
fn mischief_has_a_daily_limit() {
    let mut w = World::new();
    let now = T0 + HOUR;
    let today = now / (24 * HOUR);
    let mut ann = new_farm(&mut w, ANN);
    ann.plots[0] = plot_where(TOMATO, calm);
    let ann = w.place(ANN, &ann, Some(T0));
    let mut bob = new_farm(&mut w, BOB);
    bob.day = today;
    bob.mischief_today = MISCHIEF_PER_DAY;
    bob.help_today = HELP_EXP_PER_DAY;
    let bob = w.place(BOB, &bob, Some(T0));

    let pest = act::mischief(1, 0, KIND_PEST);
    assert_eq!(w.refused(&[(&ann, &pest), (&bob, &[])], &[BOB], Some(now)), Error::MischiefLimit);
    // Tomorrow is another day, once a block proves it has come.
    let tomorrow = (today + 1) * 24 * HOUR;
    let cells = w.play(&[(&ann, &pest), (&bob, &[])], &[BOB], Some(tomorrow), tomorrow + 5);
    let bob = cells[1].farm();
    assert_eq!((bob.day, bob.mischief_today, bob.help_today), (today + 1, 1, 0));
}

#[test]
fn some_crops_grow_back() {
    let mut w = World::new();
    let mut farm = new_farm(&mut w, ANN);
    farm.plots[0] = plot_where(TOMATO, calm);
    let cell = w.place(ANN, &farm, Some(T0));

    let first = T0 + 7 * HOUR;
    let cells = w.play(&[(&cell, &act::harvest(0))], &[ANN], Some(first), first + 30);
    let farm = cells[0].farm();
    assert_eq!(farm.fruits[TOMATO as usize - 1], 22);
    assert_eq!((farm.plots[0].season, farm.plots[0].is_pending()), (1, true));

    // The second season starts with the block of the first harvest.
    let second = first + 30 + 4 * HOUR;
    assert_eq!(w.refused(&[(&cells[0], &act::harvest(0))], &[ANN], Some(second - 1)), Error::NotRipe);
    let cells = w.play(&[(&cells[0], &act::harvest(0))], &[ANN], Some(second), second + 5);
    let farm = cells[0].farm();
    assert!(farm.plots[0].is_withered());
    assert_eq!(farm.exp, 40);
    assert!(farm.fruits[TOMATO as usize - 1] >= 22 + 16);

    assert_eq!(w.refused(&[(&cells[0], &act::harvest(0))], &[ANN], Some(second)), Error::Withered);
}

#[test]
fn land_can_be_bought() {
    let mut w = World::new();
    let mut farm = new_farm(&mut w, ANN);
    farm.exp = exp_for_level(3) as u32;
    farm.gold = 2_100;
    let cell = w.place(ANN, &farm, None);
    let cells = w.play(&[(&cell, &act::expand())], &[ANN], None, T0);
    let farm = cells[0].farm();
    assert_eq!((farm.land, farm.gold), (7, 100));
    assert_eq!(cells[0].state.len(), cell.state.len() + PLOT_LEN);
    assert!(cells[0].capacity > cell.capacity);
    assert_eq!(w.refused(&[(&cells[0], &act::expand())], &[ANN], None), Error::LevelTooLow);
}

#[test]
fn ckb_stays_in_the_farm() {
    let mut w = World::new();
    let farm = new_farm(&mut w, ANN);
    let cell = w.place_with(ANN, &farm, None, 100);
    let actions = act::buy(RADISH, 1);
    let mut draft = w.draft(&[(&cell, &actions)], &[ANN], None).unwrap();
    draft.outputs[0].as_mut().unwrap().1 -= 1;
    assert_eq!(w.reject(&draft), E_CAPACITY);
}

#[test]
fn a_farm_cannot_be_spent_for_nothing() {
    let mut w = World::new();
    let (ann, bob) = neighbours(&mut w, plot_where(RADISH, calm));
    // Bob drags Ann's farm into a transaction that does nothing to it.
    let draft = w.draft(&[(&ann, &[]), (&bob, &act::buy(RADISH, 1))], &[BOB], None).unwrap();
    assert_eq!(w.reject(&draft), E_NOTHING_HAPPENED);
    let draft = w.draft(&[(&ann, &[])], &[ANN], None).unwrap();
    assert_eq!(w.reject(&draft), E_NOTHING_HAPPENED);
}

#[test]
fn only_the_owner_closes_a_farm() {
    let mut w = World::new();
    let farm = new_farm(&mut w, ANN);
    let cell = w.place(ANN, &farm, None);

    let mut draft = w.draft(&[(&cell, &[])], &[ANN], None).unwrap();
    draft.outputs[0] = None;
    let tx = w.build(&draft);
    w.verify(&tx).expect("the owner closes the farm");

    draft.signers = vec![BOB];
    assert_eq!(w.reject(&draft), E_NOT_OWNER);

    let mut draft = w.draft(&[(&cell, &act::buy(RADISH, 1))], &[ANN], None).unwrap();
    draft.outputs[0] = None;
    assert_eq!(w.reject(&draft), E_CLOSE_WITH_ACTIONS);
}

#[test]
fn a_farm_can_be_renamed() {
    let mut w = World::new();
    let farm = new_farm(&mut w, ANN);
    let cell = w.place(ANN, &farm, None);
    let cells = w.play(&[(&cell, &act::rename(name("Sunny Acres")))], &[ANN], None, T0);
    assert_eq!(cells[0].farm().name, name("Sunny Acres"));
}

#[test]
fn worlds_do_not_mix() {
    let mut w = World::new();
    let (ann, bob) = neighbours(&mut w, plot_where(RADISH, calm));
    let ripe = Some(T0 + 2 * HOUR);
    let steal = act::steal(1, 0);
    let buy = act::buy(RADISH, 1);
    let draft = w.draft(&[(&ann, &steal), (&bob, &buy)], &[BOB], ripe).unwrap();
    let tx = w.build(&draft);
    w.verify(&tx).expect("same world");

    // The same with Bob's farm in a slower world: there it is fine by itself,
    // but Ann's farm does not see it.
    let farm = new_farm(&mut w, BOB);
    let slow = w.place_in(BOB, &farm, Some(T0), 0, 3600);
    let alone = transition(
        &[FarmInput { index: 1, id: slow.id, state: &slow.state, block: slow.block, actions: &buy }],
        0,
        Clock { now: T0 + 2 * HOUR, unit: 3600 },
    )
    .unwrap();
    let mut draft = w.draft(&[(&ann, &steal), (&bob, &buy)], &[BOB], ripe).unwrap();
    draft.farms[1].0 = slow.clone();
    draft.outputs[1] = Some((encode(&alone.farm), slow.capacity));
    assert_eq!(w.reject(&draft), Error::BadActor as i8);
}
