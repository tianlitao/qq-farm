//! The rules by themselves, no chain.

use farm_core::*;

fn farm() -> Farm {
    Farm::new([1; 32], [0; NAME_LEN])
}

fn encode(farm: &Farm) -> Vec<u8> {
    let mut out = [0u8; MAX_STATE_LEN];
    let n = farm.encode(&mut out);
    out[..n].to_vec()
}

#[test]
fn state_round_trips() {
    let mut f = farm();
    f.gold = u64::MAX - 5;
    f.exp = 123_456;
    f.land = 9;
    f.dog_until = 77;
    f.day = 19_000;
    f.help_today = 3;
    f.mischief_today = 4;
    f.name[..3].copy_from_slice(b"abc");
    for i in 0..CROP_COUNT {
        f.seeds[i] = i as u16 * 3;
        f.fruits[i] = 60_000 + i as u16;
    }
    f.plots[8] = Plot { crop: 12, season: 2, flags: 0x1f, stolen: 9, thieves: 0xbeef, planted_at: 5, seed: 6 };
    f.plots[2] = Plot { crop: 1, flags: F_WITHERED, ..Plot::default() };
    let bytes = encode(&f);
    assert_eq!(bytes.len(), HEADER_LEN + 9 * PLOT_LEN);
    assert_eq!(Farm::decode(&bytes).unwrap(), f);
}

#[test]
fn malformed_states_are_refused() {
    let good = encode(&farm());
    assert!(Farm::decode(&good).is_ok());
    assert_eq!(Farm::decode(&good[..good.len() - 1]), Err(Error::BadState));
    assert_eq!(Farm::decode(&[good.clone(), vec![0]].concat()), Err(Error::BadState));

    let with = |at: usize, value: u8| {
        let mut bytes = good.clone();
        bytes[at] = value;
        Farm::decode(&bytes)
    };
    assert_eq!(with(0, 2), Err(Error::BadState)); // version
    assert_eq!(with(45, 5), Err(Error::BadState)); // too little land
    assert_eq!(with(45, 19), Err(Error::BadState)); // too much
    assert_eq!(with(HEADER_LEN, 17), Err(Error::BadState)); // no such crop
    assert_eq!(with(HEADER_LEN + 1, 1), Err(Error::BadState)); // an empty plot is all zeroes
    assert_eq!(with(HEADER_LEN + 2, 0x40), Err(Error::BadState)); // unknown flag

    // A radish has one season.
    let mut f = farm();
    f.plots[0] = Plot { crop: 1, season: 1, ..Plot::default() };
    assert_eq!(Farm::decode(&encode(&f)), Err(Error::BadState));
}

#[test]
fn levels() {
    assert_eq!(level_of(0), 1);
    assert_eq!(level_of(99), 1);
    assert_eq!(level_of(100), 2);
    assert_eq!(level_of(299), 2);
    assert_eq!(level_of(300), 3);
    assert_eq!(level_of(exp_for_level(25) as u32), 25);
    assert!(level_of(u32::MAX) > 9000);
}

#[test]
fn the_catalogue_makes_sense() {
    for (i, c) in CROPS.iter().enumerate() {
        let id = i as u8 + 1;
        assert!(c.seasons >= 1 && c.grow_hours >= 1);
        assert_eq!(c.seasons > 1, c.regrow_hours > 0, "crop {id}");
        // Worth planting even when neglected and robbed.
        let worst = c.yield_ as u32 - steal_cap(id).unwrap() as u32 - c.yield_ as u32 * 5 * PROBLEM_PENALTY_PERCENT / 100;
        assert!(worst >= 1, "crop {id}");
        assert!(c.yield_ as u64 * c.sell_price as u64 * c.seasons as u64 > c.seed_price as u64, "crop {id}");
        assert!(steal_amount(id).unwrap() >= 1);
        assert!(steal_cap(id).unwrap() >= steal_amount(id).unwrap());
        if i > 0 {
            assert!(c.level >= CROPS[i - 1].level);
        }
    }
    // Land gets dearer, and the last plot is reachable.
    for i in INIT_PLOTS..MAX_PLOTS as u8 - 1 {
        assert!(expand_cost(i).0 < expand_cost(i + 1).0 && expand_cost(i).1 < expand_cost(i + 1).1);
    }
}

