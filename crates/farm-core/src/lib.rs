//! Rules of the on-chain farm.
//!
//! This crate is the single source of truth for the game. The CKB script uses
//! it to verify a transaction, the web client runs the very same code (compiled
//! to WASM) to build one, so the two can never disagree.
//!
//! # Model
//!
//! Every player owns one *farm cell*. Its data is a [`Farm`]; its lock lets
//! anybody spend it, and its type script only accepts the spend if the output
//! is exactly what [`transition`] computes. That is what lets a neighbour walk
//! into your farm (steal, help, make mischief) without your signature while
//! still being unable to do anything the rules do not allow.
//!
//! A transaction may touch several farms at once. Each farm input carries its
//! own action list (in its witness). An action is either done by the farm's
//! owner or by a *visitor*: another farm in the same transaction. Visitor
//! actions have a second half that lands on the visitor's own farm (stolen
//! fruit, experience, daily counters). To get that half, the visitor's script
//! replays the visited farm's action list and collects the [`Credit`]s that
//! name it.
//!
//! # Time
//!
//! A script can prove "it is at least T" (a block with timestamp T exists) but
//! never "it is at most T". So:
//!
//! * `now` is the newest timestamp among the header deps: a lower bound.
//!   Everything that needs time to have *passed* (ripening, a weed showing up)
//!   is checked against it.
//! * The moment a crop was planted is not claimed by the player. A freshly
//!   planted plot is *pending*; the next transaction on the farm stamps it with
//!   the timestamp of the block that committed the planting, read from the
//!   header of the input cell ([`settle`]). The same header's hash seeds the
//!   plot's weather, so it cannot be known before planting.

#![no_std]

pub mod crops;

pub use crops::{crop, Crop, CROPS, CROP_COUNT};

pub const VERSION: u8 = 1;
pub const INIT_PLOTS: u8 = 6;
pub const MAX_PLOTS: usize = 18;
pub const NAME_LEN: usize = 18;
pub const HEADER_LEN: usize = 138;
pub const PLOT_LEN: usize = 14;
pub const MAX_STATE_LEN: usize = HEADER_LEN + PLOT_LEN * MAX_PLOTS;

pub const INIT_GOLD: u64 = 500;

/// Longest allowed game hour, in seconds (real time: one hour).
pub const MAX_UNIT: u32 = 3600;
pub const HOURS_PER_DAY: u32 = 24;

pub const EXP_CLEAR: u32 = 2;
pub const EXP_HELP: u32 = 3;
pub const EXP_SHOVEL: u32 = 3;
/// Helping a neighbour only earns experience this many times a day.
pub const HELP_EXP_PER_DAY: u8 = 50;
pub const MISCHIEF_PER_DAY: u8 = 30;

pub const DOG_LEVEL: u32 = 3;
pub const DOG_FOOD_PRICE: u64 = 300;
/// How many of 100 would-be thieves a fed dog keeps away from a given plot.
pub const DOG_BLOCK_PERCENT: u32 = 50;

/// Each neglected problem costs this share of the crop.
pub const PROBLEM_PENALTY_PERCENT: u32 = 10;
/// Thieves can never take more than this share of a crop, all together.
pub const STEAL_CAP_PERCENT: u32 = 40;
/// One visit takes this share of a crop (at least one fruit).
pub const STEAL_PERCENT: u32 = 8;

// Plot flags.
pub const F_WEED_CLEARED: u8 = 1 << 0;
pub const F_PEST_CLEARED: u8 = 1 << 1;
pub const F_DRY_CLEARED: u8 = 1 << 2;
pub const F_FRIEND_WEED: u8 = 1 << 3;
pub const F_FRIEND_PEST: u8 = 1 << 4;
pub const F_WITHERED: u8 = 1 << 5;
const F_ALL: u8 = 0x3f;

// Problem kinds.
pub const KIND_WEED: u8 = 0;
pub const KIND_PEST: u8 = 1;
pub const KIND_DRY: u8 = 2;

/// Chance (out of 256) that a crop gets a weed / a pest / a dry spell by itself.
const NATURAL_ODDS: [u32; 3] = [115, 102, 90];

