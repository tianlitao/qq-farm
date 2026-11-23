# Audit Report · glm-5.3-flash

[中文](AUDIT-glm-5.3-flash.md) | **English**

- **Auditor**: glm-5.3-flash (executed inside a ZCode session; AI model audit, not a third-party human security audit firm)
- **Date**: 2026-11-21 (with Round 3, 4, and 5 follow-up reviews through 2026-11-23)
- **Targets**: `qq-farm` on-chain contracts and deployment structure
  - v2 upgradeable deployment: commit `3d7df21` (type-id validator + upgradeable code cell, testnet code cell tx `0x2519aa27…`)
  - Patched build: commit `1622cf2` (testnet upgrade tx `0x11444a53…`, type id unchanged)
- **Methodology**: Line-by-line source review (273-line contract, 880-line rules engine, crop table, 427-line frontend tx builder, deploy/upgrade scripts) + `ckb-testtool` real CKB-VM exploit probes + live devnet & testnet verification
- **Companion Report**: [AUDIT-qwen4-max.en.md](AUDIT-qwen4-max.en.md) (qwen4-max) — both audits ran independently with mutually corroborating core conclusions

> This is an AI model audit: deeper and more empirically grounded than an ordinary self-check, but not equivalent to a third-party professional security audit firm. Independent review is still advised before committing real funds.

## Conclusion

**After fixing V1 (and subsequently R3-F1 / R3-F2 / FB-2 in follow-up rounds), the on-chain rules engine and authorization model reached testnet-ready and mainnet-candidate quality; remaining blockers before mainnet lay outside the contract** (upgrade key governance, real-wallet end-to-end walkthrough, mainnet frontend configuration).

Complete state validation, honest time model, safe arithmetic, monotonic CKB capacity, and unforgeable farm identity are all backed by reproducible tests or live on-chain transactions.

## Verification Matrix (Initial Rounds, Executed Live)

| Item | Result |
| --- | --- |
| Full `cargo test` | 48/48 passed (rules 9, script 20, upgrade 5, audit probes 9 including ACP rejection assertions) on real CKB-VM |
| Devnet `npm run e2e` | 13/13 steps passed post-fix (claim, unsigned visit, steal cap, forged state rejected, close refund 331 CKB) |
| Live devnet upgrade | In-place `INIT_GOLD` 500→600 upgrade succeeded; new farm received 600 gold; pre-upgrade farm closed and recovered CKB normally; rollback to 500 also succeeded; code script hash unchanged throughout |
| Live testnet upgrade | Security fix deployed via in-place upgrade (tx `0x11444a53…`), type id unchanged; pre- and post-upgrade farms healthy |
| Deployment structure check | Validator + code cells live; data hash and type script hash matched `deployments.json`; validator lock was all-zero hash (immutable) |
| Frontend | `tsc --noEmit` and `vite build` passed; live site verified against patched deployment |

## Findings & Fixes

### V1 · Owner Authorization Did Not Verify Lock Signature Strength (Medium, **Fixed** in commit `1622cf2`, Close-Path Regression Fixed in Round 4)

`owner_present` checked only whether the owner's lock hash appeared in inputs without checking whether that lock required a signature. Under anyone-can-pay (ACP) locks ("anyone can spend as long as capacity does not decrease"), any stranger could close a victim's farm without a signature to steal the entire deposit or invoke arbitrary owner ops (shovel crops, spend gold on seeds, rename).

- **Proof**: VM probe `probe_acp_owner_robbed_via_close` recreated the victim's ACP cell unchanged (ACP passed) and routed the 332 CKB farm deposit to the attacker with zero victim signatures. Default CCC wallets (secp256k1 / strong OmniLock) were unaffected, though the contract did not stop clients from claiming with ACP addresses.
- **Initial Fix**: switched to directional capacity checking (`owner_net` = owner input capacity − owner output capacity):
  - Owner ops & claim: owner must have **net decrease** (`spend > 0`, paying fee).
  - Close: owner must have **net increase** (`spend < 0`, deposit returning).
- **Why better than a lock whitelist**: works generically against any unsigned-spendable non-decreasing lock while also blocking ghost/gifted farms.
- **Follow-up in Round 4**: directional check alone on `close` was found vulnerable to tip forgery (R3-F1) and upgraded to the dual condition (`owner` input present AND full `closing_deposits` returning to `owner` within ≤1 CKB).

### V2 · Centralized Upgrade Authority & Burn Kill-Switch (Trust Model, Inherent to v2, Disclosed)

The `code` cell is guarded by the deployer's private key. The `type-id` validator guarantees identity non-drift and no duplicate copies, not upgrade benevolence: the deployer can swap arbitrary bytecode or burn the `code` cell (permanently freezing all live farms). The testnet deployer key was a plaintext test keyfile (`.testnet-deployer.key`).

**Required before serious Mainnet value**: move upgrade key to multisig or hardware wallet and publish governance terms (timelock / community oversight / eventual lock-in). Disclosed in README and UI rules (which display code version hash and world ID).

