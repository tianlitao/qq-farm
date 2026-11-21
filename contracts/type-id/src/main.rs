//! The type id validator, the type script of the upgradable farm code cell.
//!
//! It enforces the Type ID rule: the code cell exists at most once, and every
//! spend that recreates it keeps the very same type id. That is what lets
//! `scripts/upgrade.ts` swap the farm rules in place — farm cells reference
//! the code cell by this type id, and the id cannot drift.

#![no_std]
#![no_main]

use ckb_std::type_id::check_type_id;

ckb_std::entry!(program_entry);
ckb_std::default_alloc!();

fn program_entry() -> i8 {
    match check_type_id(0, 32) {
        Ok(()) => 0,
        Err(_) => 43, // E_TYPE_ID, same code the farm script uses
    }
}