// Action opcodes. Owner actions:
pub const OP_BUY_SEED: u8 = 1; // crop, count:u16
pub const OP_PLANT: u8 = 2; // plot, crop
pub const OP_HARVEST: u8 = 3; // plot
pub const OP_SHOVEL: u8 = 4; // plot
pub const OP_SELL: u8 = 5; // crop, count:u16
pub const OP_EXPAND: u8 = 6;
pub const OP_FEED_DOG: u8 = 7;
pub const OP_CLEAR: u8 = 8; // plot, kind
pub const OP_RENAME: u8 = 9; // name:[u8; 18]
// Visitor actions. `actor` is the transaction input index of the visitor's farm.
pub const OP_HELP: u8 = 16; // actor, plot, kind
pub const OP_MISCHIEF: u8 = 17; // actor, plot, kind
pub const OP_STEAL: u8 = 18; // actor, plot

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i8)]
pub enum Error {
    // 1..=4 are reserved for CKB syscall errors in the script.
    BadState = 10,
    BadAction = 11,
    BadCrop = 12,
    BadPlot = 13,
    LevelTooLow = 14,
    NotEnoughGold = 15,
    NotEnoughSeeds = 16,
    NotEnoughFruit = 17,
    StorageFull = 18,
    PlotNotEmpty = 19,
    PlotEmpty = 20,
    NotRipe = 21,
    Withered = 22,
    NothingToClear = 23,
    AlreadyThere = 24,
    LandMaxed = 25,
    NeedTime = 26,
    MissingHeader = 27,
    BadActor = 28,
    AlreadyStolen = 29,
    NothingLeftToSteal = 30,
    DogOnGuard = 31,
    MischiefLimit = 32,
    Overflow = 33,
    BadUnit = 34,
    // 40.. are raised by the script itself (see contracts/farm).
}

pub type Result<T> = core::result::Result<T, Error>;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Plot {
    /// 0 = empty, otherwise a crop id.
    pub crop: u8,
    /// Harvests already taken from this plant.
    pub season: u8,
    pub flags: u8,
    /// Fruit taken by thieves this season.
    pub stolen: u8,
    /// One bit per thief slot, see [`thief_slot`].
    pub thieves: u16,
    /// Seconds. 0 while the planting is still pending, see [`settle`].
    pub planted_at: u32,
    /// Drives this season's weather and the dog, fixed by [`settle`].
    pub seed: u32,
}

