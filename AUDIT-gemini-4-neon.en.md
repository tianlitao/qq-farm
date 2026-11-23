# Ridge (CKB On-Chain Farm) Smart Contract Security Audit Report

[中文](AUDIT-gemini-4-neon.md) | **English**

| Field | Details |
| --- | --- |
| **Project** | Ridge · Fully On-Chain Farm on CKB (`qq_farm`) |
| **Auditor Model** | **Gemini 4 Neon** |
| **Audit Date** | 2026-11-23 |
| **Scope** | `contracts/farm`, `contracts/type-id`, `crates/farm-core`, `crates/farm-wasm`, `web/scripts/{deploy,upgrade,shutdown,env,key}.ts`, `web/src/chain/{farm,rules,network}.ts` |
| **Contract Binaries Audited (blake2b-256 / sha256)** | `build/farm` (51,760 B): blake2b `0xec8803d81c086f93e41335e74b375ba506d3ce54abd8cf354c26ac7c9469cad4` / sha256 `15ae10f746b4de5e9992dd97507f07a303917ee69ff3a07b649dceba9f6b97a6`<br>`build/type-id` (28,368 B): blake2b `0x3a353bb830b3bde3edacdc05ef9d209de35547230052c6b52cd1dd8a8a7e591c` / sha256 `e809f152889e000243366b375b53c392e9b912f897b7b63ca1ffd958764892cf` |
| **Baseline Test Suite** | `cargo test -p farm-tests`: 64/64 CKB-VM tests passing at time of initial audit |
| **Methodology** | Independent line-by-line source review (without reusing prior audit conclusions), CKB UTXO/Cell model & script-group semantics analysis, state-machine & economic invariant verification, deployment & ops script review |

> **Disclaimer**: This report was produced independently by **Gemini 4 Neon** based on static source analysis, CKB consensus-rule verification, and review of the test suite. It does not substitute for formal verification or manual penetration testing by a third-party professional security audit firm. At the time of this report's initial authoring, the contracts had not yet been deployed to CKB Mainnet; resolving the High/Medium issues and governance risks below was recommended before carrying real Mainnet funds.

---

## 1. Executive Summary

The overall architecture is clean and cohesive: the rules engine (`farm-core`) is written in `no_std` Rust and shared between the on-chain CKB script (`contracts/farm`) and the browser WASM (`crates/farm-wasm`). Farm cells combine a public lock script, a strict type-script state machine, and Type ID uniqueness to enable permissionless neighbor visits without requiring the owner's signature. Earlier fixes—blocking forged closes on strong-signature locks, preventing closing farms from acting as visitors, and eliminating self-mischief/help XP farming—are all active in the audited binary.

However, this independent audit by **Gemini 4 Neon** uncovered several previously unidentified or underestimated security vulnerabilities and logic defects:

### Findings Summary

