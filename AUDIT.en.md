# Ridge (CKB On-Chain Farm) Consolidated Security Audit Report (AUDIT.en.md)

[中文](AUDIT.md) | **English**

> This document consolidates, deduplicates, and cross-verifies all findings, fixes, and reconciliations from four independent AI model security audits as the unified security baseline for the current repository and deployed binary (`0x4e2dc632…55bf`).
>
> **Disclaimer**: This report is a consolidation of four AI model audits and **does not substitute for a manual security audit or formal verification by a third-party auditing firm**. The contracts are live on CKB Mainnet Beta and Testnet; please review the disclosed trust model and known boundaries below before participating.

---

## 1. Overview of the Four Constituent Audit Reports

| Auditing Model | Report File | Date | Scope & Unique Contributions |
| --- | --- | --- | --- |
| **glm-5.3-flash** | [AUDIT-glm-5.3-flash.md](AUDIT-glm-5.3-flash.md) | 2026-11-21 – 11-23 | v2 launch & 5 review rounds: first reported ACP owner-auth bypass (V1), Sybil stealing (V3), `O(N²)` cycle benchmarks (V4), upgrade self-healing & `public/deployments.json` (V5), `key.ts`/i18n/stale-list bugs (K1/K2/R5-1), and live devnet `shutdown.ts` recovery verification (77,955 CKB) |
| **qwen4-max** | [AUDIT-qwen4-max.md](AUDIT-qwen4-max.md) | 2026-11-21 – 11-23 | 4 review rounds: uncovered the critical Round-2 regression allowing anyone to close any farm for a 61 CKB tip (R3-F1), first reported the mischief-help XP farming loop (R3-F2), demonstrated offline guard-dog key grinding (R3-F3, 31,856 attempts), caught broken mainnet client wiring (R3-F4), and verified fixes in Round 4 |
| **Claude Fable 5.2** | [AUDIT-fable-5.2.md](AUDIT-fable-5.2.md) | 2026-11-21 – 11-23 | Independently found & fixed the close authorization vulnerability (FB-1), discovered & fixed the closing-visitor mischief-limit bypass (FB-2, exit code 54), highlighted per-farm mischief limits (FB-3) and OutPoint-churn griefing (FB-5), and implemented `rust-toolchain.toml` pinning & `0600` keyfile enforcement |
| **Gemini 4 Neon** | [AUDIT-gemini-4-neon.md](AUDIT-gemini-4-neon.md) | 2026-11-23 | Independent line-by-line audit: corrected the prior three reports' misconception that ACP forced-close was "loss-making griefing", proving an attacker can skim `CLOSE_FEE_ALLOWANCE = 1 CKB` for **~0.9999 CKB net profit + farm destruction** (GN-01); first discovered **Historical Header Day-Stepping (Time-Travel Counter Reset)** (GN-03), `shutdown.ts` missing non-default `unit` worlds (GN-04), `apply_credit` burning honest `help_today` quota on 0-XP friend weeds (GN-06), `transition()` replaying empty-action farms (GN-09), and missing Unicode Bidi filtering (GN-10) |

---

## 2. Current Audit Baseline & Executive Summary