impl Plot {
    pub fn is_empty(&self) -> bool {
        self.crop == 0
    }
    pub fn is_withered(&self) -> bool {
        self.flags & F_WITHERED != 0
    }
    pub fn is_pending(&self) -> bool {
        self.crop != 0 && !self.is_withered() && self.planted_at == 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Farm {
    /// Lock hash of the owner. Owner actions need an input with this lock.
    pub owner: [u8; 32],
    pub gold: u64,
    pub exp: u32,
    pub land: u8,
    /// The dog is on guard until this second. 0 = never fed.
    pub dog_until: u32,
    /// Game day the two counters below belong to.
    pub day: u32,
    pub help_today: u8,
    pub mischief_today: u8,
    /// UTF-8, zero padded.
    pub name: [u8; NAME_LEN],
    pub seeds: [u16; CROP_COUNT],
    pub fruits: [u16; CROP_COUNT],
    pub plots: [Plot; MAX_PLOTS],
}

fn rd_u16(b: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([b[at], b[at + 1]])
}
fn rd_u32(b: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
}

impl Farm {
    /// The only state a farm may be created in.
    pub fn new(owner: [u8; 32], name: [u8; NAME_LEN]) -> Farm {
        Farm {
            owner,
            gold: INIT_GOLD,
            exp: 0,
            land: INIT_PLOTS,
            dog_until: 0,
            day: 0,
            help_today: 0,
            mischief_today: 0,
            name,
            seeds: [0; CROP_COUNT],
            fruits: [0; CROP_COUNT],
            plots: [Plot::default(); MAX_PLOTS],
        }
    }

    pub fn encoded_len(&self) -> usize {
        HEADER_LEN + PLOT_LEN * self.land as usize
    }

    /// Writes the state into `out` and returns its length.
    pub fn encode(&self, out: &mut [u8; MAX_STATE_LEN]) -> usize {
        out[0] = VERSION;
        out[1..33].copy_from_slice(&self.owner);
        out[33..41].copy_from_slice(&self.gold.to_le_bytes());
        out[41..45].copy_from_slice(&self.exp.to_le_bytes());
        out[45] = self.land;
        out[46..50].copy_from_slice(&self.dog_until.to_le_bytes());
        out[50..54].copy_from_slice(&self.day.to_le_bytes());
        out[54] = self.help_today;
        out[55] = self.mischief_today;
        out[56..74].copy_from_slice(&self.name);
        for i in 0..CROP_COUNT {
            out[74 + 2 * i..76 + 2 * i].copy_from_slice(&self.seeds[i].to_le_bytes());
            out[106 + 2 * i..108 + 2 * i].copy_from_slice(&self.fruits[i].to_le_bytes());
        }
        for i in 0..self.land as usize {
            let p = &self.plots[i];
            let at = HEADER_LEN + PLOT_LEN * i;
            out[at] = p.crop;
            out[at + 1] = p.season;
            out[at + 2] = p.flags;
            out[at + 3] = p.stolen;
            out[at + 4..at + 6].copy_from_slice(&p.thieves.to_le_bytes());
            out[at + 6..at + 10].copy_from_slice(&p.planted_at.to_le_bytes());
            out[at + 10..at + 14].copy_from_slice(&p.seed.to_le_bytes());
        }
        self.encoded_len()
    }

    pub fn decode(b: &[u8]) -> Result<Farm> {
        if b.len() < HEADER_LEN || b[0] != VERSION {
            return Err(Error::BadState);
        }
        let land = b[45];
        if land < INIT_PLOTS || land as usize > MAX_PLOTS {
            return Err(Error::BadState);
        }
        if b.len() != HEADER_LEN + PLOT_LEN * land as usize {
            return Err(Error::BadState);
        }
        let mut owner = [0u8; 32];
        owner.copy_from_slice(&b[1..33]);
        let mut gold = [0u8; 8];
        gold.copy_from_slice(&b[33..41]);
        let mut name = [0u8; NAME_LEN];
        name.copy_from_slice(&b[56..74]);
        let mut seeds = [0u16; CROP_COUNT];
        let mut fruits = [0u16; CROP_COUNT];
        for i in 0..CROP_COUNT {
            seeds[i] = rd_u16(b, 74 + 2 * i);
            fruits[i] = rd_u16(b, 106 + 2 * i);
        }
        let mut plots = [Plot::default(); MAX_PLOTS];
        for (i, plot) in plots.iter_mut().enumerate().take(land as usize) {
            let at = HEADER_LEN + PLOT_LEN * i;
            let p = Plot {
                crop: b[at],
                season: b[at + 1],
                flags: b[at + 2],
                stolen: b[at + 3],
                thieves: rd_u16(b, at + 4),
                planted_at: rd_u32(b, at + 6),
                seed: rd_u32(b, at + 10),
            };
            if p.crop as usize > CROP_COUNT || p.flags & !F_ALL != 0 {
                return Err(Error::BadState);
            }
            if p.crop == 0 && p != Plot::default() {
                return Err(Error::BadState);
            }
            if p.crop != 0 && p.season >= crop(p.crop)?.seasons {
                return Err(Error::BadState);
            }
            *plot = p;
        }
        Ok(Farm {
            owner,
            gold: u64::from_le_bytes(gold),
            exp: rd_u32(b, 41),
            land,
            dog_until: rd_u32(b, 46),
            day: rd_u32(b, 50),
            help_today: b[54],
            mischief_today: b[55],
            name,
            seeds,
            fruits,
            plots,
        })
    }

    pub fn level(&self) -> u32 {
        level_of(self.exp)
    }

    fn plot_mut(&mut self, idx: u8) -> Result<&mut Plot> {
        if idx >= self.land {
            return Err(Error::BadPlot);
        }
        Ok(&mut self.plots[idx as usize])
    }

    fn add_exp(&mut self, n: u32) {
        self.exp = self.exp.saturating_add(n);
    }

    fn pay(&mut self, price: u64) -> Result<()> {
        self.gold = self.gold.checked_sub(price).ok_or(Error::NotEnoughGold)?;
        Ok(())
    }
}

/// Total experience needed to reach `level` (levels start at 1).
pub fn exp_for_level(level: u32) -> u64 {
    50 * level as u64 * (level as u64 - 1)
}

pub fn level_of(exp: u32) -> u32 {
    let mut level = 1;
    while exp_for_level(level + 1) <= exp as u64 {
        level += 1;
    }
    level
}

/// Level and gold needed to unlock the plot with this index (6..18).
pub fn expand_cost(plot_index: u8) -> (u32, u64) {
    const COST: [(u32, u64); MAX_PLOTS - INIT_PLOTS as usize] = [
        (3, 2_000),
        (5, 5_000),
        (7, 10_000),
        (9, 18_000),
        (11, 30_000),
        (13, 45_000),
        (15, 65_000),
        (17, 90_000),
        (19, 120_000),
        (21, 160_000),
        (23, 210_000),
        (25, 280_000),
    ];
    COST[(plot_index - INIT_PLOTS) as usize]
}

/// A small, fast integer hash ("lowbias32").
pub fn mix32(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb_352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846c_a68b);
    x ^= x >> 16;
    x
}

/// Header of the block that committed a farm cell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BlockRef {
    /// Seconds.
    pub timestamp: u32,
    pub hash: [u8; 32],
}