| ID | Title | Severity | Affected Modules | Status |
| --- | --- | --- | --- | --- |
| **GN-01** | ACP / OmniLock-ACP users can be force-closed without a signature while the attacker **profits ~1 CKB per farm** (correcting earlier "purely unprofitable griefing" assumption) | **High** | `contracts/farm/src/main.rs`, `web/src/chain/farm.ts` | **Mitigated on frontend** (contract-level fix pending) |
| **GN-02** | Centralized single-key upgrade & burn authority can steal all locked farm deposits or permanently freeze assets | **High (Trust Model)** | `contracts/type-id`, `web/scripts/{deploy,upgrade}.ts` | Known / Unmitigated |
| **GN-03** | Historical header day-stepping ("Time-Travel") resets daily counters: a single farm can bypass `MISCHIEF_PER_DAY` and partially bypass `HELP_EXP_PER_DAY` by thousands of times | **Medium** | `contracts/farm/src/main.rs`, `crates/farm-core/src/lib.rs` | **Fixed & deployed (devnet & testnet)** |
| **GN-04** | `shutdown.ts` live-farm scan checks only the default `unit` world, missing non-default `unit` farms and risking permanent asset freeze by burning the `code` cell | **Medium** | `web/scripts/shutdown.ts` | **Fixed** |
| **GN-05** | Same-tx "drop weed + pull weed" zero-state-change visitor tx bypasses `E_NOTHING_HAPPENED`, enabling low-cost continuous liveness DoS when combined with GN-03 | **Medium** | `contracts/farm/src/main.rs`, `crates/farm-core/src/lib.rs` | **Fixed & deployed (devnet & testnet)** |
| **GN-06** | `apply_credit` consumes daily `help_today` quota even when clearing friend-planted weeds yields 0 XP, penalizing honest helpers | **Low** | `crates/farm-core/src/lib.rs` | Open |
| **GN-07** | Guard-dog and steal checks can be bypassed via offline key grinding, and the 16-bit `thief_slot` bitmap causes up to 37.5% false rejections for honest visitors | **Low** | `crates/farm-core/src/lib.rs` | Partially mitigated |
| **GN-08** | Game economy & mechanics boundaries: zero-penalty ripe `OP_CLEAR + OP_HARVEST` in one tx, +50% XP via two farms owned by the same player, per-farm mischief cap | **Low / Info** | `crates/farm-core/src/lib.rs` | Known / Open |
| **GN-09** | `transition()` does not skip farms with empty action lists (amplifying `O(N²)` cycle cost) and `level_of` uses a linear loop | **Info / Perf** | `crates/farm-core/src/lib.rs`, `contracts/farm/src/main.rs` | Open |
| **GN-10** | `farm.name` does not filter Unicode Bidi control characters; lock/type mode dispatch relies solely on `args.len()`; legacy scripts still reference old key paths | **Info** | `contracts/farm/src/main.rs`, `web/src/chain/rules.ts` | Open |

---

## 2. Architecture & Trust Boundary Assessment

1. **Dual-Role Script Model (`contracts/farm/src/main.rs`)**
   - A farm cell's lock script is `farm` (`args = []`), which simply verifies that every cell in `Source::GroupInput` carries a valid 36-byte-args `farm` type script (`check_lock`).
   - A farm cell's type script is `farm` (`args = unit:u32_le || type_id:[u8;32]`), enforcing 0/1-in, 0/1-out Type ID uniqueness (`check_type_id(4, 32)`) and verifying state transitions and capacity conservation across `create` / `update` / `close`.
   - **Positive assessment**: For standard strong-signature locks (e.g., `secp256k1_blake160`, non-ACP `JoyID`), `owner_pays` on `create`/`update` (requiring the owner lock in inputs with net `spent > 0`) and the dual condition on `close` (requiring the owner lock in inputs plus aggregated `closing_deposits` refund within `≤ 1 CKB`) effectively prevent strangers from stealing deposits or spending owner gold.
2. **Two-Cell Upgradeable Structure (`contracts/type-id/src/main.rs`)**
   - The `code` cell's type script is `type-id` (pinned to the validator binary via `hash_type: "data2"`). All farms reference the `code` cell's type script hash via `hash_type: "type"`.
   - The validator only enforces identity uniqueness and non-drift; it places no constraints on upgraded bytecode and permits burning the `code` cell.

---

## 3. Detailed Security Findings

---

### [GN-01] High: ACP / OmniLock-ACP Users Can Be Force-Closed Without a Signature While the Attacker Profits ~1 CKB per Farm