### V3 · Sybil Stealing & Anti-Steal Boundaries (**Core Fixed** in commit `d226831`)

Original anti-steal tracked farm IDs (16 slots, once per season per slot), allowing zero-cost Sybil attacks via refundable-deposit farms (`probe_self_sybil_steal`), and dog blocking was a deterministic function of farm ID and public seed. The true hard boundary is **40% total stolen per season** (`STEAL_CAP_PERCENT`), and gold has no CKB redemption exit.

**Fix (deployed 2026-11)**: steal slots and dog checks switched from farm ID to the visitor farm's **owner lock hash** (state bytes 1..33), so multiple farms owned by the same player share slots and dog checks (`probe_self_sybil_steal` rewritten to assert code 29 rejection). Residual: distinct players cooperating can still reach 40% (design boundary), and the dog remains a probabilistic deterrent.

### V4 · O(n²) Batch-Visit Verification Cost (Quantified, **Client Batching Added** in commit `d226831`)

Every farm script replays all farms' action lists in the transaction. Benchmarked against the 70M cycles limit:

| Active Farms in Tx | Cycles |
| --- | --- |
| 2 (single steal) | 289,228 |
| 5 | 1,283,663 |
| 10 | 4,533,228 |
| 20 | 16,951,633 |
| 30 | 37,203,708 |

Frontend `play()` automatically splits visits at 24 farms per transaction, carrying the player's farm state across sequential transactions. A maxed single farm (18 plots, 55 ops) uses only 142,816 cycles.

### V5 · Upgrade Operational Gap (Low, **Fixed** in commit `1622cf2`)

If the process crashed after submitting an upgrade tx before writing `deployments.json`, stale outpoints caused `deploy` and `upgrade` to deadlock against each other. Fix: `upgrade.ts` scans on-chain by type script hash to recover the live code cell when the recorded outpoint is stale, self-healing the record. Also updated `deploy`/`upgrade` to write `public/deployments.json` so the frontend fetches fresh deployment pointers at startup without requiring redeployment.

## Verified Defenses

| Attack Surface | Result |
| --- | --- |
| Forging / tampering with farm state | Output must byte-match `transition()`; all states trace back to script-produced outputs |
| Duplicating farm cells / forging code cell | `check_type_id` enforces exact 0/1-in, 0/1-out per group (verified against ckb-std 1.1.0) |
| Unsigned close / touching others' farms | Close requires owner auth; no-op spends rejected by `E_NOTHING_HAPPENED` (52 / 46) |
| Draining CKB from farm (including fees) | Capacity strictly monotonic except on owner close; farm cell cannot pay miner fees |
| Time spoofing | `now` is historical block time lower bound; plant time & weather seed come from commit block |
| Arithmetic overflow | Checked gold/fruit/seeds; saturating XP; u32 seconds valid through 2106 |
| State decoding | Exact version, length, crop/flags bounds, zeroed empty plots reject hand-crafted invalid states |
| Bundling actions on close | Rejected by `E_CLOSE_WITH_ACTIONS` (verified) |
| Rolling back daily counters | `roll_day` monotonic *(Note: historical header day-stepping later discovered as GN-03 and fixed — see [AUDIT.en.md](AUDIT.en.md))* |
| Bounded unsigned visits | Steal: once per owner per plot per season (16 slots) + 40% cap; mischief: 30/day; help: 50/day, clearing others' weeds gives 0 XP |

## Round 4 Follow-Up Review (Reconciled With qwen4-max Round 3, 2026-11-22)

qwen4-max Round 3 ([AUDIT-qwen4-max.en.md](AUDIT-qwen4-max.en.md)) uncovered a **tip-forged close regression** (R3-F1) in Round 2's close fix: requiring only "net owner inflow" let an attacker tip 61 CKB to the owner's lock and pocket ~270 CKB while closing any farm without the owner's signature, even for strong-signature locks. This review confirmed the regression via VM probes and closed it out:

| Item | Conclusion |
| --- | --- |
| R3-F1 tip-forged close (High) | **Fixed & deployed** (devnet/testnet upgraded): `close` requires dual conditions — owner lock cell in inputs **AND** full deposits of closing farms returning to owner (aggregated `closing_deposits`, ≤1 CKB fee allowance). All 3 `r3_*` probes now reject. **Lesson**: directional net-inflow can be forged by an external gift; authorization must bind both owner participation and deposit return |
| R3-F2 weed-help XP loop (Medium) | **Fixed & deployed**: help XP awarded only for clearing **natural problems**; clearing neighbor-planted weeds remains valid with 0 XP, zeroing loop gain |
| R3-F4 mainnet client wiring (Low) | **Fixed**: `createClient("mainnet")` returns `ClientPublicMainnet`; `key.ts` aligned |
| Recoverable validator lock | Validator cell switched to deployer lock by default (`--immortal-validator` optional for all-zero lock), enabling **full recovery of both cells on shutdown**; `scripts/shutdown.ts` added (blocks while farms exist, reclaims both capacities in one tx, clears deployment record — verified recovering 77,955 CKB on devnet) |