/// How long the current season of `plot` takes to ripen, in seconds.
pub fn duration(plot: &Plot, unit: u32) -> Result<u32> {
    let c = crop(plot.crop)?;
    let hours = if plot.season == 0 { c.grow_hours } else { c.regrow_hours };
    Ok(hours as u32 * unit)
}

/// When the plot is ripe, in seconds. `None` while the planting is pending.
pub fn ripe_at(plot: &Plot, unit: u32) -> Result<Option<u64>> {
    if plot.is_pending() || plot.is_empty() || plot.is_withered() {
        return Ok(None);
    }
    Ok(Some(plot.planted_at as u64 + duration(plot, unit)? as u64))
}

/// When the natural problem `kind` shows up on the plot, if it ever does.
/// Always strictly before the crop is ripe.
pub fn natural_at(plot: &Plot, kind: u8, unit: u32) -> Result<Option<u64>> {
    if plot.is_pending() || plot.is_empty() || plot.is_withered() || kind > KIND_DRY {
        return Ok(None);
    }
    let r = mix32(plot.seed.wrapping_add(kind as u32 + 1));
    if r & 0xff >= NATURAL_ODDS[kind as usize] {
        return Ok(None);
    }
    let percent = 10 + ((r >> 8) % 80) as u64;
    let offset = duration(plot, unit)? as u64 * percent / 100;
    Ok(Some(plot.planted_at as u64 + offset))
}

fn cleared_flag(kind: u8) -> u8 {
    match kind {
        KIND_WEED => F_WEED_CLEARED,
        KIND_PEST => F_PEST_CLEARED,
        _ => F_DRY_CLEARED,
    }
}

fn friend_flag(kind: u8) -> u8 {
    match kind {
        KIND_WEED => F_FRIEND_WEED,
        KIND_PEST => F_FRIEND_PEST,
        _ => 0,
    }
}

/// Is the natural problem `kind` there right now (shown up, not dealt with)?
pub fn natural_active(plot: &Plot, kind: u8, now: u32, unit: u32) -> Result<bool> {
    if plot.flags & cleared_flag(kind) != 0 {
        return Ok(false);
    }
    Ok(matches!(natural_at(plot, kind, unit)?, Some(at) if now as u64 >= at))
}

/// Problems that will count against the harvest: every natural one that was
/// not dealt with (by harvest time they have all shown up) plus the ones
/// neighbours left behind.
pub fn problems_at_harvest(plot: &Plot, unit: u32) -> Result<u32> {
    let mut n = 0;
    for kind in KIND_WEED..=KIND_DRY {
        if plot.flags & cleared_flag(kind) == 0 && natural_at(plot, kind, unit)?.is_some() {
            n += 1;
        }
        if plot.flags & friend_flag(kind) != 0 {
            n += 1;
        }
    }
    Ok(n)
}

/// What the owner gets when harvesting the plot as it is now.
pub fn harvest_amount(plot: &Plot, unit: u32) -> Result<u16> {
    let base = crop(plot.crop)?.yield_ as u32;
    let penalty = base * PROBLEM_PENALTY_PERCENT * problems_at_harvest(plot, unit)? / 100;
    Ok(base.saturating_sub(plot.stolen as u32).saturating_sub(penalty) as u16)
}

