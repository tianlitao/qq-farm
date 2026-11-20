//! farm-core for the browser.
//!
//! A plain C ABI, no bindgen: the caller writes a request into the shared
//! buffer ([`fw_buf`]), calls a function with the request length and reads the
//! answer from the same buffer. A function returns the answer's length, or
//! `-code` with a `farm_core::Error` code.
//!
//! All integers are little-endian. A *block* is `flag:u8, timestamp:u32,
//! hash:[u8; 32]` with flag 0 if unknown.

use core::fmt::Write;
use farm_core::*;

const BUF_LEN: usize = 1 << 16;
static mut BUF: [u8; BUF_LEN] = [0; BUF_LEN];

#[no_mangle]
pub extern "C" fn fw_buf() -> *mut u8 {
    core::ptr::addr_of_mut!(BUF) as *mut u8
}

#[no_mangle]
pub extern "C" fn fw_buf_len() -> u32 {
    BUF_LEN as u32
}

fn request(len: u32) -> Vec<u8> {
    let len = (len as usize).min(BUF_LEN);
    // SAFETY: single-threaded WASM; the buffer is only touched between calls.
    unsafe { core::slice::from_raw_parts(fw_buf(), len).to_vec() }
}

fn respond(bytes: &[u8]) -> i32 {
    assert!(bytes.len() <= BUF_LEN, "answer too large");
    // SAFETY: as above.
    unsafe { core::ptr::copy_nonoverlapping(bytes.as_ptr(), fw_buf(), bytes.len()) };
    bytes.len() as i32
}

fn fail(e: Error) -> i32 {
    -(e as i32)
}

struct In<'a> {
    b: &'a [u8],
    at: usize,
}

impl<'a> In<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8]> {
        let s = self.b.get(self.at..self.at + n).ok_or(Error::BadAction)?;
        self.at += n;
        Ok(s)
    }
    fn u8(&mut self) -> Result<u8> {
        Ok(self.take(1)?[0])
    }
    fn u16(&mut self) -> Result<u16> {
        let s = self.take(2)?;
        Ok(u16::from_le_bytes([s[0], s[1]]))
    }
    fn u32(&mut self) -> Result<u32> {
        let s = self.take(4)?;
        Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn hash(&mut self) -> Result<[u8; 32]> {
        let mut h = [0u8; 32];
        h.copy_from_slice(self.take(32)?);
        Ok(h)
    }
    fn block(&mut self) -> Result<Option<BlockRef>> {
        let known = self.u8()? != 0;
        let block = BlockRef { timestamp: self.u32()?, hash: self.hash()? };
        Ok(known.then_some(block))
    }
    fn rest(&mut self) -> &'a [u8] {
        let s = &self.b[self.at..];
        self.at = self.b.len();
        s
    }
}

/// Request: `owner:[u8; 32], name:[u8; 18]`. Answer: the state of a new farm.
#[no_mangle]
pub extern "C" fn fw_new_farm(len: u32) -> i32 {
    let req = request(len);
    let mut r = In { b: &req, at: 0 };
    let mut run = || -> Result<Vec<u8>> {
        let owner = r.hash()?;
        let mut name = [0u8; NAME_LEN];
        name.copy_from_slice(r.take(NAME_LEN)?);
        let mut out = [0u8; MAX_STATE_LEN];
        let n = Farm::new(owner, name).encode(&mut out);
        Ok(out[..n].to_vec())
    };
    match run() {
        Ok(state) => respond(&state),
        Err(e) => fail(e),
    }
}

