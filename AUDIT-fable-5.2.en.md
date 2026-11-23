# Audit Report · Claude Fable 5.2

[中文](AUDIT-fable-5.2.md) | **English**

- **Auditor**: Claude Fable 5.2 (Anthropic AI model executed inside a Claude Code session; **not** a third-party human security audit firm)
- **Dates**: 2026-11-21 to 2026-11-23 (full report after the 11-23 re-audit)
- **Target**: `qq-farm` (Ridge · Fully On-Chain Farm on CKB)
  - Source: commit `5e886b9` plus uncommitted workspace changes (three small patches, FB-2 contract fix, new test file, documentation)
  - On-chain binary: `build/farm`, ckb-hash `0xec8803d81c086f93e41335e74b375ba506d3ce54abd8cf354c26ac7c9469cad4` (sha256 `15ae10f7…97a6`, 51,760 bytes), containing both the `close` fix and the FB-2 fix. Live on both devnet and testnet at the time of this report. The prior build (`0x45015bbb…80e9`, 50,568 bytes) contained only the `close` fix and was replaced on 11-23. `build/type-id` was unchanged (sha256 `e809f152…92cf`).
  - Deployments: devnet (upgraded 11-23, tx `0x46bd7b65…ddda`) and testnet (upgraded 11-23, tx `0x130bdcf7…42c7`, block 23,155,342). Mainnet had not been deployed at the time of this report.

## Conclusion

**On the audited binary, no path was found allowing a stranger to steal your deposit**, assuming the farm owner uses a signature-requiring lock (CCC's default secp256k1, OmniLock, and JoyID all qualify). The High-severity bug discovered in this audit (anyone closing another player's farm via a "tip") has been fixed, deployed to both devnet and testnet, and re-verified with live attack transactions against real nodes. The Low-severity issue uncovered in the re-audit (FB-2) has also been fixed, upgraded to both devnet and testnet, and verified against real nodes on both chains.

**However, this report did not recommend treating it as "worry-free for Mainnet" yet**, due to off-contract and design-residual factors:

1. The deployer key is a global admin: it can replace the rules arbitrarily or freeze everyone's deposits. At the time of review, it was a single hot key with no multisig or timelock (FB-4).
2. The daily mischief limit is counted per farm rather than per player (FB-3) and remains unfixed.
3. Anyone can repeatedly "touch" your farm cell at very low cost, invalidating your in-flight transactions (FB-5). No funds are lost, but it can be disruptive.
4. Real browser wallet logins and full Mainnet flows had not yet been exercised.

## Verification Matrix

Every row below reflects **actually executed** runs. "New" denotes the binary containing the FB-2 fix (`0xec8803d8…`); "Old" denotes the preceding binary (`0x45015bbb…`, running on both chains prior to the upgrade).