/// Fruit one thief takes in one visit.
pub fn steal_amount(crop_id: u8) -> Result<u8> {
    let base = crop(crop_id)?.yield_ as u32;
    Ok(core::cmp::max(1, base * STEAL_PERCENT / 100) as u8)
}

/// Most fruit thieves can take from one season of a crop, all together.
pub fn steal_cap(crop_id: u8) -> Result<u8> {
    Ok((crop(crop_id)?.yield_ as u32 * STEAL_CAP_PERCENT / 100) as u8)
}

fn id_word(id: &[u8; 32], at: usize) -> u32 {
    rd_u32(id, at)
}

/// Each thief maps to one of 16 slots per plot and season; a slot can be used
/// once. The thief's identity is their farm's **owner lock hash**, not the farm
/// id: one player can run many farms, and they all share the same slots —
/// extra farms buy a sybil nothing. This bounds the state while keeping one
/// player from stealing twice.
pub fn thief_slot(plot: &Plot, thief: &[u8; 32]) -> u16 {
    1 << (mix32(id_word(thief, 0) ^ plot.seed) & 15)
}

/// Does a fed dog keep this thief away from this plot (this season)? Keyed on
/// the thief's owner, like [`thief_slot`].
pub fn dog_blocks(plot: &Plot, thief: &[u8; 32]) -> bool {
    mix32(id_word(thief, 4) ^ plot.seed ^ 0x0d06_0d06) % 100 < DOG_BLOCK_PERCENT
}

/// Why (or whether) `thief` — a player's owner lock hash — can steal from the
/// plot right now.
pub fn check_steal(farm: &Farm, plot: &Plot, thief: &[u8; 32], now: u32, unit: u32) -> Result<u8> {
    if plot.is_empty() {
        return Err(Error::PlotEmpty);
    }
    if plot.is_withered() {
        return Err(Error::Withered);
    }
    match ripe_at(plot, unit)? {
        Some(at) if now as u64 >= at => {}
        _ => return Err(Error::NotRipe),
    }
    if plot.thieves & thief_slot(plot, thief) != 0 {
        return Err(Error::AlreadyStolen);
    }
    let amount = steal_amount(plot.crop)?;
    if plot.stolen as u32 + amount as u32 > steal_cap(plot.crop)? as u32 {
        return Err(Error::NothingLeftToSteal);
    }
    if now < farm.dog_until && dog_blocks(plot, thief) {
        return Err(Error::DogOnGuard);
    }
    Ok(amount)
}

/// Stamps pending plantings with the block that committed them.
pub fn settle(farm: &mut Farm, id: &[u8; 32], block: Option<&BlockRef>) -> Result<()> {
    for i in 0..farm.land as usize {
        if !farm.plots[i].is_pending() {
            continue;
        }
        let block = block.ok_or(Error::MissingHeader)?;
        if block.timestamp == 0 {
            return Err(Error::MissingHeader);
        }
        let plot = &mut farm.plots[i];
        plot.planted_at = block.timestamp;
        plot.seed = mix32(
            rd_u32(&block.hash, 0) ^ id_word(id, 0) ^ (i as u32 + 1).wrapping_mul(0x9e37_79b9),
        );
    }
    Ok(())
}

pub fn has_pending(farm: &Farm) -> bool {
    farm.plots[..farm.land as usize].iter().any(Plot::is_pending)
}

/// Starts a new game day if `now` proves one has begun.
fn roll_day(farm: &mut Farm, now: u32, unit: u32) {
    let day = now / (HOURS_PER_DAY * unit);
    if day > farm.day {
        farm.day = day;
        farm.help_today = 0;
        farm.mischief_today = 0;
    }
}

/// The visitor's half of a visitor action.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Credit {
    /// Cleared a problem nature planted: earns experience, capped daily.
    Help { earned: bool },
    Mischief,
    Steal { crop: u8, amount: u8 },
}