/// Request: `now:u32, unit:u32, me:u8, count:u8`, then per farm
/// `index:u8, id:[u8; 32], block, state_len:u16, state, actions_len:u16, actions`.
/// Answer: `needs_owner:u8`, then the new state of farm number `me`.
#[no_mangle]
pub extern "C" fn fw_transition(len: u32) -> i32 {
    let req = request(len);
    let mut r = In { b: &req, at: 0 };
    let mut run = || -> Result<Vec<u8>> {
        let clock = Clock { now: r.u32()?, unit: r.u32()? };
        let me = r.u8()? as usize;
        let count = r.u8()? as usize;
        let mut farms = Vec::with_capacity(count);
        for _ in 0..count {
            let index = r.u8()?;
            let id = r.hash()?;
            let block = r.block()?;
            let state_len = r.u16()? as usize;
            let state = r.take(state_len)?;
            let actions_len = r.u16()? as usize;
            let actions = r.take(actions_len)?;
            farms.push(FarmInput { index, id, state, block, actions });
        }
        if me >= farms.len() {
            return Err(Error::BadAction);
        }
        let outcome = transition(&farms, me, clock)?;
        let mut out = [0u8; MAX_STATE_LEN];
        let n = outcome.farm.encode(&mut out);
        let mut answer = vec![outcome.needs_owner as u8];
        answer.extend_from_slice(&out[..n]);
        Ok(answer)
    };
    match run() {
        Ok(answer) => respond(&answer),
        Err(e) => fail(e),
    }
}

fn hex(out: &mut String, bytes: &[u8]) {
    for b in bytes {
        let _ = write!(out, "{b:02x}");
    }
}

fn list<T: core::fmt::Display>(out: &mut String, items: impl Iterator<Item = T>) {
    out.push('[');
    for (i, item) in items.enumerate() {
        if i > 0 {
            out.push(',');
        }
        let _ = write!(out, "{item}");
    }
    out.push(']');
}

/// Request: `now:u32, unit:u32, viewer_flag:u8, viewer_id:[u8; 32],
/// farm_id:[u8; 32], block, state`. Answer: the farm as JSON, with everything
/// the rules derive from it at time `now`. `steal` is what the viewer would get
/// from a plot, or `-code` saying why not.
#[no_mangle]
pub extern "C" fn fw_view(len: u32) -> i32 {
    let req = request(len);
    let mut r = In { b: &req, at: 0 };
    let mut run = || -> Result<String> {
        let now = r.u32()?;
        let unit = r.u32()?;
        let has_viewer = r.u8()? != 0;
        let viewer = r.hash()?;
        let id = r.hash()?;
        let block = r.block()?;
        let mut farm = Farm::decode(r.rest())?;
        if block.is_some() {
            settle(&mut farm, &id, block.as_ref())?;
        }
        let day = now / (HOURS_PER_DAY * unit.max(1));
        let (help_today, mischief_today) =
            if day > farm.day { (0, 0) } else { (farm.help_today, farm.mischief_today) };

        let mut o = String::with_capacity(4096);
        o.push_str("{\"owner\":\"");
        hex(&mut o, &farm.owner);
        o.push_str("\",\"name\":\"");
        hex(&mut o, &farm.name);
        let level = farm.level();
        let _ = write!(
            o,
            "\",\"gold\":{},\"exp\":{},\"level\":{},\"levelFrom\":{},\"levelTo\":{},\"land\":{},\
             \"dogUntil\":{},\"helpToday\":{},\"mischiefToday\":{},\"seeds\":",
            farm.gold,
            farm.exp,
            level,
            exp_for_level(level),
            exp_for_level(level + 1),
            farm.land,
            farm.dog_until,
            help_today,
            mischief_today,
        );
        list(&mut o, farm.seeds.iter());
        o.push_str(",\"fruits\":");
        list(&mut o, farm.fruits.iter());
        o.push_str(",\"plots\":[");
        for i in 0..farm.land as usize {
            let p = &farm.plots[i];
            if i > 0 {
                o.push(',');
            }
            if p.is_empty() {
                o.push_str("{\"crop\":0}");
                continue;
            }
            let ripe_at = ripe_at(p, unit)?.unwrap_or(0);
            let growing = !p.is_withered() && !p.is_pending();
            // 1 natural, 2 left by a neighbour, 3 both.
            let mut problems = [0u8; 3];
            if growing {
                for kind in KIND_WEED..=KIND_DRY {
                    if natural_active(p, kind, now, unit)? {
                        problems[kind as usize] |= 1;
                    }
                }
            }
            if p.flags & F_FRIEND_WEED != 0 {
                problems[KIND_WEED as usize] |= 2;
            }
            if p.flags & F_FRIEND_PEST != 0 {
                problems[KIND_PEST as usize] |= 2;
            }
            let steal = if has_viewer {
                match check_steal(&farm, p, &viewer, now, unit) {
                    Ok(amount) => amount as i32,
                    Err(e) => -(e as i32),
                }
            } else {
                0
            };
            let _ = write!(
                o,
                "{{\"crop\":{},\"season\":{},\"pending\":{},\"withered\":{},\"plantedAt\":{},\
                 \"ripeAt\":{},\"duration\":{},\"ripe\":{},\"stolen\":{},\"harvest\":{},\"steal\":{},\"problems\":",
                p.crop,
                p.season,
                p.is_pending(),
                p.is_withered(),
                p.planted_at,
                ripe_at,
                if p.is_withered() { 0 } else { duration(p, unit)? },
                growing && now as u64 >= ripe_at,
                p.stolen,
                if growing { harvest_amount(p, unit)? } else { 0 },
                steal,
            );
            list(&mut o, problems.iter());
            o.push('}');
        }
        o.push_str("]}");
        Ok(o)
    };
    match run() {
        Ok(json) => respond(json.as_bytes()),
        Err(e) => fail(e),
    }
}