| Item | Result | Date |
| --- | --- | --- |
| `cargo test -p farm-tests` (new) | 64/64 passed: rules 9, script 20, upgrade 5, audit 9, audit_round3 7, audit_fable 8, audit_fable_r2 6 | 11-23 |
| Same test suite against old binary | Only 2 failures in `audit_fable_r2` — the exact 2 assertions that a closing farm cannot act as a visitor | 11-23 |
| Pre-close-fix binary (commit `1a6e10c`) running close regression suite | 4 of 8 failed — the exact 4 assertions that strangers cannot close | 11-22 |
| Rebuild after toolchain pin (old source) | `build/farm`, `build/type-id`, and WASM matched committed artifacts byte-for-byte (rustc 1.98.1 via `rust-toolchain.toml`) | 11-23 |
| Two independent builds of new binary | Independent directory build matched `scripts/build-contract.sh` output byte-for-byte; same for WASM | 11-23 |
| On-chain code verification (read-only) | Before upgrade: both devnet and testnet code cell data hashes were `0x45015bbb…` (= prior `build/farm`). After upgrade: both chains were `0xec8803d8…` (= current `build/farm`); type script hash unchanged, matching `deployments.json` | 11-23 |
| Real-node attack: stranger close (devnet, new) | All 3 variants rejected with code 46 at `Inputs[0].Type`: 61 CKB tip without attacker input, tip with attacker cell, full refund. Farm remained intact; owner subsequently closed and recovered deposit | 11-22 first run, 11-23 re-run on new binary |
| Real-node attack: closing farm dropping 31st weed (devnet) | Before upgrade (old): **accepted** by node (tx `0xf6de449a…`), visited plot gained a weed. After upgrade (new): rejected with code 54 at `Inputs[0].Type`; visitor later closed cleanly | 11-23 |
| Testnet upgrade | `npm run upgrade:testnet`, tx `0x130bdcf7…42c7`, confirmed at block 23,155,342; type id unchanged, existing farms untouched | 11-23 |
| Real-node attack: closing farm dropping weed (testnet, new) | Opened two temporary farms. Target planted (owner op passed on new code); visitor attempted to drop a weed while closing its own farm → rejected with code 54 at `Inputs[0].Type`; control (visitor farm stays open) accepted with mischief count = 1; both farms then closed cleanly by owners (`0x133f20b6…5ea6`, `0x905b418b…1a69`), deposits returned | 11-23 |
| `npm run e2e` (devnet, new) | 13/13 steps passed | 11-23 |
| `npm run typecheck` | Passed | 11-23 |
| Keyfile loader (16 test cases) | All matched expectations (see "Patches in This Round") | 11-23 |
| Verification cycles (new) | Single farm 55 ops: 149,555; 2-farm steal: 298,313; 5 / 10 / 20 / 30 farms single steal: 1.34M / 4.78M / 17.97M / 39.49M (limit 70M) | 11-23 |
| `npm audit --omit=dev` | 23 low-severity advisories, all from the same upstream dependency (`elliptic` via `@ckb-ccc`); 0 medium or high | 11-23 |
| Private keys in git | None. Only `web/.env` (`VITE_NETWORK=testnet`) tracked; both testnet keyfiles gitignored with mode `0600` | 11-23 |

## Findings

Severity is ranked by impact on player funds and game fairness.

### FB-1 · Anyone Could Close Another Player's Farm With a Tip (Critical, **Fixed & Deployed**)

Before the fix, closing a farm checked only direction: "the owner's lock ended up with more CKB," without requiring any owner input. A stranger could put the victim's farm cell in inputs, pay a minimal 61 CKB cell to the victim's lock, and pocket the remaining ~270 CKB deposit — destroying all of the victim's levels, gold, and plots. This affected every owner, including strong-signature locks.

- **Fix** (`close` in `contracts/farm/src/main.rs`): both conditions are required — an input cell with the owner's lock must be present, AND the aggregated deposits of all farms being closed for that owner must return to the owner within a 1 CKB fee allowance (one refund cannot cover two closes).
- **Verification (executed)**: all 8 tests in `tests/tests/audit_fable.rs` pass on the current binary and 4 fail on the pre-fix binary; all 3 live-node attack transactions on devnet were rejected.
- Same bug as R3-F1 in [AUDIT-qwen4-max.en.md](AUDIT-qwen4-max.en.md), discovered independently on both sides.

### FB-2 · A Closing Farm Could Act as a Visitor to Bypass Daily Mischief Caps (Low, **Found, Fixed & Deployed to Devnet and Testnet**)

Visitor operations identify the visitor farm by input index, and the visitor half of accounting (daily mischief count, stolen fruit) is checked by the visitor farm's own script during `update`. Before the fix, if the visitor farm was **closed** in the same transaction, its script ran `close` and skipped visitor accounting. Consequently:

- A player who had already used all 30 daily mischief actions could drop extra weeds/bugs in the transaction that closed their farm.
- A closing "thief" could pick ripe crops whose fruit vanished (burned), while still occupying the plot's steal slot and counting toward the 40% cap.