fn apply_credit(farm: &mut Farm, credit: Credit) -> Result<()> {
    match credit {
        Credit::Help { earned } => {
            if farm.help_today < HELP_EXP_PER_DAY {
                farm.help_today += 1;
                // Only nature's weeds pay experience: what a neighbour (or this
                // very transaction) planted earns a helper nothing, or farms
                // could mint experience from a weed round trip.
                if earned {
                    farm.add_exp(EXP_HELP);
                }
            }
        }
        Credit::Mischief => {
            if farm.mischief_today >= MISCHIEF_PER_DAY {
                return Err(Error::MischiefLimit);
            }
            farm.mischief_today += 1;
        }
        Credit::Steal { crop, amount } => {
            let slot = &mut farm.fruits[crop as usize - 1];
            *slot = slot.checked_add(amount as u16).ok_or(Error::StorageFull)?;
        }
    }
    Ok(())
}

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn done(&self) -> bool {
        self.at >= self.bytes.len()
    }
    fn u8(&mut self) -> Result<u8> {
        let v = *self.bytes.get(self.at).ok_or(Error::BadAction)?;
        self.at += 1;
        Ok(v)
    }
    fn u16(&mut self) -> Result<u16> {
        Ok(u16::from_le_bytes([self.u8()?, self.u8()?]))
    }
    fn take(&mut self, n: usize) -> Result<&'a [u8]> {
        let s = self.bytes.get(self.at..self.at + n).ok_or(Error::BadAction)?;
        self.at += n;
        Ok(s)
    }
}

/// Removes a problem from the plot. Returns whether it was a natural one (as
/// opposed to one a neighbour left behind).
fn clear_problem(plot: &mut Plot, kind: u8, now: u32, unit: u32) -> Result<bool> {
    if plot.is_empty() {
        return Err(Error::PlotEmpty);
    }
    if plot.is_withered() {
        return Err(Error::Withered);
    }
    if kind > KIND_DRY {
        return Err(Error::BadAction);
    }
    let friend = friend_flag(kind);
    if plot.flags & friend != 0 {
        plot.flags &= !friend;
        return Ok(false);
    }
    if natural_active(plot, kind, now, unit)? {
        plot.flags |= cleared_flag(kind);
        return Ok(true);
    }
    Err(Error::NothingToClear)
}

/// One farm as it enters a transaction.
#[derive(Debug, Clone, Copy)]
pub struct FarmInput<'a> {
    /// Index of the farm cell among the transaction inputs.
    pub index: u8,
    /// The farm's id (from its type script args).
    pub id: [u8; 32],
    /// Cell data.
    pub state: &'a [u8],
    /// Block that committed the cell. Only needed if a planting is pending.
    pub block: Option<BlockRef>,
    /// Action list from the cell's witness.
    pub actions: &'a [u8],
}

/// Time as far as the transaction can prove it.
#[derive(Debug, Clone, Copy)]
pub struct Clock {
    /// Seconds; a lower bound of the current time. 0 if the transaction has no
    /// header dep, then nothing that needs time to have passed can happen.
    pub now: u32,
    /// Seconds per game hour.
    pub unit: u32,
}