### 2.1 Audited Targets & Live Binaries
- **Core Contracts & Rules**: `contracts/farm/src/main.rs`, `contracts/type-id/src/main.rs`, `crates/farm-core/src/{lib,crops}.rs`, `crates/farm-wasm/src/lib.rs`
- **Deployed Binaries (identical across Mainnet, Testnet, and Devnet)**:
  - `build/farm` (52,008 bytes): blake2b-256 `0x4e2dc6328519ad576cb9963f7693ae2a9b4ebc914c555bd5793975fd3a4055bf` / sha256 `deb85f6f6a08fd98e5176e3e73010300d1e4be23813485dcf92f4fd3779567ab`
    - **Mainnet Beta**: code cell `0xee0a27d9ccc317c7d4014c3e6683cb2a8d335d709d5afeb02939a4909772cebe:0`, validator `0xa97335c213caf920e580e13488168da930d50ccee085af1c1c13e009135ff495:0` (`codeScriptHash` `0x578e1f83…cfbf12b`, web: https://ckb-farm.pages.dev)
    - **Testnet**: upgrade tx `0xcb92cb0103c87b76d7be2a7cb2010eb36074c021339cd6417b0c39a9dc454df5` (`codeScriptHash` `0x0253fea2…9f775d` unchanged, web: https://ckb-farm-testnet.pages.dev)
    - **Devnet**: upgrade tx `0xec7304f6fb35421b73a75bce3fa48c98c64df672fbef3d256bb0e54734ef0c7d` (`codeScriptHash` `0x60a2616b…0b3bd` unchanged)
  - `web/src/chain/farm_wasm.wasm` (34,017 bytes): sha256 `b2d5eb508898717e6be68881cae0ceacbeefa7891d47883530d2737342363ec4`
  - `build/type-id` (28,368 bytes, unchanged): blake2b-256 `0x3a353bb830b3bde3edacdc05ef9d209de35547230052c6b52cd1dd8a8a7e591c` / sha256 `e809f152889e000243366b375b53c392e9b912f897b7b63ca1ffd958764892cf`
- **Verification Baseline**: `cargo test -p farm-tests` **69/69 passing** in real CKB-VM (including 3 new regression tests in `tests/tests/audit_gemini.rs`); devnet `npm run e2e` **13/13 steps passing**; testnet verified with real browser wallets; `tsc --noEmit` and 18 cross-network `detectUnsupportedOwnerLock` assertions passing.

### 2.2 Executive Verdict
- **Strong-signature wallet security is solid; all High and Medium issues are fixed or mitigated and live on Mainnet & Testnet**:
  - For standard signature-requiring locks (`secp256k1`, `JoyID`, non-ACP `OmniLock`), no unauthorized path exists to spend a farm's gold or steal its CKB deposit under the current rules;
  - **All three Medium-severity issues** (**OPEN-03** historical header day-stepping, **OPEN-04** zero-state-change visitor DoS, **OPEN-05** `shutdown.ts` cross-`unit` scan) **are fixed and live** across Mainnet, Testnet, and Devnet (`0x4e2dc632…55bf`);
  - **OPEN-01** (profitable forced closure of ACP / OmniLock-ACP farms) is **mitigated on the official frontend** by blocking `OmniLock-ACP`, RFC-0026 `AnyoneCanPay`, and `AlwaysSuccess` locks from claiming new farms while preserving close/reclaim functionality.
- **Disclosed design boundaries & optional future hardening**:
  1. **Single-admin upgrade & burn authority** (`OPEN-02`, trust model): intentionally chosen by the project team for agile upgrades and clearly disclosed in the README, Rules drawer, and this report;
  2. **OPEN-01 contract-level residual**: the frontend guard cannot stop a third-party client from claiming with an ACP lock directly (full on-chain elimination requires a two-step close opcode);
  3. **Low / Informational items** (`OPEN-06` – `OPEN-09`): gameplay and performance refinements with no CKB fund risk for strong-signature wallets.

---

## 3. Unified Findings Register (Open, Mitigated, and Recently Fixed)

| Unified ID | Severity & Status | Title | Original IDs | Files |
| --- | --- | --- | --- | --- |
| **OPEN-01** | **High** (Mitigated on Frontend) | ACP / OmniLock-ACP users vulnerable to signatureless profitable force-close (~1 CKB theft + farm destruction); official frontend now blocks claiming with ACP locks (contract residual for 3rd-party clients) | **GN-01** (corrects V1 / R3-F1d / FB-7) | `contracts/farm/src/main.rs`, `web/src/chain/farm.ts` |
| **OPEN-02** | **High (Trust Model)** | Centralized single-key upgrade & burn authority (intentional design, disclosed) | **V2 / F2 / FB-4 / GN-02** | `contracts/type-id`, `web/scripts/{deploy,upgrade}.ts` |
| **OPEN-03** | **Medium** (**Fixed & Live**) | Historical header day-stepping (time-travel) resets daily counters; fixed via visitor block-header anchoring & `now >= planted_at` check | **GN-03** | `contracts/farm/src/main.rs`, `crates/farm-core/src/lib.rs` |
| **OPEN-04** | **Medium** (**Fixed & Live**) | Same-tx `OP_MISCHIEF + OP_HELP` & zero-state-change visitor OutPoint-churn DoS; fixed in `farm-core` and `update()` | **FB-5 / GN-05** | `contracts/farm/src/main.rs`, `crates/farm-core/src/lib.rs` |
| **OPEN-05** | **Medium (Ops)** (**Fixed**) | `shutdown.ts` pre-burn scan only checked a single `unit` world; fixed to full `args: "0x"` scan across `type` & `lock` | **GN-04** (reconciled) | `web/scripts/shutdown.ts` |
| **OPEN-06** | **Low** | `apply_credit` increments `help_today` even on 0-XP friend-weed clearing | **GN-06** | `crates/farm-core/src/lib.rs` |
| **OPEN-07** | **Low (Design Residual)** | Guard dog & thief slots are offline-grindable with fresh keys; 16-bit `thief_slot` bitmap causes up to 37.5% false collisions on high-yield crops | **V3 / R3-F3 / FB-6 / GN-07** | `crates/farm-core/src/lib.rs` |
| **OPEN-08** | **Low (Game Mechanics)** | Per-farm mischief limit; zero-penalty harvest-time `OP_CLEAR + OP_HARVEST`; +50% XP from same-owner cross-farm `OP_HELP` | **FB-3 / R4-FB3 / GN-08** | `crates/farm-core/src/lib.rs` |
| **OPEN-09** | **Info / Optimization** | `level_of` linear loop, lock/type `args.len()` dispatch edge case, Unicode Bidi filtering, single RPC without fallback, `elliptic` low advisories | **V4 / F4 / F5 / FB-8 / FB-9 / R5-3 / GN-09 / GN-10** | Multiple files |

---

### [OPEN-01] High (Frontend Mitigated): Profitable Signatureless Force-Close & ~1 CKB Theft on ACP / OmniLock-ACP Locks

- **Origin & Cross-Audit Correction**: **Gemini 4 Neon (GN-01)** — corrects earlier under-assessments in **glm-5.3-flash (V1)**, **qwen4-max (R3-F1d)**, and **Claude Fable 5.2 (FB-7)** which treated the ACP close residual as *"loss-making griefing paid out of the attacker's pocket."*
- **Locations**: `contracts/farm/src/main.rs#L60-L62`, `#L154-L197`, `#L218-L248`
- **Mechanism**:
  - `close()` requires `flow.present` and `-flow.spent + CLOSE_FEE_ALLOWANCE (1 CKB) >= closing_deposits`.
  - For a player using RFC-0026 Anyone-Can-Pay or OmniLock-ACP (`args[21] & 0x02 != 0`) who holds any live ACP cell (e.g., `61 CKB` change), an attacker without the victim's signature can spend the victim's farm (`332 CKB`) alongside that ACP cell (`61 CKB`), increase the ACP output to `61 + 331 = 392 CKB` (passing ACP without a signature), and pocket `1 CKB - tx_fee ≈ 0.9999 CKB`.
  - Because the refund comes from the victim's own farm cell rather than the attacker's wallet, the attack yields **~0.9999 CKB net profit per farm** while permanently wiping out the victim's farm progress.
- **Status & Remediation**:
  - **Frontend mitigation deployed (2026-11-23)**: `detectUnsupportedOwnerLock` and `createFarm` in `web/src/chain/farm.ts`, plus `web/src/game.ts` and `web/src/App.tsx`, block claiming new farms with `OmniLock-ACP` (`args[21] & 0x02 !== 0`), RFC-0026 `AnyoneCanPay`, or `AlwaysSuccess` locks (verified with 18 assertions across devnet/testnet/mainnet), while still permitting existing farms to close and recover CKB.
  - **Optional contract-level full fix**: Introduce a two-step close (`OP_MARK_CLOSING` requiring `owner_pays`, i.e. `flow.spent > 0`, which ACP cannot satisfy without a signature) and tighten `CLOSE_FEE_ALLOWANCE` to `0.01 CKB`.

---

### [OPEN-02] High (Trust Model): Centralized Single-Key Upgrade & Burn Authority

- **Origin**: Confirmed across **all four reports** (**V2 / F2 / FB-4 / GN-02**).
- **Locations**: `contracts/type-id/src/main.rs#L16-L21`, `web/scripts/deploy.ts`, `web/scripts/upgrade.ts`
- **Mechanism & Impact**: Farm cells reference the `code` cell via `hash_type: "type"` for both lock and type scripts. The Type ID validator enforces identity uniqueness only — it does not restrict new binaries and permits burning. Compromising or misusing the deployer key could drain all locked farm CKB via a malicious upgrade or permanently freeze all farms via a burn.
- **Status**: Intentional operational design explicitly disclosed to users across the README, Rules drawer, and this report. Keep the mainnet deployer key backed up offline; can be migrated later to multisig/timelock or permanently renounced by transferring the code cell to an all-zero lock.

---

### [OPEN-03] Medium (**Fixed & Live**): Historical Header Day-Stepping (Time-Travel Counter Reset)

- **Origin**: **Gemini 4 Neon (GN-03)** (missed by prior three audits).
- **Locations**: `contracts/farm/src/main.rs#L270-L289`, `crates/farm-core/src/lib.rs#L200-L215`, `#L518-L548`, `#L806-L845`, `#L902-L934`
- **Original Vulnerability**: Newly created farms started at `day = 0`; settled target farms did not require their committing block header; CKB allows any historical block header since genesis in `header_deps`; and `OP_MISCHIEF` never checked `now`. A single attacker farm could step through ~2,560+ historical CKB mainnet days in minutes, resetting `mischief_today` repeatedly (~76,800+ mischief actions from one farm) and partially bypassing `HELP_EXP_PER_DAY` on aged crops.
- **Fix (Live on Mainnet, Testnet, & Devnet)**:
  1. In `farm-core::transition()`, any farm receiving daily-capped credits (`Credit::Help` or `Credit::Mischief`) must include its own committing block header (`mine.block.is_some()` and `clock.now >= block.timestamp`, else `Error::MissingHeader`), cryptographically anchoring `proven_time()` to the visitor farm's most recent on-chain commit (also skipping `other.actions.is_empty()`, reducing 2-farm steal cycles from `298,313` to `291,243`);
  2. `OP_MISCHIEF` rejects `now < plot.planted_at` on settled plots (`Error::NeedTime`);
  3. Verified in CKB-VM by `gn03_historical_header_day_stepping_is_refused` and `gn03_help_also_requires_visitor_block_header` (`tests/tests/audit_gemini.rs`).

---

### [OPEN-04] Medium (**Fixed & Live**): Zero-Effect Visitor Griefing / OutPoint-Churn Liveness DoS

- **Origin**: **Claude Fable 5.2 (FB-5)**, **Gemini 4 Neon (GN-05)**.
- **Locations**: `contracts/farm/src/main.rs#L355-L372`, `crates/farm-core/src/lib.rs#L668-L845`
- **Original Vulnerability**: `update()` previously only rejected empty action lists, allowing a stranger to execute `[OP_MISCHIEF, OP_HELP]` in one transaction to leave a victim farm byte-for-byte unchanged while churning its `OutPoint` and invalidating the owner's in-flight transactions (including `closeFarm`).
- **Fix (Live on Mainnet, Testnet, & Devnet)**:
  1. `farm-core::run_actions()` tracks `mischief_this_tx` and rejects `OP_HELP` clearing a weed/pest placed in the same transaction (`Error::BadAction`);
  2. `contracts/farm/src/main.rs::update()` rejects any visitor-only spend (`!outcome.needs_owner`) whose output state equals its input state (`E_NOTHING_HAPPENED` = 51);
  3. Verified in CKB-VM by `gn04_same_tx_mischief_and_help_is_refused`, `probe_exp_from_clearing_own_mischief`, and `r3_help_exp_mischief_loop`.

---

### [OPEN-05] Medium / Ops (**Fixed**): `shutdown.ts` Missed Live Farms in Non-Default `unit` Worlds

- **Origin & Reconciliation**: **Gemini 4 Neon (GN-04)** *(initial concern regarding single-tx `validator` in both `cellDeps` and `inputs` was retracted after verifying CKB's `resolve_transaction` same-tx semantics and `glm-5.3-flash`'s devnet 77,955 CKB recovery test; the cross-`unit` scan omission was confirmed)*.
- **Location**: `web/scripts/shutdown.ts#L44-L66`
- **Fix**: Updated `shutdown.ts` to scan with empty prefix `args: "0x"` across both `scriptType: "type"` and `scriptType: "lock"` (deduplicated by `txHash:index`), ensuring no cell in any `unit` world can be stranded before burning the code cell.

---

### [OPEN-06] Low: `apply_credit` Consumes `help_today` Quota on 0-XP Friend Weeds

- **Origin**: **Gemini 4 Neon (GN-06)** (`crates/farm-core/src/lib.rs#L559-L571`).
- **Details**: Clearing a friend-planted weed/pest (`earned == false`) awards 0 XP yet still increments `farm.help_today` (and `clear_problem()` clears friend flags before natural problems). Honest helpers clearing mischief weeds can prematurely exhaust their 50/day XP-earning help quota.
- **Recommended Fix**: Move `farm.help_today += 1` inside `if earned && farm.help_today < HELP_EXP_PER_DAY`.

---

### [OPEN-07] Low (Design Residual): Guard Dog Key Grinding & 16-Slot `thief_slot` Collisions

- **Origin**: **qwen4-max (R3-F3 / F3)**, **Claude Fable 5.2 (FB-6)**, **glm-5.3-flash (V3)**, **Gemini 4 Neon (GN-07)** (`crates/farm-core/src/lib.rs#L481-L514`).
- **Details**:
  1. `dog_blocks` and `thief_slot` are deterministic functions of `(owner[0..8], public plot.seed)`. `r3_dog_grind_still_possible` found an 18-plot dog-evading key in 31,856 attempts. The 40% `STEAL_CAP_PERCENT` remains the sole hard bound.
  2. With a 16-bit `thieves` bitmap, after 6 players pick a high-yield crop like Cherry, unrelated honest neighbors face up to a `6/16 = 37.5%` false `AlreadyStolen` collision rate.

---

### [OPEN-08] Low (Game Mechanics): Per-Farm Mischief Cap, Harvest-Time Clearing, & Same-Owner Self-Help

- **Origin**: **Claude Fable 5.2 (FB-3)**, **qwen4-max (R4-FB3)**, **Gemini 4 Neon (GN-08)**.
- **Details**:
  1. `MISCHIEF_PER_DAY = 30` is tracked per farm rather than per owner (hard cap: 1 friend weed + 1 friend pest per plot per season);
  2. `OP_CLEAR` does not require `now < ripe_at`, allowing owners to batch `[OP_CLEAR, OP_HARVEST]` at maturity for 0% neglect penalty;
  3. `OP_HELP` (3 XP) does not forbid `actor_owner == farm.owner`, giving +50% XP over `OP_CLEAR` (2 XP) via a second farm.

---

### [OPEN-09] Informational & Operational Notes

- **Origin**: Consolidated from all four reports (**V4 / F4 / F5 / FB-8 / FB-9 / R5-3 / GN-09 / GN-10**).
- **Items**:
  - `level_of(exp)` linear loop (bounded at ~9,268 iterations for `u32::MAX`);
  - Lock/type dispatch solely by `args.len()` (non-standard manual cells with `farm(args=0)` as type or `farm(args=36)` as lock are unspendable);
  - Owner authorization assumes full-transaction signatures (incompatible with partial-sighash / open-tx locks) and prevents closing one farm while mutating another in the same tx;
  - `decodeName` (`web/src/chain/rules.ts`) strips C0/DEL control characters (and React prevents HTML XSS) but does not strip Unicode Bidi override characters (`U+202A–U+202E`, `U+2066–U+2069`);
  - Single public RPC per network without fallbacks; `findFarmByOwner` displays only the first farm per wallet; 23 upstream low-severity `elliptic` advisories via `@ckb-ccc`; legacy keyfile paths in `e2e.ts`/`cleanup-old.ts`/`close-remaining.ts`.

---

## 4. Resolved Historical Findings

| ID | Original Severity | Summary | Source IDs | Resolution & Verification |
| --- | --- | --- | --- | --- |
| **FIXED-01** | **Critical / High** | Round-2 direction-only close allowed any stranger to close any farm for a 61 CKB tip and steal ~270 CKB | **R3-F1 / FB-1** | Dual-condition `close()`: owner input present **and** combined `closing_deposits` returned to owner (`≤ 1 CKB` allowance). Verified by `audit_fable.rs` (8 tests), `audit_round3.rs`, and live nodes (ACP residual tracked in **OPEN-01**) |
| **FIXED-02** | **Medium** | v1 `owner_present` allowed ACP locks to impersonate owner actions and create ghost farms | **V1 / F1** | `create()` and `update()` enforce `owner_pays` (`present && spent > 0`) |
| **FIXED-03** | **Medium** | Same-tx mischief+help loop minted 90 XP per transaction | **R3-F2** | `Credit::Help { earned }` awards XP only for natural problems (and same-tx loop is now fully rejected under **OPEN-04**) |
| **FIXED-04** | **Low** | Closing farm named as visitor bypassed `MISCHIEF_PER_DAY` and burned stolen fruit | **FB-2** | `close()` calls `is_visitor()`, rejecting with `E_CLOSING_VISITOR` (54); verified by `audit_fable_r2.rs` (6 tests) & live nodes |
| **FIXED-05** | **Medium (Eng)** | `createClient("mainnet")` returned `ClientPublicTestnet` and `key.ts` used wrong mainnet scripts | **R3-F4 / F5** | Fixed to `ClientPublicMainnet` across `network.ts` and `key.ts` |
| **FIXED-06** | **Low (Design)** | Per-farm steal tracking allowed same-owner multi-farm Sybil stealing | **V3 / F3** | `thief_slot` and `dog_blocks` keyed on visitor's `owner` lock hash (`r3_sybil_fix_holds_and_honest_steal_works`) |
| **FIXED-07** | **Low (Scale)** | Batch visiting >40 farms hit CKB's 70M cycle limit | **V4 / F4** | Client `play()` chunks visits to `≤ 24` farms/tx (~25.6M cycles) |
| **FIXED-08** | **Low (Ops/UI)** | Upgrade outpoint recovery, ghost farms in list, toolchain pinning, CLI `--privkey` exposure, `key.ts` arg parsing, English i18n, and `bots/e2e` viewer id | **V5 / K1 / K2 / R5-1 / Fable 11-23** | All resolved (`rust-toolchain.toml` 1.98.1, `0600` keyfile enforcement, `upgrade.ts` self-healing, live-set list pruning, fixed `key.ts`/i18n/`bots.ts`/`e2e.ts`) |

---

## 5. Verified Core Security Invariants

Confirmed across all four audits, 69 CKB-VM tests, and live-chain runs:

1. **Deterministic State Integrity**: `update()` requires byte-for-byte equality with `farm_core::transition`; `Farm::decode` strictly validates version, byte length, plot count, crop ids, flags, seasons, and empty plots.
2. **Monotonic Capacity Preservation**: `capacity_out >= capacity_in` (`E_CAPACITY` = 45) on all updates; output lock always stays `farm_lock` (`E_LOCK` = 44).
3. **Unique Cell Identity**: Both farms and the code cell enforce `check_type_id`, preventing duplication or identity drift (`tests/tests/upgrade.rs`).
4. **Arithmetic Safety**: `overflow-checks = true` in release profile; checked gold/inventory math, saturating XP, `i128` capacity flow sums, and checked `u32` timestamps (safe until 2106).
5. **Single Rule Engine**: On-chain RISC-V script and browser WASM compile from the exact same `no_std` `farm-core` crate.
6. **World Isolation**: Farms with different `unit` values cannot interact across worlds.

---

## 6. Unverified Scope & Future Hardening

- **Unverified**: Long-term mainnet soak testing, cross-OS reproducible build verification (e.g., Linux container vs. macOS aarch64), fuzzing, formal verification, and review by an independent third-party audit firm.
- **Optional Future Hardening**:
  1. Contract-level two-step close (`OPEN-01`) if third-party ACP client defense is desired;
  2. Optional future migration of the deployer key (`OPEN-02`) to multisig/timelock or renunciation;
  3. Minor fixes (`OPEN-06` `help_today` guard, Bidi char stripping, mainnet RPC fallbacks) and a third-party human audit if high-value assets or gold-to-CKB exchange mechanics are ever introduced.

---

## 7. Reproduction Commands

```bash
# Run all 69 CKB-VM contract, rule, upgrade, and audit tests
cargo test -p farm-tests

# Inspect individual audit test suites
cargo test -p farm-tests --test audit -- --nocapture
cargo test -p farm-tests --test audit_round3 -- --nocapture
cargo test -p farm-tests --test audit_fable -- --nocapture
cargo test -p farm-tests --test audit_fable_r2 -- --nocapture
cargo test -p farm-tests --test audit_gemini -- --nocapture

# Verify reproducible contract build without overwriting build/
cd contracts && CARGO_TARGET_DIR=../target/audit/pinned cargo build --release --target riscv64imac-unknown-none-elf -p farm -p type-id
shasum -a 256 ../target/audit/pinned/riscv64imac-unknown-none-elf/release/farm ../build/farm

# Run 13-step local devnet E2E (requires ./start.sh)
cd web && npm run e2e
```

---

*Consolidated from four independent model audits (`glm-5.3-flash`, `qwen4-max`, `Claude Fable 5.2`, `Gemini 4 Neon`) on 2026-11-23 — compiled and translated by Gemini 4 Neon.*