Impact was limited: at most 1 weed and 1 bug per plot (-10% yield each); closing requires the owner's signature, so nobody could misuse your farm as a visitor; no CKB was at risk.

- **Fix**: after checking owner authorization and deposits, `close` replays the action lists of all other farms in the same world; if any action names the closing farm as an actor, it rejects with error code 54 (`E_CLOSING_VISITOR`). Implemented via `is_visitor` in `farm-core`, sharing farm-collection helpers with `update`. Normal play is unaffected (just visit and close in separate transactions).
- **Verification (executed)**:
  - CKB-VM: `a_closing_farm_cannot_plant_a_weed` and `a_closing_farm_cannot_steal_or_help` pass on the new binary and fail on the old binary.
  - No false positives: `honest_closes_still_pass` covers solo close, close with unsettled planting and no header, batch close of two farms, and closing alongside unrelated neighbors visiting each other; `a_stranger_cannot_close_a_farm_as_the_visitor` and `a_stranger_cannot_visit_in_somebody_elses_name` pass on both old and new binaries.
  - Real nodes: accepted before upgrade and rejected (54) after upgrade on devnet; rejected (54) after upgrade on testnet with honest visit and close working normally.
- **Cost**: `close` now replays sibling farm actions, slightly raising cycle counts (see matrix), still far below the 70M limit.
- **Follow-ups**: added bilingual copy for error code 54 in `web/src/i18n.ts`; rebuilt frontend required after testnet upgrade so published pages point to the new code cell outpoint.

### FB-3 · Daily Mischief Cap Is Per Farm, Not Per Player (Low, Design Residual)

Steal slots are keyed by the owner's lock hash, but daily mischief counts live in per-farm state. Opening a second farm grants another 30 mischief actions (**executed**: `probe_mischief_limit_is_per_farm`). Because claiming a farm requires only a refundable ~332 CKB deposit, the 30/day cap deters casual players rather than determined griefers. The real hard cap is 1 weed + 1 bug per plot per season. Tracking mischief per owner cleanly does not fit a single-cell-per-farm model; best handled by disclosing clearly in the rules.

### FB-4 · Deployer Key Equals Global Admin (Medium, Trust Model, Unchanged)

The `code` cell is guarded by the deployer's lock. Its holder can swap in arbitrary bytecode (including rules that drain farm CKB) or burn the `code` cell to permanently freeze all farms. The `type-id` validator enforces only identity uniqueness and non-duplication, not upgrade benevolence (`tests/tests/upgrade.rs`, 5 executed tests). At the time of review this was a single local hot key; moving to multisig/hardware wallet with public upgrade rules (timelock, notice window, or eventual renunciation) is recommended before serious Mainnet value.

### FB-5 · Strangers Can Repeatedly "Touch" Your Farm Cell to Invalidate Your In-Flight Transactions (Low-to-Medium, Availability, Unfixed at Review Time)

A farm cell's lock allows anyone to spend it as long as the state transition is valid. Dropping and pulling a weed in one transaction leaves the visited farm byte-identical while rotating its outpoint, invalidating any in-flight transaction (including `close`) sent by the owner.

- **Executed**: `probe_exp_from_clearing_own_mischief` — visitor signature only, 30 rounds of drop+pull weed, transaction accepted, visited farm unchanged, visitor gains 0 XP.
- **Inferred**: mempool invalidation follows from CKB's cell model (not exercised against a live mempool).
- Cost is just tx fees; daily cap caveat in FB-3. No funds stolen, but can hinder management or closing.
- Remediation direction: require a net state change on visited farms (`output != input`), or charge a tiny CKB fee left inside the visited farm cell — both require a contract change *(Note: subsequently fixed on-chain via net-state-change check & same-tx mischief+help ban — see [AUDIT.en.md](AUDIT.en.md))*.

### FB-6 · Anti-Steal Is Per Key and the Guard Dog Is Grindable (Low, Design Residual)

