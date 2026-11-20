//! The seed catalogue.

use crate::{Error, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Crop {
    /// Farm level needed to buy the seed.
    pub level: u8,
    pub seed_price: u32,
    /// Game hours from planting to the first harvest.
    pub grow_hours: u16,
    /// Harvests one plant gives.
    pub seasons: u8,
    /// Game hours from one harvest to the next.
    pub regrow_hours: u16,
    /// Fruit per harvest, before thieves and neglect.
    pub yield_: u16,
    pub sell_price: u32,
    /// Experience per harvest.
    pub exp: u16,
}

pub const CROP_COUNT: usize = 16;

const fn c(
    level: u8,
    seed_price: u32,
    grow_hours: u16,
    seasons: u8,
    regrow_hours: u16,
    yield_: u16,
    sell_price: u32,
    exp: u16,
) -> Crop {
    Crop { level, seed_price, grow_hours, seasons, regrow_hours, yield_, sell_price, exp }
}

/// Crop ids are 1-based: `CROPS[id - 1]`.
#[rustfmt::skip]
pub const CROPS: [Crop; CROP_COUNT] = [
    //  lvl  seed  grow seasons regrow yield sell exp
    c(   1,    80,   2,   1,     0,    16,   10,   6), //  1 radish
    c(   1,   120,   3,   1,     0,    18,   13,   9), //  2 carrot
    c(   2,   180,   4,   1,     0,    20,   17,  12), //  3 corn
    c(   3,   240,   5,   1,     0,    22,   20,  15), //  4 potato
    c(   4,   320,   6,   1,     0,    24,   24,  18), //  5 eggplant
    c(   5,   420,   7,   2,     4,    22,   22,  20), //  6 tomato
    c(   6,   500,   8,   1,     0,    26,   34,  26), //  7 pea
    c(   7,   600,   9,   2,     5,    24,   30,  28), //  8 chili
    c(   8,   760,  10,   1,     0,    28,   48,  34), //  9 pumpkin
    c(  10,   900,  11,   2,     6,    26,   40,  38), // 10 strawberry
    c(  12,  1150,  12,   1,     0,    30,   68,  44), // 11 watermelon
    c(  14,  1400,  14,   3,     6,    26,   52,  48), // 12 grape
    c(  16,  1800,  16,   2,     8,    30,   75,  56), // 13 banana
    c(  18,  2300,  18,   1,     0,    34,  130,  66), // 14 pineapple
    c(  21,  3000,  20,   3,     8,    30,  110,  76), // 15 peach
    c(  25,  4200,  24,   2,    10,    36,  190,  96), // 16 cherry
];

pub fn crop(id: u8) -> Result<&'static Crop> {
    if id == 0 || id as usize > CROP_COUNT {
        return Err(Error::BadCrop);
    }
    Ok(&CROPS[id as usize - 1])
}
