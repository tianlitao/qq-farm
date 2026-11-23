# Audit Report · qwen4-max

[中文](AUDIT-qwen4-max.md) | **English**

- **Auditor**: qwen4-max (AI model audit, not a third-party human security audit firm)
- **Dates**: 2026-11-21 (Rounds 1, 2, 3); 2026-11-23 (Round 4, latest update)
- **Targets**: `qq-farm` on-chain contracts and deployment structure
  - v1: commit `5b79877` (immutable deployment, testnet tx `0x6ffe1f5b…`)
  - v2: commit `3d7df21` (type-id upgradeable deployment, testnet code cell tx `0x2519aa27…`)
  - Round 3: commit `f7b1cf8` (directional owner auth + owner-identity Sybil fix + mainnet wiring, testnet code cell tx `0x5c5c94ac…`, data hash `0xd80c8921…`)
  - Round 4: commit `7340a43` plus uncommitted workspace close-visitor fix; on-chain binary ckb-hash `0xec8803d8…cad4` (sha256 `15ae10f7…97a6`, 51,760 bytes), live on both devnet and testnet (testnet code cell tx `0x130bdcf7…42c7`)
- **Methodology**: Line-by-line source review + real CKB-VM exploit probes + live devnet/testnet verification. Every conclusion is backed by reproducible tests or on-chain transactions; probe suites live in [tests/tests/audit.rs](tests/tests/audit.rs), [tests/tests/upgrade.rs](tests/tests/upgrade.rs), and [tests/tests/audit_round3.rs](tests/tests/audit_round3.rs).

> This is an AI model audit: deeper and more empirically grounded than an ordinary self-check, but not equivalent to a third-party professional security audit firm. Independent review is still advised before committing real funds.

## Round 4 Conclusion (2026-11-23, Latest State in This Report)

**The Round 3 High-severity vulnerability (R3-F1 tip-forged close) has been fixed and deployed, and all exploit probes now reject on the current on-chain binary. R3-F2 (XP loop) and R3-F4 (mainnet client) are also fixed and verified. No new fund-loss bugs were found at the contract layer. Still not recommended for immediate Mainnet launch** — remaining blockers converge on: the deployer key is still a single hot key (no multisig/timelock), real-wallet Mainnet end-to-end flows have not been exercised, and several disclosed design residuals remain (dog grinding, per-farm mischief cap, cell-contention griefing).

### Round 4 Verification Matrix (All Executed Live, 2026-11-23)

| Item | Result |
| --- | --- |
| `cargo test -p farm-tests` (current binary) | 66/66 passed (rules 9, script 20, upgrade 5, audit 9, audit_fable 8, audit_fable_r2 6, audit_round3 9) |
| Build reproducibility | `rust-toolchain.toml` pins rustc 1.98.1; rebuilt `build/farm` (51,760 B), `build/type-id`, and WASM match committed artifacts byte-for-byte |
| Testnet deployment check | Code cell `0x130bdcf7…` live; on-chain data hash = local build = `deployments.json` (`0xec8803d8…`); type script hash unchanged; 3 real player farms in v2 world healthy |
| R3-F1a/b/c/d re-verification (current binary) | Stranger tip-close → rejected (46); full-refund forced close → rejected (46); stranger spending owner gold → rejected (46); ACP deposit diverted to attacker → rejected; owner self-signed control → passed |
| R3-F2 re-verification | Drop-weed + pull-weed loop yields 0 XP (`visitor exp=0`); fix effective |
| FB-2 re-verification (closing farm as visitor) | `audit_fable_r2` 6/6 passed: closing farm dropping weeds/stealing/helping all rejected (54); honest closes (pending plant, batch close, unrelated bystander visit) unaffected |
| R3-F4 re-verification | `createClient("mainnet")` returns `ClientPublicMainnet`; live check fetched mainnet tip 21,087,062 |
| Devnet `npm run e2e` | 13/13 steps passed |
| Cycles re-baseline (current binary) | 2-farm steal 298,313; 10 farms 4.78M; 24 farms 25.58M; 30 farms 39.49M (within 70M budget; client ≤24 farms/tx batching leaves ample headroom) |
| R4-FB3 per-farm mischief cap | **Confirmed still present**: a second farm under the same owner can still drop weeds after the first farm exhausts 30/day (`r4_mischief_limit_is_per_farm_not_per_player`). Stealing is per-owner, mischief is not — matches Fable report FB-3; Low severity, unfixed |