- Thief identity is the owner's lock hash — a fresh key is a fresh identity, so "once per player per season" is effectively "once per key." The hard bound is 40% total per season.
- Dog blocking is a deterministic function of `(lock_hash, public_seed)`. **Executed**: `r3_dog_grind_still_possible` found an identity bypassing all 18 guard-dog plots on attempt #31,856.
- 16 slots per plot per season map via lock hash. **Inferred**: after `k` steals, a new honest player faces roughly a `k/16` collision chance (up to 5–6 steals under the 40% cap).

### FB-7 · Anyone-Can-Pay Owner Locks Allow Forced Close (Low, Unchanged at Review Time)

If an owner uses an anyone-can-pay lock (spendable without signature as long as capacity does not decrease), a stranger can include the owner's cell as input and refund the deposit to force-close the farm, wiping out game progress (**executed**: `r3_acp_close_deposit_must_go_home` and `weak_owner_lock_cannot_be_skimmed`). CCC's default wallets do not use ACP locks (confirmed by reading `@ckb-ccc/core` source), though other clients are not blocked on-chain *(Note: Gemini 4 Neon's GN-01 later showed the 1 CKB fee allowance makes this profitable rather than zero-loss, and the frontend now blocks ACP locks on claim — see [AUDIT.en.md](AUDIT.en.md))*.

### FB-8 · Implicit Assumptions About Owner Locks in `close` (Informational, Inferred)

`close` treats "owner cell in inputs" as owner consent to the full transaction, which holds for full-transaction signature locks (all common wallets) but would not hold for partial-signing / open-transaction locks.

Two minor edge cases (inferred, no fund impact): setting owner hash equal to farm lock hash hurts only the creator; an owner cannot close Farm A and perform an owner op on Farm B in the same transaction because `close` requires net inflow while owner ops require net outflow — simply use two transactions.

### FB-9 · Client & Operations Notes (Informational)

- Neighbors list loads up to 300 farms per page on demand; `findFarmByOwner` returns only the first matching farm when one key owns multiple farms (code review).
- Testnet's validator cell used an all-zero lock (~28,400 CKB permanently unrecoverable on shutdown), whereas devnet's validator used the deployer's lock (read-only check). Mainnet defaults to a recoverable deployer lock.
- Single public RPC configured with no fallback (code review).
- 8 devnet genesis test keys are bundled in the frontend for local dev only — verify nobody funds those addresses on testnet/mainnet (code review).
- 23 low-severity `elliptic` advisories come upstream via `@ckb-ccc` (executed).
- No unsafe HTML injection (`innerHTML`, `dangerouslySetInnerHTML`, `eval` absent in `web/src`); `localStorage` stores only language, devnet account index, and own farm outpoint — never keys.
- Local bot process running during audit needed a restart to pick up Patch #3.

## Patches in This Round (11-23, Workspace at Review Time)

The first three did not change the contract; the fourth changed the contract and rebuilt binaries:

1. **Pinned compiler**: added `rust-toolchain.toml` (rustc 1.98.1 with riscv and wasm targets); rebuilt artifacts matched byte-for-byte (executed).
2. **Keyfiles only**: `deploy.ts`, `upgrade.ts`, and `shutdown.ts` unified on `signingKey` in `env.ts`. Rejects `--privkey` CLI args, requires `--keyfile <path>` or `FARM_KEYFILE`, enforces mode `0600`, validates private-key format, requires a key on testnet/mainnet, and never leaks key bytes in errors. All 16 cases verified; `--yes` check runs before reading keys on mainnet.
3. **Visitor identity parameter**: `bots.ts` and `e2e.ts` passed farm ID instead of owner lock hash to `view()` (affected preview only, not on-chain rules). Fixed and verified with 13/13 E2E steps.
4. **FB-2 contract fix**: added `is_visitor` in `crates/farm-core/src/lib.rs`; invoked from `close` in `contracts/farm/src/main.rs` with error code 54; rebuilt `build/farm` (51,760 B) and `farm_wasm.wasm`; upgraded both devnet and testnet in place; updated `deployments.json` and `web/src/i18n.ts`; added `tests/tests/audit_fable_r2.rs` (6 tests).

## Verified Properties

Confirmed via code review and passing tests:

| Property | Evidence |
| --- | --- |
| Output state byte-matches rules output | End of `update`; `script.rs`, e2e step 12 |
| Farm cell CKB is monotonic; withdrawn only on owner close | `E_CAPACITY`; `close` |
| Owner ops & claim require owner payment (owner input + positive net spend) | `owner_pays`; `r3_stranger_spends_victim_gold` |
| One cell per farm; ID unforgeable | `check_type_id`; `upgrade.rs` |
| No-op spends rejected | `E_NOTHING_HAPPENED` |
| Close cannot bundle actions | `E_CLOSE_WITH_ACTIONS` |
| Time can only be under-reported (no benefit); plant time from commit block | `proven_time`, `settle` |
| Arithmetic overflow-safe | `overflow-checks = true`, checked gold/inventory, saturating XP |
| Invalid state cannot decode | `Farm::decode` length, version, crop, flags, season checks |
| Different `unit` worlds isolated | `update` filters by `unit` prefix |
| Visitor must be another farm in the same world | `BadActor` in `run_actions` |
| Same player's second farm cannot steal twice | `r3_sybil_fix_holds_and_honest_steal_works` |
| Drop+pull weed yields zero XP | `probe_exp_from_clearing_own_mischief` |

## Not Verified in This Audit

- **Mainnet**: not deployed and no mainnet transactions sent at review time.
- **Real wallets**: no browser JoyID/MetaMask signing; tests used private-key signers.
- **Full 2-hour testnet flow**: read-only verification on testnet except the FB-2 probe.
- **Published web pages**: not redeployed during this round.
- **Other players' testnet farms**: only two temporary farms tested post-upgrade.
- **Cross-machine reproducibility**: byte-identical rebuilds verified on macOS aarch64 only.
- **Live mempool behavior of FB-5**, **FB-6 collisions**, **FB-8**: inferred only.
- No fuzzing or formal verification.
- Short post-upgrade observation window; pre/post VM probes mocked wallets with `always-success`.

## Pre-Mainnet Checklist (Snapshot at Review Time)

1. Move deployer key to multisig or hardware wallet with public upgrade rules (FB-4).
2. Rebuild and publish web pages (`cd web && npm run build && npm run deploy:pages`).
3. Decide whether to fix FB-5 (require net state change on visited farms) or document clearly.
4. Run full claim-to-close walkthrough with real wallets on testnet, then small-value mainnet.
5. Verify reproducible build via `rust-toolchain.toml` on a second machine (ideally Linux container).
6. Configure RPC fallback nodes.
7. Clarify in rules: 40% seasonal cap, dog & daily caps as deterrents, and use signature-requiring addresses.
8. Commission an independent human security audit firm review.

## Reproduction

```bash
cargo test -p farm-tests
cargo test -p farm-tests --test audit_fable_r2 -- --nocapture
cargo test -p farm-tests --test audit_fable -- --nocapture
```

Rebuild and compare (without overwriting `build/`):

```bash
cd contracts && CARGO_TARGET_DIR=../target/audit/pinned cargo build --release --target riscv64imac-unknown-none-elf -p farm -p type-id && shasum -a 256 ../target/audit/pinned/riscv64imac-unknown-none-elf/release/farm ../build/farm
```

Devnet E2E (requires `./start.sh`):

```bash
cd web && npm run e2e
```

To observe pre-fix binary failures:
- Close bug (FB-1): extract `build/farm` from commit `1a6e10c` and run `FARM_BINARY=<path> cargo test -p farm-tests --test audit_fable` → 4 failures.
- Closing visitor (FB-2): extract `build/farm` from commit `5e886b9` and run `FARM_BINARY=<path> cargo test -p farm-tests --test audit_fable_r2` → 2 failures.