/// Runs `farm`'s action list. `on_credit(actor, credit)` gets the visitor's
/// half of every visitor action. Returns whether an owner action was run.
fn run_actions(
    farm: &mut Farm,
    input: &FarmInput,
    all: &[FarmInput],
    clock: Clock,
    on_credit: &mut dyn FnMut(u8, Credit) -> Result<()>,
) -> Result<bool> {
    let Clock { now, unit } = clock;
    let mut owner_acted = false;
    let mut r = Reader { bytes: input.actions, at: 0 };
    while !r.done() {
        let op = r.u8()?;
        if op < OP_HELP {
            owner_acted = true;
        }
        match op {
            OP_BUY_SEED => {
                let crop_id = r.u8()?;
                let count = r.u16()?;
                let c = crop(crop_id)?;
                if count == 0 {
                    return Err(Error::BadAction);
                }
                if farm.level() < c.level as u32 {
                    return Err(Error::LevelTooLow);
                }
                farm.pay(c.seed_price as u64 * count as u64)?;
                let slot = &mut farm.seeds[crop_id as usize - 1];
                *slot = slot.checked_add(count).ok_or(Error::StorageFull)?;
            }
            OP_PLANT => {
                let idx = r.u8()?;
                let crop_id = r.u8()?;
                crop(crop_id)?;
                if !farm.plot_mut(idx)?.is_empty() {
                    return Err(Error::PlotNotEmpty);
                }
                let slot = &mut farm.seeds[crop_id as usize - 1];
                *slot = slot.checked_sub(1).ok_or(Error::NotEnoughSeeds)?;
                *farm.plot_mut(idx)? = Plot { crop: crop_id, ..Plot::default() };
            }
            OP_HARVEST => {
                let idx = r.u8()?;
                let plot = *farm.plot_mut(idx)?;
                if plot.is_empty() {
                    return Err(Error::PlotEmpty);
                }
                if plot.is_withered() {
                    return Err(Error::Withered);
                }
                match ripe_at(&plot, unit)? {
                    Some(at) if now as u64 >= at => {}
                    _ => return Err(Error::NotRipe),
                }
                let c = crop(plot.crop)?;
                let amount = harvest_amount(&plot, unit)?;
                let slot = &mut farm.fruits[plot.crop as usize - 1];
                *slot = slot.checked_add(amount).ok_or(Error::StorageFull)?;
                farm.add_exp(c.exp as u32);
                *farm.plot_mut(idx)? = if plot.season + 1 < c.seasons {
                    // Grows back: a new pending season.
                    Plot { crop: plot.crop, season: plot.season + 1, ..Plot::default() }
                } else {
                    Plot { crop: plot.crop, season: plot.season, flags: F_WITHERED, ..Plot::default() }
                };
            }
            OP_SHOVEL => {
                let idx = r.u8()?;
                let plot = *farm.plot_mut(idx)?;
                if plot.is_empty() {
                    return Err(Error::PlotEmpty);
                }
                if plot.is_withered() {
                    farm.add_exp(EXP_SHOVEL);
                }
                *farm.plot_mut(idx)? = Plot::default();
            }
            OP_SELL => {
                let crop_id = r.u8()?;
                let count = r.u16()?;
                let c = crop(crop_id)?;
                if count == 0 {
                    return Err(Error::BadAction);
                }
                let slot = &mut farm.fruits[crop_id as usize - 1];
                *slot = slot.checked_sub(count).ok_or(Error::NotEnoughFruit)?;
                farm.gold = farm
                    .gold
                    .checked_add(c.sell_price as u64 * count as u64)
                    .ok_or(Error::Overflow)?;
            }
            OP_EXPAND => {
                if farm.land as usize >= MAX_PLOTS {
                    return Err(Error::LandMaxed);
                }
                let (level, price) = expand_cost(farm.land);
                if farm.level() < level {
                    return Err(Error::LevelTooLow);
                }
                farm.pay(price)?;
                farm.plots[farm.land as usize] = Plot::default();
                farm.land += 1;
            }
            OP_FEED_DOG => {
                if now == 0 {
                    return Err(Error::NeedTime);
                }
                if farm.level() < DOG_LEVEL {
                    return Err(Error::LevelTooLow);
                }
                farm.pay(DOG_FOOD_PRICE)?;
                farm.dog_until = core::cmp::max(farm.dog_until, now)
                    .checked_add(HOURS_PER_DAY * unit)
                    .ok_or(Error::Overflow)?;
            }
            OP_CLEAR => {
                let idx = r.u8()?;
                let kind = r.u8()?;
                // Only nature's problems earn experience, or two farms could
                // feed each other weeds for ever.
                if clear_problem(farm.plot_mut(idx)?, kind, now, unit)? {
                    farm.add_exp(EXP_CLEAR);
                }
            }
            OP_RENAME => {
                farm.name.copy_from_slice(r.take(NAME_LEN)?);
            }
            OP_HELP | OP_MISCHIEF | OP_STEAL => {
                let actor = r.u8()?;
                let idx = r.u8()?;
                if actor == input.index {
                    return Err(Error::BadActor);
                }
                // The thief's identity is the owner lock hash recorded in the
                // actor farm's state: many farms, one identity per player.
                let actor_id = all
                    .iter()
                    .find(|f| f.index == actor)
                    .map(|f| owner_in_state(f.state))
                    .transpose()?
                    .ok_or(Error::BadActor)?;
                let credit = match op {
                    OP_HELP => {
                        let kind = r.u8()?;
                        // Experience only for nature's problems: what a
                        // neighbour (or this very transaction) planted earns a
                        // helper nothing.
                        let natural = clear_problem(farm.plot_mut(idx)?, kind, now, unit)?;
                        Credit::Help { earned: natural }
                    }
                    OP_MISCHIEF => {
                        let kind = r.u8()?;
                        let flag = friend_flag(kind);
                        if flag == 0 {
                            return Err(Error::BadAction);
                        }
                        let plot = farm.plot_mut(idx)?;
                        if plot.is_empty() {
                            return Err(Error::PlotEmpty);
                        }
                        if plot.is_withered() {
                            return Err(Error::Withered);
                        }
                        if plot.flags & flag != 0 {
                            return Err(Error::AlreadyThere);
                        }
                        plot.flags |= flag;
                        Credit::Mischief
                    }
                    _ => {
                        let plot = *farm.plot_mut(idx)?;
                        let amount = check_steal(farm, &plot, &actor_id, now, unit)?;
                        let slot = thief_slot(&plot, &actor_id);
                        let plot = farm.plot_mut(idx)?;
                        plot.stolen += amount;
                        plot.thieves |= slot;
                        Credit::Steal { crop: plot.crop, amount }
                    }
                };
                on_credit(actor, credit)?;
            }
            _ => return Err(Error::BadAction),
        }
    }
    Ok(owner_acted)
}