**Post-R4 status**: 58/58 tests, E2E 13/13, both devnet and testnet running the patched build (type id unchanged).

## Round 3 Follow-Up Review (Post commit `d226831`, 2026-11-21)

Comprehensive review after Sybil fix, batch splitting, mainnet config, key tooling, and i18n:

| Item | Conclusion |
| --- | --- |
| Owner extraction (`owner_in_state`) | Reads state bytes 1..33 with version check; all on-chain states originate from script output |
| Viewer semantics pipeline | Frontend `look()` passes viewer's owner hash → WASM `fw_view` → `check_steal`, matching `transition` actor identity |
| Steal slot migration | Old bitmap used farm ID, new uses owner hash — legacy records don't map to new slots (one extra steal possible on old plots; negligible on fresh testnet) |
| Batch splitting (`play()` ≤24 farms/tx) | State carried across txs, equivalent to single full tx; mid-batch failure leaves stale ops pruned by `sift` (minor UX residual) |
| Runtime `deployments.json` | Same-origin fetch; upgrades require no site redeploy |
| Mainnet safety gates | Deploy/upgrade require key + `--yes`; neutral claim copy on mainnet without faucet |
| Key tool | **Found K1**: positional arg ignored (`key.ts new visitor` silently generated `deployer.key`) — fixed same round |
| English i18n spacing | **Found K2**: `describe()` produced `"plot 1weed"` and `"Ann： picks"` in English — fixed same round (`dClear` and `whoSep`) |

**No new security bugs in R3**; 3 low-severity items (K1/K2/K5) fixed immediately, 2 residuals (K3/K4) documented. 51/51 tests, 13/13 E2E, bilingual site verified.

## Pre-Mainnet Checklist (Historical Snapshot)

1. Move upgrade key to multisig/hardware wallet and publish governance/renunciation roadmap (V2).
2. Complete real-wallet (JoyID / MetaMask) browser walkthrough.
3. Wire `web/.env` and deployment records for mainnet; check fee economics on mainnet.
4. Independent review beyond AI model audits.
5. If gold ↔ CKB exchange is ever introduced, redo full economic audit — "gold has no CKB exit" underpins fund safety.

## Round 5 Follow-Up Review (Around commit `78ed508`, 2026-11-23)

Fifth comprehensive review following parallel work with the Claude Fable 5.2 session ([AUDIT-fable-5.2.en.md](AUDIT-fable-5.2.en.md)), which shipped the `close` fix on both chains (`0xec8803d8…`), pinned the Rust toolchain (`rust-toolchain.toml`), shipped the FB-2 closing-visitor guard, and reorganized the audit docs.

### Review of Parallel Changes

| Item | Conclusion |
| --- | --- |
| Closing-visitor guard (FB-2, `E_CLOSING_VISITOR`) | **Sound design**: a closing farm has no output to carry steal/mischief counters, so rejecting it as a visitor is right. `is_visitor` shares replay logic with `transition`; empty-action farms are skipped. 6 probes in `audit_fable_r2`, 66/66 tests green |
| Toolchain pinning | `rust-toolchain.toml` pins rustc 1.98.1, turning "source = on-chain bytecode" into a verifiable fact |
| Dual-condition `close` (final R3-F1 fix) | `owner_flow` (owner input present + net spend) + `closing_deposits` (full refund aggregated across farms, `CLOSE_FEE_ALLOWANCE` ≤ 1 CKB). All 4 tip probes reject |
| Audit report reorganization | Three qwen rounds consolidated into [AUDIT-qwen4-max.en.md](AUDIT-qwen4-max.en.md), Fable standalone, root `AUDIT.md` restored as index |

### New Findings & Resolution in Round 5

| ID | Finding | Resolution |
| --- | --- | --- |
| R5-1 | **Stale entries in farm list**: after discovery refactor, `upsert` only grew — farms pushed out of the 300-cell scan window or closed by others lingered forever as clickable "ghost farms" | **Fixed** (commit `78ed508`): scan results define the live set, preserving only actively watched cells (own farm + currently visited farm) which refresh via cheap polling |
| R5-2 | **Multi-device close cache cleanup**: `close()` clears `localStorage` only on the active device | **Confirmed no change needed**: 3-tier discovery handles it naturally (stale cache → `getCellLive` miss → cache cleared → data-prefix lookup → fallback scan → claim screen) |
| R5-3 | **Flaky parallel test runs**: running all 7 test binaries concurrently occasionally hit resource contention; single runs always pass | Documented; run sequentially or with retry in CI |

### Post-R5 Status

- **66/66 tests** (including 6 `audit_fable_r2` closing-visitor probes), 13/13 E2E.
- Both devnet and testnet running `0xec8803d8…` (type id unchanged).
- Live site [ckb-farm.pages.dev](https://ckb-farm.pages.dev/) deployed with the stale-farm-list fix.
- **Unchanged residuals**: V2 upgrade-key governance (multisig/timelock), FB-3 per-farm mischief cap, FB-5 cell-contention griefing, real-wallet mainnet E2E — all known and transparently documented, with no new High-severity issues.