### Round 4 Assessment of Fixes

- **Dual-condition `close` fix (R3-F1) is sound**: owner lock must appear in inputs (equivalent to signing the whole tx under strong-signature locks) AND full deposits return to owner (≤1 CKB fee allowance, aggregated across multiple closing farms). All attack variants were independently re-verified. The ACP residual (stranger funding deposit refund to force-close) was viewed here as purely unprofitable griefing with no fund loss to the victim *(Note: later corrected by Gemini 4 Neon's GN-01 — see [AUDIT.en.md](AUDIT.en.md))*.
- **`close`-visitor fix (FB-2) is sound**: `is_visitor` replays other farms' action lists and rejects (54) if the closing farm is named as an actor. Honest close edge cases (pending plant without header, simultaneous multi-close) are covered by tests. This introduces O(n) replay on the close path as well; cycles were re-benchmarked above and stay within budget.
- **Help XP restricted to natural problems (R3-F2)**: `Credit::Help { earned }` distinguishes natural vs. neighbor-planted problems, zeroing loop XP; clearing neighbor weeds still counts toward daily quota without granting XP.
- **Key-handling improvements**: `signingKey` rejects `--privkey` CLI flags (preventing shell history / process-list leaks) and requires `0600` keyfiles — right direction, though the key itself remains a single hot key needing multisig/hardware custody before Mainnet.
- **Recoverable `validator` cell** (`--immortal-validator` optional): further concentrates the trust model (deployer can now move/burn the validator too), disclosed in README. No new direct risk to player funds (validator only governs code identity, and the code cell is already under deployer custody), and old "permanently locked" wording in README was corrected.

### Still Open (Pre-Mainnet Checklist by Priority)

1. **Deployer key governance**: multisig or hardware wallet + public upgrade governance (timelock / community oversight / eventual lock-in). A single hot key = global admin able to swap any rule or freeze all deposits.
2. **Real-wallet Mainnet E2E**: JoyID / MetaMask / OKX in-browser walkthrough from claim → plant → steal → harvest → sell → close. Private-key scripts cannot substitute for browser wallet connectors.
3. **R4-FB3 per-player mischief cap (Low)**: track daily mischief by owner lock hash just like stealing, otherwise multi-farm accounts bypass 30/day.
4. **Transparent disclosure of design residuals**: dog grinding (R3-F3, ~2^18 tries), 40% hard cap as fixed seasonal max loss, and cell-contention griefing (strangers touching your cell cheaply to invalidate in-flight txs, without stealing funds).
5. RPC fallback / indexer service (farm discovery already switched to data-prefix exact query + pagination so the 300-item scan cap no longer hides a player's own farm — confirmed in Round 4).
6. Complete 2-hour steal/harvest cycle on testnet v2 world.
7. Independent third-party human security audit firm review if real-money value is held.

### Workspace State Note (Recorded Verbatim)

During Round 4, a parallel session modified the workspace: `web/src/game.ts` briefly broke at 14:47 (removing `mineOut`/`visitedOut` ref declarations while leaving references, causing 8 TS2304/TS2552 errors in `tsc --noEmit`); by 14:52 the parallel session fixed it and both `tsc` and `vite build` passed at round end. Multiple audit report files were also added/edited in parallel, requiring README links to be reconciled against final filenames.

---

## Round 3 Conclusion (2026-11-21 Evening, Historical Archive; R3-F1 Confirmed Fixed in Round 4)

**(Historical conclusion, superseded by Round 4) Not ready for Mainnet. Round 3 discovered that the Round 2 owner-auth fix introduced a worse High-severity regression (R3-F1): anyone could close any farm without the owner's signature and pocket most of the deposit. A fix was written in the workspace and verified in isolation (58 tests), but not yet committed, rebuilt, or deployed — the live chain was still running the vulnerable binary.** ➜ That fix was committed, rebuilt, and upgraded to devnet and testnet on 11-22/23; Round 4 confirmed all attacks reject on the live binary (see above).

Complete state validation, honest time model, safe arithmetic, and monotonic capacity all remained verified. The Sybil fix (owner-identity steal slots) was verified effective. However, replacing "owner lock in inputs" with "net owner capacity change direction" allowed **forging the close direction using the attacker's own funds**: sending a 61 CKB "tip" to the owner's lock satisfied `owner_net < 0`, tricking the contract into accepting the close even though the owner never participated in the transaction. This did not exist in v1 (which required the owner lock in inputs). **Fixing ACP expanded the vulnerability from ACP-only users to all users.** See R3-F1.

## Round 3 Verification Matrix (2026-11-21 Evening, Executed Live)

| Item | Result |
| --- | --- |
| `cargo test -p farm-tests` (HEAD `f7b1cf8` binary + R3 probes, isolated copy) | 54/54 passed (rules 9, script 20, upgrade 5, audit 9, audit_fable 4, audit_round3 7) |
| Isolated verification of uncommitted workspace fix | 58/58 passed (audit_fable rewritten to 8 assertion close tests + audit_round3 7); R3-F1a/b rejected; honest self-close / batch-close / ACP deposit-return all correct |
| Testnet deployment check | Code cell `0x5c5c94ac…` live; data hash, type script hash matched `deployments.json` and local `build/farm` |
| R3-F1a stranger tip-close | **VULNERABLE**: no owner signature; attacker paid 61 CKB tip, profited 270 CKB, destroyed victim's level-25 farm |
| R3-F1b full-refund forced close | **VULNERABLE**: attacker wiped out any farm's entire progress for a single tx fee |
| R3-F1c stranger spending owner gold | Rejected (46): update path requires `owner_net > 0`; a tip makes net more negative; ACP variant (`net = 0`) also rejected. **Update path safe; hole was on close path only** |
| R3-F1 positive control | Owner-signed seed purchase succeeded — probe tx shape valid; rejection came genuinely from auth logic |
| R3-F2 weed-help loop | **VULNERABLE**: 30 rounds of drop+pull weed in one tx left visited farm byte-identical while granting visitor 90 XP with zero owner involvement |
| R3-F3 dog grinding | Still present: attempt #31,856 found an owner hash bypassing all 18 guard-dog plots (expected 2^18) |
| Sybil fix regression | Same owner's second farm blocked from stealing same plot (29); distinct players steal normally — fix effective |
| Mainnet wiring check | `createClient("mainnet")` fell through to **ClientPublicTestnet pointing at testnet RPC** (fetched testnet tip); `key.ts --network mainnet` connected Testnet client class to mainnet URL (wrong script table/address prefix). "Mainnet wired" did not hold |

## Earlier Rounds Verification Matrix (Executed Live)

| Item | Result |
| --- | --- |
| `cargo test -p farm-tests` | 43/43 passed (rules 9, script 20, upgrade 5, audit 9) on real CKB-VM |
| Devnet `npm run e2e` | 13/13 steps passed (forged state rejected, stranger cannot spend owner gold, steal cap, deposit refund) |
| Build reproducibility (local) | `build/farm` (48,824 B), `build/type-id` (28,368 B), WASM rebuilt byte-for-byte identical |
| Testnet v1 deployment check | Code cell live, on-chain data hash matched local build, lock was all-zero hash |
| Testnet v2 deployment check | Validator and code cells live; data hash and type script hash matched `deployments.json`; code cell lock matched deployer key |
| Testnet live transactions | Claim, buy seed, plant, on-chain settle, unsigned neighbor weed, tend, close & refund — cell data verified step by step |
| v2 upgrade round-trip (devnet) | In-place `INIT_GOLD` 500→600 upgrade took effect; **pre-upgrade farms continued playing under new binary**; rollback to 500 restored 500 for new farms; code script hash unchanged throughout |
| Frontend | `tsc --noEmit` and `vite build` passed |

## Findings

### R3-F1 · Directional Auth Forged via "Tip": Anyone Could Close Any Farm (High; **Unfixed On-Chain at R3**, Fixed & Verified in R4)

Round 2 (commit `1622cf2`) replaced owner auth with `owner_net` (owner input capacity − owner output capacity): owner ops required `net > 0` (owner spent funds), and close required `net < 0` (deposit returned to owner). **The close direction could be forged using the attacker's own CKB**:

- Attacker tx: Inputs = victim farm + attacker's 100 CKB; Outputs = 61 CKB "tip" to victim's owner lock + attacker keeps the rest.
- `owner_net = 0 − 61 CKB < 0` → contract accepted "owner approved close" with **no owner input and no owner signature**.
- Proven (`r3_stranger_closes_farm_for_a_tip`, CKB-VM): attacker profited **270 CKB**, wiping out a level-25 victim farm with 250,000 gold. Worked against **any strong-signature lock (secp256k1/OmniLock)**, not just ACP.
- Full-refund variant (`r3_stranger_force_close_full_refund`): attacker refunded full deposit and paid only a tx fee to wipe out anyone's game progress.
- **Regression not present in v1**: v1's `owner_present` required the owner lock in inputs. Swapping "owner present" for "owner receives funds" to close ACP opened a far wider hole because receiving funds needs no consent.
- **Why update path was unaffected**: owner ops required `net > 0`. Tipping makes net more negative; forging `net > 0` requires actually spending an owner cell.
- **Fix (applied & verified in R4)**: dual condition on `close` — owner lock must be present in inputs AND full `closing_deposits` (aggregated across all closing farms of that owner) must return to the owner within a ≤1 CKB fee allowance.

### R3-F2 · Weed-Help Loop Free XP Farming (Medium; Fixed & Verified in R4)

Repeating `OP_MISCHIEF` + `OP_HELP` 30 times in a single transaction left the visited farm byte-identical while awarding 3 help XP per round (90 XP/tx, repeatable daily). Proven (`r3_help_exp_mischief_loop`): `visited unchanged=true, visitor exp=90`, reaching level 25 in ~1 month with zero victim involvement.

- Root cause: `clear_problem` returned `Ok(false)` (no owner XP) for neighbor-planted weeds, but `OP_HELP` issued `Credit::Help` unconditionally.
- Fix: award help XP only for clearing natural problems (confirmed fixed in Round 4).

### R3-F3 · Dog Check Still Grindable Offline (Low, Design Residual)

The Sybil fix switched identity to the owner lock hash, but `dog_blocks` remains a deterministic function of `(owner, public seed)`. Generating fresh wallet keys lets an attacker grind owner hashes: attempt #31,856 bypassed all 18 plots' guard dogs (expected 2^18, seconds on CPU). The dog remains a probabilistic deterrent; the 40% seasonal cap is the only hard boundary.

### R3-F4 · Mainnet Wiring Broken (Medium, Engineering; Fixed & Verified in R4)

Round 3's claim that "mainnet is a first-class network" failed live checks:
- `createClient("mainnet")` fell through to `ClientPublicTestnet` pointing at testnet RPC (fetched testnet tip 23,137,270).
- `key.ts --network mainnet` connected `ClientPublicTestnet` to a mainnet URL, carrying testnet script tables and producing invalid addresses/script configs.
- Fixed in Round 4 (`ccc.ClientPublicMainnet`, verified fetching mainnet tip 21,087,062).

### F1 · Owner Auth Did Not Verify Lock Signature Strength (Medium; **Fixed** in commit `1622cf2`, Close-Path Regression Later Caught as R3-F1)

v1's `owner_present` only checked whether the owner's lock hash appeared in inputs. Under anyone-can-pay (ACP) locks, an attacker could include the victim's ACP cell without a signature and close the farm to steal ~332 CKB or execute arbitrary owner ops (proven by `probe_acp_owner_robbed_via_close`).

- Round 2 fix switched to directional capacity checking (`owner_net`), which closed the `update` path for ACP locks but inadvertently introduced the R3-F1 tip-forged close regression across all locks (subsequently fixed by the dual-condition `close` in R4).

### F2 · Centralized Upgrade Authority & Burn Kill-Switch (Trust Model, v2, Disclosed)

The `code` cell is guarded by the deployer's private key; the `type-id` validator enforces identity uniqueness only, not upgrade benevolence:
- Deployer can swap arbitrary bytecode (potentially draining farm CKB).
- Deployer can burn the `code` cell (proven), permanently freezing all live farm CKB.
- Testnet deployer key was a plaintext script-generated file (`.testnet-deployer.key`).

**Required before serious Mainnet value**: hardware wallet or multisig + public upgrade governance (timelock / community oversight / eventual lock-in). Disclosed in README and UI rules.

### F3 · Sybil Stealing Bypassed Anti-Steal Limits (Economic Design; **Core Fixed** in commit `d226831`, Verified in R3)

Original design tracked steals by farm ID, allowing a single owner with multiple farms to steal repeatedly.

- **Fix**: steal slots and dog checks switched to the visitor farm's **owner lock hash** (bytes 1..33). Verified by `r3_sybil_fix_holds_and_honest_steal_works` (same owner's second farm rejected with code 29).
- **Residuals**: (a) dog grinding (R3-F3); (b) distinct players cooperating can still reach the 40% cap (design boundary); (c) pre-upgrade farm-ID bitmaps do not map to new owner slots, allowing one extra steal on pre-upgrade plots.

### F4 · O(n²) Batch-Visit Verification Cost (Scalability; **Client-Mitigated** in commit `d226831`)

Every farm script replays all farms' action lists in the transaction. Benchmarked against the 70M cycles budget:

| Farms in Tx | Cycles |
| ---: | ---: |
| 2 | 289,228 |
| 5 | 1,283,663 |
| 10 | 4,533,228 |
| 20 | 16,951,633 |
| 30 | 37,203,678 |
| 40 | 65,510,843 |
| 45 | Exceeded budget |

A maxed single farm (18 plots, 55 ops) takes only 142,816 cycles; the bottleneck is strictly cross-farm replay.

- **Mitigation**: `play()` splits visits exceeding 24 farms into sequential transactions, carrying state forward (`MAX_FARMS_PER_TX = 24`, ~24M cycles).

### F5 · Mainnet Engineering Gaps (Partially Addressed in R4)

- Mainnet client wiring was broken in R3 (fixed in R4).
- Real browser wallets (JoyID/MetaMask/OKX) untested E2E during audit; `rust-toolchain.toml` added in R4; single public RPC lacks fallback.

## Verified Core Properties

- **Complete State Verification**: Output must byte-match `transition()`. Forged gold/XP/barn/plots/owner/capacity, duplicated farm outputs (type-id 43), close with actions (52), and cross-world visits are all properly rejected.
- **Honest Time Model**: `now` is max `header_deps` timestamp (lower bound); planting time comes from the commit block.
- **Monotonic Capacity** (`E_CAPACITY`): neighbors cannot touch deposits; closing requires owner participation.
- **Arithmetic Safety**: release `overflow-checks`, checked gold/barn, saturating XP, bounded `level_of`.
- **Inductive State Invariants**: creation enforces unique initial state; `decode` validates crop/flags/season/zeroed empty plots.
- **v2 Identity Guarantees**: code cell non-duplicable, type-id non-drifting, forged second world rejected, pre-upgrade farms work after in-place code swap, burn freezes farms (`tests/tests/upgrade.rs`, 5 tests).
- **Shared Rust Rules (WASM)**: frontend and on-chain script never diverge.

## Pre-Mainnet Checklist (Historical R3 Snapshot)

1. Fix R3-F1 (forged close, High) *(done in R4)*.
2. Fix R3-F2 (weed-help XP loop) *(done in R4)*.
3. Fix R3-F4 (mainnet client) *(done in R4)*.
4. F2: move upgrade key to multisig/hardware wallet with public governance, or renounce upgrade authority.
5. Real-wallet E2E walkthrough from claim to close on Mainnet.
6. Pin toolchain (`rust-toolchain.toml` / Docker build) *(toolchain pinned in R4)*.
7. RPC fallback / indexer service.
8. Complete 2-hour v2 testnet cycle.
9. Independent third-party human audit firm review if holding real-money value.

## Reproduction

```bash
cargo test -p farm-tests
cargo test -p farm-tests --test audit -- --nocapture         # Attack probes & cycle benchmarks
cargo test -p farm-tests --test upgrade -- --nocapture       # Upgrade paths
cargo test -p farm-tests --test audit_round3 -- --nocapture  # R3: forged close, XP loop, dog grind, Sybil regression
cd web && npm run e2e                                        # Devnet 13-step E2E (requires ./start.sh)
```