#[test]
fn weather_comes_before_the_harvest() {
    let mut seen = [0u32; 3];
    for seed in 0..5_000u32 {
        for crop_id in [1u8, 6, 16] {
            for season in 0..crop(crop_id).unwrap().seasons {
                let plot = Plot { crop: crop_id, season, planted_at: 1_000, seed, ..Plot::default() };
                let ripe = ripe_at(&plot, 60).unwrap().unwrap();
                for kind in KIND_WEED..=KIND_DRY {
                    if let Some(at) = natural_at(&plot, kind, 60).unwrap() {
                        assert!(at > 1_000 && at < ripe);
                        seen[kind as usize] += 1;
                    }
                }
                assert!(harvest_amount(&plot, 60).unwrap() >= crop(crop_id).unwrap().yield_ * 7 / 10);
            }
        }
    }
    // Each kind shows up on a fair share of plots, never on all.
    for n in seen {
        assert!(n > 5_000 && n < 20_000, "{seen:?}");
    }
}

#[test]
fn pending_plots_show_no_weather() {
    let plot = Plot { crop: 1, ..Plot::default() };
    assert!(plot.is_pending());
    assert_eq!(ripe_at(&plot, 60).unwrap(), None);
    for kind in KIND_WEED..=KIND_DRY {
        assert_eq!(natural_at(&plot, kind, 60).unwrap(), None);
        assert!(!natural_active(&plot, kind, u32::MAX, 60).unwrap());
    }
}

#[test]
fn settling_takes_time_and_weather_from_the_block() {
    let mut f = farm();
    f.plots[0] = Plot { crop: 1, ..Plot::default() };
    f.plots[1] = Plot { crop: 1, ..Plot::default() };
    f.plots[2] = Plot { crop: 1, planted_at: 9, seed: 9, ..Plot::default() };
    assert!(has_pending(&f));
    assert_eq!(settle(&mut f.clone(), &[3; 32], None), Err(Error::MissingHeader));

    let block = BlockRef { timestamp: 500, hash: [0xab; 32] };
    let mut a = f.clone();
    settle(&mut a, &[3; 32], Some(&block)).unwrap();
    assert!(!has_pending(&a));
    assert_eq!((a.plots[0].planted_at, a.plots[1].planted_at), (500, 500));
    // Each plot gets its own weather; settled plots are left alone.
    assert_ne!(a.plots[0].seed, a.plots[1].seed);
    assert_eq!(a.plots[2], f.plots[2]);

    // Another block or another farm: other weather.
    let mut b = f.clone();
    settle(&mut b, &[3; 32], Some(&BlockRef { timestamp: 500, hash: [0xac; 32] })).unwrap();
    assert_ne!(a.plots[0].seed, b.plots[0].seed);
    let mut c = f.clone();
    settle(&mut c, &[4; 32], Some(&block)).unwrap();
    assert_ne!(a.plots[0].seed, c.plots[0].seed);
}

#[test]
fn the_game_hour_is_bounded() {
    let state = encode(&farm());
    let input = FarmInput { index: 0, id: [1; 32], state: &state, block: None, actions: &[] };
    for unit in [0, MAX_UNIT + 1] {
        assert_eq!(transition(&[input], 0, Clock { now: 0, unit }).unwrap_err(), Error::BadUnit);
    }
    assert!(transition(&[input], 0, Clock { now: 0, unit: MAX_UNIT }).is_ok());
}

#[test]
fn sixteen_thieves_at_most_share_a_plot() {
    let plot = Plot { crop: 16, planted_at: 1, seed: 42, ..Plot::default() };
    let mut slots = 0u16;
    for i in 0..=255u8 {
        let slot = thief_slot(&plot, &[i; 32]);
        assert_eq!(slot.count_ones(), 1);
        slots |= slot;
    }
    assert_eq!(slots, u16::MAX);
}