/// Answer: the rule constants as JSON.
#[no_mangle]
pub extern "C" fn fw_catalog() -> i32 {
    let mut o = String::with_capacity(4096);
    o.push_str("{\"crops\":[");
    for (i, c) in CROPS.iter().enumerate() {
        if i > 0 {
            o.push(',');
        }
        let _ = write!(
            o,
            "{{\"id\":{},\"level\":{},\"seedPrice\":{},\"growHours\":{},\"seasons\":{},\"regrowHours\":{},\
             \"yield\":{},\"sellPrice\":{},\"exp\":{},\"steal\":{},\"stealCap\":{}}}",
            i + 1,
            c.level,
            c.seed_price,
            c.grow_hours,
            c.seasons,
            c.regrow_hours,
            c.yield_,
            c.sell_price,
            c.exp,
            steal_amount(i as u8 + 1).unwrap_or(0),
            steal_cap(i as u8 + 1).unwrap_or(0),
        );
    }
    o.push_str("],\"expand\":[");
    for i in INIT_PLOTS..MAX_PLOTS as u8 {
        if i > INIT_PLOTS {
            o.push(',');
        }
        let (level, price) = expand_cost(i);
        let _ = write!(o, "{{\"level\":{level},\"price\":{price}}}");
    }
    let _ = write!(
        o,
        "],\"initPlots\":{INIT_PLOTS},\"maxPlots\":{MAX_PLOTS},\"nameLen\":{NAME_LEN},\"headerLen\":{HEADER_LEN},\
         \"plotLen\":{PLOT_LEN},\"initGold\":{INIT_GOLD},\"hoursPerDay\":{HOURS_PER_DAY},\"dogLevel\":{DOG_LEVEL},\
         \"dogFoodPrice\":{DOG_FOOD_PRICE},\"dogBlockPercent\":{DOG_BLOCK_PERCENT},\
         \"problemPenaltyPercent\":{PROBLEM_PENALTY_PERCENT},\"helpExpPerDay\":{HELP_EXP_PER_DAY},\
         \"mischiefPerDay\":{MISCHIEF_PER_DAY},\"expClear\":{EXP_CLEAR},\"expHelp\":{EXP_HELP},\"expShovel\":{EXP_SHOVEL}}}"
    );
    respond(o.as_bytes())
}