- **Locations**:
  - [contracts/farm/src/main.rs](contracts/farm/src/main.rs#L60-L62) (`CLOSE_FEE_ALLOWANCE`)
  - [contracts/farm/src/main.rs](contracts/farm/src/main.rs#L154-L197) (`owner_flow`, `closing_deposits`)
  - [contracts/farm/src/main.rs](contracts/farm/src/main.rs#L218-L248) (`close`)

#### Root Cause

To prevent tip-forged closes and weak-lock skimming, `close()` enforces two conditions:
```rust
let flow = owner_flow(&farm.owner)?;
if !flow.present {
    return Err(E_NOT_OWNER);
}
let gained = -flow.spent;
if gained + CLOSE_FEE_ALLOWANCE < closing_deposits(me, &farm.owner)? {
    return Err(E_NOT_OWNER);
}
```
where `CLOSE_FEE_ALLOWANCE = 100_000_000` (**1 CKB**).

Prior documentation (`README.md` line 220) and existing tests (`audit_round3.rs` lines 274–325, `audit_fable.rs` lines 105–111) mistakenly assumed that force-closing an Anyone-Can-Pay (ACP / OmniLock-ACP) owner's farm is "purely unprofitable griefing where the attacker pays out of pocket to refund the owner, leaving the victim's funds untouched." Those tests only verified that skimming 2 CKB is rejected, **overlooking that the deposit itself comes from the victim's farm cell and that a 1 CKB unchecked allowance exists**.

For any player using CKB's standard RFC-0026 ACP lock or OmniLock-ACP lock (both common in the CKB ecosystem and bundled in `devnet/specs/`), as long as their wallet has at least one live ACP cell (e.g., a `61 CKB` change cell left over from claiming or playing), **any stranger without the victim's signature** can construct the following valid transaction:

```text
Inputs:
  [0] Victim farm cell    (lock = farm_lock,  capacity = 332 CKB)
  [1] Victim ACP cell     (lock = victim_acp, capacity =  61 CKB)
  [2] Attacker cell       (lock = attacker,   capacity =  61 CKB)

Outputs:
  [0] Victim ACP cell     (lock = victim_acp, capacity = 392 CKB)    // = 61 + 332 - 1 CKB
  [1] Attacker cell       (lock = attacker,   capacity = 61.9999 CKB) // net profit +0.9999 CKB
```

Checking every on-chain rule:
1. **`victim_acp` lock script**: Output capacity increases by `+331 CKB` over input capacity (far above typical ACP `min_ckb` thresholds), with type script / UDT amounts unchanged — under RFC-0026, **passes with no owner signature**.
2. **`farm` type script (`close`)**:
   - `flow.present == true` (Input[1] has `victim_acp`);
   - `flow.spent = 61 - 392 = -331 CKB`, so `gained = +331 CKB`;
   - `closing_deposits = 332 CKB`;
   - `gained + CLOSE_FEE_ALLOWANCE = 331 + 1 = 332 >= 332` — **passes!**
3. **CKB capacity conservation**: Inputs `454 CKB`, outputs `453.9999 CKB`, fee `0.0001 CKB` — **passes!**

#### Impact

- **Direct Theft of Funds**: The attacker **pays nothing out of pocket** and instead **extracts `1 CKB - tx_fee ≈ 0.9999 CKB` net profit** from the victim's farm deposit on every forced close. An automated MEV/sweeper bot scanning the chain for ACP farms can run this profitably and continuously.
- **Permanent Destruction of Progress**: Months of player progression (up to 18 plots, gold, and crops) can be wiped out in a single transaction, and if the victim reclaims, the attacker can harvest another ~1 CKB again.
- Even lowering `CLOSE_FEE_ALLOWANCE` to `0.01 CKB` leaves the attack profitable as long as the allowance exceeds the actual miner fee (~`0.00005 CKB`).

#### Remediation

1. **Contract-level root fix (Recommended: two-step close `OP_MARK_CLOSING`)**:
   - Add an owner-only op (e.g., `OP_MARK_CLOSING`, requiring `owner_pays`, i.e., `flow.spent > 0` — even for ACP locks, decreasing capacity **strictly requires** the owner's private-key signature) that sets a "closing pending" flag in the farm state.
   - Require `close()` to verify that the farm has the "closing pending" flag set (while retaining the full deposit-refund check and tightening `CLOSE_FEE_ALLOWANCE` from `1 CKB` to `0.01 CKB`, i.e., `1_000_000` shannons).
   - This preserves the signature-agnostic architecture while making ACP / OmniLock-ACP users completely immune to unsigned forced closes and 1 CKB skimming.
2. **Frontend mitigation implemented (2026-11-23)**: [web/src/chain/farm.ts](web/src/chain/farm.ts) (`detectUnsupportedOwnerLock` + `createFarm` guard), [web/src/game.ts](web/src/game.ts), and [web/src/App.tsx](web/src/App.tsx) now block `AnyoneCanPay`, `OmniLock-ACP` (`args[21] & 0x02 !== 0`), and `AlwaysSuccess` addresses from claiming farms with bilingual warnings, while still allowing existing ACP farms to close and recover deposits. Note: this is a client-side guard; third-party transaction builders can still bypass it until the two-step contract fix is implemented.

---

### [GN-02] High (Trust Model): Single-Key Upgrade & Burn Authority Can Steal All Locked CKB or Permanently Freeze Assets

- **Locations**:
  - [contracts/type-id/src/main.rs](contracts/type-id/src/main.rs#L16-L21)
  - [web/scripts/deploy.ts](web/scripts/deploy.ts#L109-L135)
  - [web/scripts/upgrade.ts](web/scripts/upgrade.ts#L81-L110)

#### Root Cause

Both the **lock script** and **type script** of every farm cell point to the `code` cell's `codeScriptHash` via `hash_type: "type"`. The `code` cell is guarded by a single deployer `secp256k1` private key, and the `type-id` validator only enforces identity uniqueness — it neither constrains replacement bytecode nor forbids burning the `code` cell.

#### Impact

- **Total Theft (Rug Pull / Key Compromise)**: If the deployer key is compromised or acts maliciously, a single upgrade transaction replacing the `code` cell data with an `always_success` script allows **draining all CKB locked in every live farm cell on the network** (332–500+ CKB per farm).
- **Network-Wide Permanent Freeze**: If the deployer accidentally or maliciously burns the `code` cell, every unclosed farm loses its executable script permanently and deposits can never be recovered.

#### Remediation

Before holding meaningful Mainnet value, harden governance via one or more of:
1. **Hardware Multisig + On-Chain Timelock**: Move the `code` cell lock to an `M-of-N` hardware multisig, optionally wrapped in a delay lock (e.g., 7–14 days) so players can inspect upgrades and exit if desired.
2. **Renounce Upgrade Authority (Immutable Deployment)**: Once stable and third-party audited, transfer the `code` cell to an unspendable zero-hash (`nobody`) lock or deploy a `hash_type: "data2"` immutable version.
3. **Operational Isolation**: Never share the deployer key with a day-to-day wallet to avoid accidentally spending the `validator` or `code` cells.

---

### [GN-03] Medium: Historical Header Day-Stepping ("Time-Travel") Resets Daily Counters, Letting a Single Farm Bypass Mischief & Help Limits Thousands of Times

- **Locations**:
  - [contracts/farm/src/main.rs](contracts/farm/src/main.rs#L270-L289) (`input_block`, `proven_time`)
  - [crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs#L200-L215) (`Farm::new`)
  - [crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs#L518-L548) (`settle`, `roll_day`)
  - [crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs#L811-L829) (`OP_MISCHIEF`)

#### Root Cause

The contract resets `mischief_today` (cap 30) and `help_today` (cap 50) per game day via `roll_day()`:
```rust
fn roll_day(farm: &mut Farm, now: u32, unit: u32) {
    let day = now / (HOURS_PER_DAY * unit);
    if day > farm.day {
        farm.day = day;
        farm.help_today = 0;
        farm.mischief_today = 0;
    }
}
```
Four conditions compound here:
1. **New farms start at `day = 0`** (`Farm::new` line 207) without anchoring `day` to current chain time.
2. **Settled farms do not require their own block header**: `settle()` reads `input.block` only when a `pending` plot exists (lines 520–523). If the target farm has no pending plots, no recent block header needs to be included in `header_deps`.
3. **CKB allows referencing any historical block header since genesis in `header_deps`**: `proven_time()` simply takes the maximum timestamp among `header_deps`.
4. **`OP_MISCHIEF` and friend-weed `OP_HELP` never check `now`**: Even with a 2019 block timestamp, a visitor can drop and pull weeds on crops planted in 2026.

#### Attack Scenario

On CKB Mainnet (`unit = 3600`, spanning ~**2,560+ calendar days** since November 2019 genesis), an attacker needs only **1 fresh farm** (`farm.day = 0`, 332 CKB deposit fully refundable):
- **Tx 1**: Empty `header_deps` (`now = 0, day = 0`) → execute **30 `OP_MISCHIEF`** calls (`mischief_today: 0 -> 30`).
- **Tx 2**: Include only a block header from **2019-11-16 (day 18,216)** in `header_deps` → `roll_day()` sees `18,216 > 0`, **resets `mischief_today` and `help_today` to 0**, and executes **30 more `OP_MISCHIEF`** calls.
- **Tx 3**: Include a block header from **day 18,217** → `18,217 > 18,216`, **resets again**, and executes **30 more `OP_MISCHIEF`** calls.
- …and step forward day by day up to today (day 20,780).

#### Impact

- **Daily mischief cap completely broken**: A single farm can legally run `~2,560 × 30 ≈ 76,800` `OP_MISCHIEF` operations in minutes; once historical days are exhausted, closing and reopening a farm (~0.0002 CKB fee) resets `day` back to 0 indefinitely.
- **Thousands-fold amplification of liveness DoS**: Combined with **GN-05** below (same-tx drop+pull weed with zero state change), one farm can rotate a victim farm's OutPoint every block for negligible fees, continuously invalidating the victim's harvest, management, and even close transactions.
- **Partial bypass of `HELP_EXP_PER_DAY = 50`**: On crops spanning `K` game days (idle farms on Mainnet/Testnet, or 10 game days in 2 hours on devnet where `unit = 30`), an attacker can step through historical headers to harvest `50 × K` natural-problem help credits (`150 × K` XP) in a minute.

#### Remediation

1. **Anchor farm `day` to its own commit block (Core Fix)**:
   - In `update()`, require the transaction to include the `header_dep` of the block containing the farm's input cell (`input_block(mine)` must be `Some(block)`), guaranteeing `proven_time() >= block.timestamp`. Once a farm is committed at a block, no future transaction can time-travel earlier than that block.
   - For newly created farms (`day == 0`), initialize `farm.day` from the creation block header on the first `update()` (similar to `settle()`).
2. **Temporal consistency check**: In `OP_MISCHIEF`, require `now as u64 >= plot.planted_at as u64` for settled plots so pre-planting headers cannot be used to tamper with crops.

---

### [GN-04] Medium: `shutdown.ts` Live-Farm Check Misses Non-Default `unit` Worlds, Risking Permanent Asset Freeze

- **Location**:
  - [web/scripts/shutdown.ts](web/scripts/shutdown.ts#L44-L65)

#### Root Cause

Before burning the `code` cell, `shutdown.ts` lines 46–59 scan for live farms using:
```ts
const argsHex = ccc.hexFrom(ccc.numLeToBytes(deployment.unit, 4));
for await (const cell of client.findCellsOnChain({
  script: { codeHash: deployment.codeScriptHash, hashType: "type", args: argsHex },
  scriptType: "type",
  scriptSearchMode: "prefix",
  ...
}))
```
However, `contracts/farm/src/main.rs` allows **any player** to create farms under the same `codeScriptHash` with any valid `unit` (`1..=3600`). Different `unit` values form invisible parallel worlds that all share the exact same `code` cell. If any player or third-party client creates a farm with a non-default `unit` (e.g., `unit = 60`), `shutdown.ts` **completely misses it**, assumes zero live farms remain, and burns the `code` cell — **permanently freezing those farms' CKB**.

> **Cross-Verification Correction**: An earlier draft suspected that placing `validator` in both `cellDeps` and `inputs` of the same transaction would be rejected by CKB nodes. After verifying CKB's `resolve_transaction` semantics (within a single tx, `cell_deps` checks against prior transactions' `seen_inputs` and allows referencing an `input` of the same tx) and cross-checking against `glm-5.3-flash`'s live devnet test (which recovered 77,955 CKB in one transaction), that sub-finding was retracted. The cross-`unit` scan omission remains valid.

#### Remediation

- **Full prefix scan**: Change the scan in `shutdown.ts` to use `args: "0x"` (empty prefix) and also query `scriptType: "lock"` for `{ codeHash: deployment.codeScriptHash, hashType: "type", args: "0x" }` so every live cell across all `unit` worlds depending on the `code` cell is caught before burning.

---

### [GN-05] Medium: Zero-State-Change Visitor Transactions Bypass `E_NOTHING_HAPPENED`, Enabling Low-Cost Liveness DoS

- **Location**:
  - [contracts/farm/src/main.rs](contracts/farm/src/main.rs#L355-L358)

#### Root Cause

The contract intends to prevent strangers from pointlessly consuming another player's farm cell (`// Nobody gets to spend a farm cell just to get in its owner's way.`), yet checks only whether the action list is empty:
```rust
if cells[mine].actions.is_empty() && !outcome.needs_owner {
    return Err(E_NOTHING_HAPPENED);
}
```
It **never checks whether the farm's encoded output state actually changed**. A stranger can submit `[OP_MISCHIEF(actor, plot, KIND_WEED), OP_HELP(actor, plot, KIND_WEED)]` in the victim farm's witness: the output bytes are **byte-for-byte identical** to the input, yet the transaction passes and rotates the victim farm's `OutPoint`.

#### Impact

- In CKB's UTXO model, rotating a farm cell's `OutPoint` immediately invalidates any in-flight transaction the owner is signing, broadcasting, or waiting to confirm (harvest, expand, feed dog, or even **closing to withdraw deposit**).
- As long as the victim has a growing (or ripe, unharvested) crop, combining this with **GN-03** lets a single attacker farm sustain continuous liveness DoS for ~`0.0001 CKB` per tx.

#### Remediation

1. In `update()`, for non-owner transactions (`!outcome.needs_owner`), check net state change: if `actual == cells[mine].state`, return `E_NOTHING_HAPPENED`.
2. Forbid the same `actor` from executing both `OP_MISCHIEF` and `OP_HELP` on the same plot within the same transaction.
3. Combine with the **GN-03** fix to restore the intended daily rate-limit boundary.

---

### [GN-06] Low: `apply_credit` Consumes Daily `help_today` Quota Even on 0-XP Friend-Weed Clears

- **Locations**:
  - [crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs#L559-L571) (`apply_credit`)
  - [crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs#L622-L630) (`clear_problem`)

#### Root Cause

```rust
Credit::Help { earned } => {
    if farm.help_today < HELP_EXP_PER_DAY {
        farm.help_today += 1;
        if earned {
            farm.add_exp(EXP_HELP);
        }
    }
}
```
To prevent self-mischief XP loops, only natural problems (`earned == true`) award `EXP_HELP = 3`. However, `farm.help_today += 1` executes **outside** `if earned`, and `clear_problem()` prioritizes clearing friend-planted weeds/bugs (`friend_flag`) before natural ones.

#### Impact

- Honest players who clear weeds/bugs dropped by others receive 0 XP **and lose their 50/day XP-earning help quota (`HELP_EXP_PER_DAY`)**, depriving them of XP when later clearing genuine natural problems.
- Contradicts the constant's documented semantics (`Helping a neighbour only earns experience this many times a day`).

#### Remediation

Increment `help_today` only when XP is actually earned:
```rust
Credit::Help { earned } => {
    if earned && farm.help_today < HELP_EXP_PER_DAY {
        farm.help_today += 1;
        farm.add_exp(EXP_HELP);
    }
}
```

---

### [GN-07] Low: Guard-Dog & Anti-Repeat Steal Checks Can Be Bypassed via Offline Key Grinding, and 16-Bit `thief_slot` Causes High False-Positive Rejection Rate

- **Locations**:
  - [crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs#L481-L489) (`thief_slot`, `dog_blocks`)
  - [crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs#L504-L514) (`check_steal`)

#### Root Cause

```rust
pub fn thief_slot(plot: &Plot, thief: &[u8; 32]) -> u16 {
    1 << (mix32(id_word(thief, 0) ^ plot.seed) & 15)
}

pub fn dog_blocks(plot: &Plot, thief: &[u8; 32]) -> bool {
    mix32(id_word(thief, 4) ^ plot.seed ^ 0x0d06_0d06) % 100 < DOG_BLOCK_PERCENT
}
```
1. **Offline Key Grinding**: Once settled (or even immediately upon planting-block publication), `plot.seed` is public. An attacker can offline-generate wallet keys (distinct `owner` lock hashes) — averaging just 2 tries per target — to find addresses that satisfy `!dog_blocks` and hit unused `thief_slot` bits, temporarily open 6–7 farms with refundable 332 CKB deposits, drain the full 40% `steal_cap`, and close to recover CKB. Likewise, an owner can self-steal their own 40% share with alt accounts to keep 100% yield and block all neighbors.
2. **16-Slot Hash Collisions**: `plot.thieves` is only `u16` (16 slots). For high-yield crops (e.g., cherry: 36 yield, 2 per steal, cap 14 → 7 steals), once 6 players have stolen, **`6 / 16 = 37.5%` of completely unrelated honest neighbors** receive `Error::AlreadyStolen` due to hash collision.

#### Impact

- No CKB funds are at risk; total yield loss is hard-capped at `STEAL_CAP_PERCENT = 40%`. However, this weakens the guard dog (300 gold/day) and "once per player per season" fairness, and degrades UX on popular farms.

#### Remediation

- In a future state-format upgrade (`VERSION = 2`), widening `thieves` to `u32` or `u64` (2–6 extra bytes per plot, i.e., 2–6 CKB deposit) reduces the 6-thief collision rate from 37.5% to 18.8% (`u32`) or 9.4% (`u64`).
- To deter post-planting dog grinding, bind dog checks to a commit-reveal scheme or require `visitor.created_at < plot.planted_at` so fresh keys cannot be ground against a specific `plot.seed`.

---

### [GN-08] Low / Info: Game Mechanics & Economic Boundaries

1. **Zero-Penalty Ripe `OP_CLEAR + OP_HARVEST` in One Transaction ([crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs#L776-L784))**:
   - `OP_CLEAR` does not require `now < ripe_at`. Since all natural problems trigger strictly before `ripe_at`, an owner never needs to tend crops while growing — they can simply batch `[OP_CLEAR(...), OP_HARVEST(...)]` after ripening to collect 100% yield plus clear XP. If mid-growth tending is intended as core gameplay, disallow clearing natural problems on ripe plots (or explicitly document it as a quality-of-life feature).
2. **+50% XP via Two Farms Owned by the Same Player ([crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs#L788-L810))**:
   - `OP_CLEAR` grants `EXP_CLEAR = 2` while `OP_HELP` grants `EXP_HELP = 3`, and `OP_HELP` checks only `actor != input.index` rather than `actor_owner != farm.owner`. A player with two farms can use Farm B to clear Farm A's natural problems for +50% XP. Consider checking `actor_owner != farm.owner` or equalizing XP values.
3. **Daily Mischief Cap Is Per Farm, Not Per Player**:
   - Opening `N` farms grants `30 × N` mischief actions/day (even after fixing GN-03). Bounded by the per-plot-per-season 1-weed/1-bug hard cap, this is an acceptable Low-severity limitation as long as it remains transparently disclosed.

---

### [GN-09] Info / Performance: `transition()` Does Not Skip Empty-Action Farms & `level_of` Linear Loop

- **Locations**:
  - [crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs#L890-L906) (`transition`)
  - [crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs#L339-L345) (`level_of`)

#### Analysis

1. `is_visitor()` line 923 properly skips empty action lists (`if i == me || other.actions.is_empty() { continue; }`), whereas `transition()` line 891 only checks `if i == me { continue; }`. In a typical "1 visitor farm visiting `N` neighbor farms" transaction, the visitor farm's `actions` are empty, yet all `N` neighbor scripts redundantly decode, `settle`, and `roll_day` it `N` times — and if the empty-action farm happens to have a pending plot without its block header attached, this triggers an unnecessary `MissingHeader` error.
2. `level_of(exp: u32)` loops linearly; negligible at normal levels, but near `u32::MAX` it iterates ~9,268 times per call (`OP_BUY_SEED` / `OP_EXPAND` / `OP_FEED_DOG`). Replacing it with integer square root or binary search reduces it to `O(1)` / `O(log L)`.

#### Remediation

Change `transition()` line 891 to `if i == me || other.actions.is_empty() { continue; }` to reduce batch-visit on-chain cycle costs with zero semantic change.

---

### [GN-10] Info: Additional Code Robustness & Operational Details

1. **Lock/Type Mode Dispatch Relies Solely on `args.len()` ([contracts/farm/src/main.rs](contracts/farm/src/main.rs#L78-L86))**:
   - `run()` dispatches to `check_lock` vs `check_type` solely based on `args.len() == 0` vs `36`. Safe for all protocol-generated farms, but if third-party tooling mistakenly sets `args = []` as a type script (passes on creation with empty `GroupInput`, permanently fails with `E_NOT_A_FARM` on spend) or `args = 36B` as a lock script on a typeless cell (`world()` fails with `E_SYSCALL`), the non-standard cell is permanently frozen. Document strict usage constraints in SDK/docs.
2. **`farm.name` Does Not Filter Unicode Bidi Control Characters ([web/src/chain/rules.ts](web/src/chain/rules.ts#L249-L259))**:
   - On-chain names allow arbitrary 18 bytes. Frontend `decodeName` strips C0/DEL control chars and replacement chars (and React prevents HTML XSS), but leaves Unicode Bidi override characters (`U+202A`–`U+202E`, `U+2066`–`U+2069`) unfiltered, allowing visual text-reversal spoofing in the neighbors list. Extend the frontend strip regex to cover Bidi ranges.
3. **Transaction Composition Trade-Off Between `owner_pays` and `close`**:
   - Because `owner_pays` (`flow.spent > 0`) and `close` (`gained + 1 CKB >= closing_deposits`) have opposite capacity-flow signs, an owner cannot close Farm A and perform an owner op on Farm B in the same transaction, nor close directly into a different address (must split into two transactions). This is a reasonable trade-off for signature-agnostic weak-lock defense; note it clearly in client UX.
4. **Legacy Scripts Referencing Old Key Paths**:
   - `web/scripts/env.ts` and `web/scripts/key.ts` enforce `0600` permissions and forbid `--privkey`; however `web/scripts/e2e.ts`, `cleanup-old.ts`, and `close-remaining.ts` still reference `../.testnet-deployer.key` / `../.testnet-visitor.key` directly. Migrate them to `signingKey()` for consistency.

---

## 4. Verified Security Properties (Positive Findings)

The following core security properties were independently verified on the audited binary (`0xec8803d8…`):

- **Strong-Signature Lock Theft Protection**: For standard strong-signature locks (`secp256k1`, non-ACP `JoyID`), strangers cannot invoke any owner op (`OP_BUY_SEED`..`OP_RENAME`), cannot forge a close with a tip, and cannot steal farm deposits.
- **Deterministic State Transitions & Anti-Forgery**: The farm type script byte-compares `farm_core::transition` output against `GroupOutput` data, preventing forgery of gold, XP, plot count, harvests, dog expiration, or owner lock hash.
- **Closing-Visitor Escape Closed**: `close()` enforces both `E_CLOSE_WITH_ACTIONS` (52) and `is_visitor` (`E_CLOSING_VISITOR` = 54), ensuring a closing farm cannot participate as a visitor in any steal, help, or mischief action.
- **Monotonic Capacity**: `update()` enforces `capacity_out >= capacity_in` (`E_CAPACITY` = 45), and `create()`/`update()` lock outputs to `farm_lock` (`E_LOCK` = 44), preventing deposit extraction during normal play.
- **Integer Overflow & Bounds Safety**: `contracts/Cargo.toml` enables `overflow-checks = true` in release profile, and core accounting (`gold`, inventory, dog expiry, `i128` `owner_flow`, `u32::try_from` in `seconds()`) uses checked or saturating arithmetic with no exploitable overflow found.
- **Multi-World Isolation**: `world()` strictly filters transaction farms by `same_code` and `unit` prefix, preventing cross-`unit` stealing or credit passing.

---

## 5. Remediation Priority Roadmap

| Priority | ID | Action Item |
| --- | --- | --- |
| **P0 (Before Mainnet)** | **GN-01** | Introduce two-step close (`OP_MARK_CLOSING` requiring `owner_pays`) and tighten `CLOSE_FEE_ALLOWANCE` to eliminate profitable unsigned forced closes & 1 CKB theft on ACP / OmniLock-ACP locks |
| **P0 (Before Mainnet)** | **GN-02** | Eliminate single hot-key upgrade authority: transition to hardware multisig + timelock governance, or permanently renounce upgrade authority once stable |
| **P1 (Strongly Recommended)** | **GN-03 & GN-05** | Require `update()` to attach the farm's own commit block header to anchor `proven_time()`, anchor new farm `day` on first update, check `now >= planted_at` in `OP_MISCHIEF`; reject zero-state-change (`actual == input`) pure visitor transactions |
| **P1 (Strongly Recommended)** | **GN-04** | Change `shutdown.ts` live-farm scan to full prefix `args: "0x"` (covering both `type` and `lock` queries across all `unit` worlds) |
| **P2 (UX & Optimization)** | **GN-06, GN-07, GN-09, GN-10** | Increment `help_today` in `apply_credit` only when `earned == true`; skip empty-action farms in `transition()`; strip Bidi chars in frontend `decodeName`; consider wider `thieves` bitmap and anti-grinding rules in future versions |

---

*Audit completed by: Gemini 4 Neon (2026-11-23)*