/// A farm after a transaction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    pub farm: Farm,
    /// True if the farm's owner must have authorised the transaction: an owner
    /// action ran on it, or it visited another farm.
    pub needs_owner: bool,
}

/// The owner lock hash recorded in a farm's state (bytes 1..33, right after
/// the version byte).
fn owner_in_state(state: &[u8]) -> Result<[u8; 32]> {
    if state.len() < 1 + 32 || state[0] != VERSION {
        return Err(Error::BadState);
    }
    let mut owner = [0u8; 32];
    owner.copy_from_slice(&state[1..33]);
    Ok(owner)
}

/// Computes the state `farms[me]` must have after the transaction.
///
/// `farms` holds every farm cell among the inputs. The result is:
///
/// 1. pending plantings settled, the day counters rolled over;
/// 2. the farm's own action list applied;
/// 3. the credits it earned on the other farms added, in input order.
pub fn transition(farms: &[FarmInput], me: usize, clock: Clock) -> Result<Outcome> {
    if clock.unit == 0 || clock.unit > MAX_UNIT {
        return Err(Error::BadUnit);
    }
    let open = |input: &FarmInput| -> Result<Farm> {
        let mut farm = Farm::decode(input.state)?;
        settle(&mut farm, &input.id, input.block.as_ref())?;
        roll_day(&mut farm, clock.now, clock.unit);
        Ok(farm)
    };

    let mine = &farms[me];
    let mut farm = open(mine)?;
    let mut needs_owner = run_actions(&mut farm, mine, farms, clock, &mut |_, _| Ok(()))?;

    for (i, other) in farms.iter().enumerate() {
        if i == me {
            continue;
        }
        // Replay the other farm only to learn what it owes this one. Whether
        // its own output is right is for its own script run to decide.
        let mut theirs = open(other)?;
        let mut visited = false;
        run_actions(&mut theirs, other, farms, clock, &mut |actor, credit| {
            if actor == mine.index {
                visited = true;
                apply_credit(&mut farm, credit)?;
            }
            Ok(())
        })?;
        needs_owner |= visited;
    }
    Ok(Outcome { farm, needs_owner })
}

/// Does another farm in the transaction name `farms[me]` as its visitor?
///
/// A farm that is closed has no output to hold the visitor's half of a visit
/// (the stolen fruit, the day's mischief count), so its script refuses the
/// close when this is true. Farms without actions are not looked at: they
/// cannot name anybody, and one that is closed too may lack its header.
pub fn is_visitor(farms: &[FarmInput], me: usize, clock: Clock) -> Result<bool> {
    if clock.unit == 0 || clock.unit > MAX_UNIT {
        return Err(Error::BadUnit);
    }
    let mine = farms[me].index;
    let mut named = false;
    for (i, other) in farms.iter().enumerate() {
        if i == me || other.actions.is_empty() {
            continue;
        }
        // The same replay the other farm's own script run does.
        let mut theirs = Farm::decode(other.state)?;
        settle(&mut theirs, &other.id, other.block.as_ref())?;
        roll_day(&mut theirs, clock.now, clock.unit);
        run_actions(&mut theirs, other, farms, clock, &mut |actor, _| {
            named |= actor == mine;
            Ok(())
        })?;
    }
    Ok(named)
}
