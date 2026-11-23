# Ridge · Fully On-Chain Farm on CKB

[中文](README.md) | **English**

A social farming game running 100% on [Nervos CKB](https://www.nervos.org/). Claiming land, planting, weeding, pest control, watering, harvesting, selling crops, expanding plots, feeding a guard dog, and visiting neighbors to pick ripe fruit, help out, or drop weeds and bugs are all verified by a single on-chain CKB script. There is no server; every save state and every rule lives on-chain, and under the current rules nobody can unilaterally touch your farm. The contract **can be upgraded transparently by the deployer** (see *Upgrades & Trust Model* below): upgrades swap the rule binary in place while keeping the same Type ID, with every change recorded on-chain. Upgrade authority is real power — please read that section before playing.

**Audited (four independent AI model audits consolidated)**: See the unified baseline in [AUDIT.en.md](AUDIT.en.md) ([中文版](AUDIT.md)), consolidating [AUDIT-gemini-4-neon.en.md](AUDIT-gemini-4-neon.en.md) (Gemini 4 Neon, 2026-11-23), [AUDIT-qwen4-max.en.md](AUDIT-qwen4-max.en.md) (qwen4-max, four rounds), [AUDIT-fable-5.2.en.md](AUDIT-fable-5.2.en.md) (Claude Fable 5.2), and [AUDIT-glm-5.3-flash.en.md](AUDIT-glm-5.3-flash.en.md) (glm-5.3-flash). Methodology covers line-by-line source review, real CKB-VM attack probes, and live devnet/testnet verification; **69/69 tests** pass on the current binary. All high- and medium-severity issues discovered (stranger closing any farm for a tip, historical header day-stepping counter resets, zero-state-change visitor griefing, and `shutdown.ts` missing non-default `unit` worlds) **have been fixed and deployed**; the OmniLock-ACP / ACP forced-close risk (GN-01) is mitigated by blocking ACP addresses on the official frontend. Live on **CKB Mainnet Beta** (https://ckb-farm.pages.dev) and **CKB Testnet** (https://ckb-farm-testnet.pages.dev). These are AI model audits and do not replace a third-party human security audit firm.

The gameplay is inspired by classic social farming games, while the name, art, numbers, and interface are all original to this project.

## Run Locally in One Minute

Requires Node 20+ and [offckb](https://github.com/ckb-devrel/offckb) (only used for its `ckb` node binary; you may also set `CKB_BIN=/path/to/ckb`).

```bash
./start.sh
```

This starts the bundled local devnet (`127.0.0.1:8214`), deploys the contracts, launches 4 neighbor bots that farm and visit on their own, and starts the web app. Open <http://localhost:5183>, pick a test account in the top right, and claim a farm.

On devnet, 1 game hour equals 30 seconds — radishes ripen in 1 minute.

```bash
./start.sh stop
```

Stops the devnet and bots. Run `scripts/devnet.sh reset` to wipe the devnet and start fresh.

## Why It Is Decentralized

| What a server normally does | How Ridge does it on CKB |
| --- | --- |
| Storing save data | Each farm is a CKB cell; its state (gold, XP, land count, barn inventory, and every plot) is the cell's data |
| Validating actions | The farm cell's type script replays the transaction's action list; the resulting output state must match byte-for-byte |
| Accounts | Each farm stores its owner's lock hash. Spending gold or mutating your own farm requires an owner-locked input (the owner's signature) |
| Friend list | None. Every farm on the same chain & world is your neighbor |
| Clocks | Proven from block header timestamps (see below) |
| Randomness (weeds, pests, guard dog) | Seeded from the hash of the block that committed the planting transaction |
| Operator seizing CKB from farm cells | Impossible under the current rules: the farm lock is public, only rule-permitted transitions pass, and cell capacity never decreases except on owner close. However, the deployer can upgrade the code cell — see the next row and *Upgrades & Trust Model* |
| Rule upgrades | Supported and transparent: the code cell uses a Type ID to pin its identity and is guarded by the deployer's lock. Upgrading spends the code cell to replace the binary in place with the same Type ID, so all existing farms immediately run the new rules with full on-chain history |

**Being completely transparent**: upgrade authority is real power. Whoever holds the deployer key can swap in arbitrary new rules — including rules unfavorable to existing saves — or burn the code cell to freeze all open farms permanently (stranding their CKB). The Type ID validator guarantees *identity cannot drift and no forged copy can exist*; it does **not** guarantee upgrades are benevolent. Understand this before playing: the rules are open, upgrades are auditable on-chain, and upgrade authority is intentionally centralized in the deployer key.

The web app is simply a convenient client. It runs the exact same Rust rules as the contract (compiled to WASM), so what the UI allows and what the chain verifies never diverge. Anyone can build an alternate client or construct transactions directly.

### Anatomy of a Transaction

```text
inputs                             outputs
  [0] My farm     ──action list──▶  [0] My farm (new state)
  [1] Neighbor's  ──my visit────▶   [1] Neighbor's farm (new state)
  [2] My wallet cell (pays fee &     [2] Change
      proves I own [0])
header_deps: each farm's committing block + a recent block (proving "it is at least time T")
```

- A farm cell's lock script is the same binary (with empty args), enforcing one rule: *"this cell must carry the farm type script."* That allows neighbors to include your farm in a transaction without your signature, while restricting them strictly to permitted visit actions (picking ripe crops, helping, dropping weeds/bugs) and guaranteeing CKB capacity never decreases.
- Visitor actions live in the visited farm's witness (`WitnessArgs.input_type`), naming the visitor by its input index. The visitor farm's type script replays the same list to credit stolen fruit, XP, and daily counters on its own output. Both sides compute independently and must agree.
- Multiple actions can be batched into one transaction. The web app collects your clicks in a basket and commits them together.

### Time Model

An on-chain script can never know the exact wall-clock time; it can only prove *"a block with timestamp T exists, so it is at least T"*:

- A transaction includes a recent block header whose timestamp acts as `now` (a lower bound). Reporting an earlier block only makes crops less ripe, offering no advantage.
- Planting does not record a timestamp immediately. On the next transaction touching that farm, the contract reads the timestamp and block hash of the block that committed the planting transaction, stamping `planted_at` and deriving the plot's deterministic weather/dog seed. Planting time cannot be falsified.

## Game Rules

16 crops, unlocked by level. One game hour is 30 seconds on devnet and 3,600 seconds (1 real hour) on mainnet/testnet. Farms sharing the same time unit form a single world.

| Crop | Level | Seed | Grow | Seasons | Yield / Season | Sell Price | XP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Radish | 1 | 80 | 2h | 1 | 16 | 10 | 6 |
| Carrot | 1 | 120 | 3h | 1 | 18 | 13 | 9 |
| Corn | 2 | 180 | 4h | 1 | 20 | 17 | 12 |
| Potato | 3 | 240 | 5h | 1 | 22 | 20 | 15 |
| Eggplant | 4 | 320 | 6h | 1 | 24 | 24 | 18 |
| Tomato | 5 | 420 | 7h | 2 | 22 | 22 | 20 |
| Pea | 6 | 500 | 8h | 1 | 26 | 34 | 26 |
| Chili | 7 | 600 | 9h | 2 | 24 | 30 | 28 |
| Pumpkin | 8 | 760 | 10h | 1 | 28 | 48 | 34 |
| Strawberry | 10 | 900 | 11h | 2 | 26 | 40 | 38 |
| Watermelon | 12 | 1150 | 12h | 1 | 30 | 68 | 44 |
| Grape | 14 | 1400 | 14h | 3 | 26 | 52 | 48 |
| Banana | 16 | 1800 | 16h | 2 | 30 | 75 | 56 |
| Pineapple | 18 | 2300 | 18h | 1 | 34 | 130 | 66 |
| Peach | 21 | 3000 | 20h | 3 | 30 | 110 | 76 |
| Cherry | 25 | 4200 | 24h | 2 | 36 | 190 | 96 |

- Start with 6 plots and 500 gold, expandable up to 18 plots. The 7th plot requires level 3 and 2,000 gold; the 18th requires level 25 and 280,000 gold.
- Cumulative XP required for level $n$ is $50 \times n \times (n - 1)$.
- Growing crops may develop natural weeds, pests, or dry spells. Each untended problem at harvest reduces yield by 10%. Clearing a natural problem yourself grants 2 XP.
- Once ripe, each neighbor (keyed by owner lock hash) can pick once per plot per season, taking 8% of yield (at least 1 fruit), capped at 40% total across all neighbors.
- Helping a neighbor clear a natural problem grants 3 XP (up to 50 times per game day). Mischief (dropping weeds or bugs) is capped at 30 times per farm per game day.
- Starting at level 3, you can feed the guard dog for 300 gold to guard your farm for 1 day (24 game hours), blocking roughly 50% of thief picks.
- After the final season is harvested, a withered stump remains; shoveling it clears the plot and grants 3 XP.
- Owners can close their farm at any time: the cell is destroyed and the ~332 CKB storage deposit returns directly to the owner's wallet.

The single source of truth for all numbers is [crates/farm-core/src/crops.rs](crates/farm-core/src/crops.rs) and [crates/farm-core/src/lib.rs](crates/farm-core/src/lib.rs).

## Repository Layout

```text
crates/farm-core   Game rules (no_std Rust) shared by both the contract and the web client
contracts/farm     CKB script: parses transactions, runs farm-core, verifies outputs
contracts/type-id  Type ID validator guarding the upgradable farm code cell
crates/farm-wasm   WASM wrapper around farm-core for the browser
tests              CKB-VM integration & audit test suites (ckb-testtool)
web                Web client (React + CCC) plus deploy, upgrade, shutdown, bot, and E2E scripts
devnet             Bundled local CKB devnet configuration
scripts            Contract build, WASM build, and devnet management scripts
build/farm         Compiled farm contract (~52 KB)
build/type-id      Compiled Type ID validator (~28 KB)
```

## Development

```bash
cargo test -p farm-tests          # 69 tests: 9 rules, 20 contract, 5 upgrade, 35 audit probes & regressions (real CKB-VM)
scripts/build-contract.sh         # Toolchain pinned by rust-toolchain.toml; needs riscv64imac-unknown-none-elf
scripts/build-wasm.sh             # Requires wasm32-unknown-unknown target
```

```bash
cd web
npm run e2e                       # Full 13-step live devnet E2E test
npm run bots                      # Local neighbor bots
npm run build                     # Typecheck + production bundle
```

Whenever you change game rules, rebuild **both** the RISC-V contract and the WASM module, then upgrade in place (`scripts/build-contract.sh` → `scripts/build-wasm.sh` → `npm run upgrade`). The code cell keeps its Type ID so existing farms automatically pick up the new rules without recreating anything.

### Networks & Deployments

`VITE_NETWORK`: `devnet` / `testnet` / `mainnet`. Both Mainnet Beta and Testnet are live:

- **Mainnet Beta**: https://ckb-farm.pages.dev
  - Code cell: `0xee0a27d9ccc317c7d4014c3e6683cb2a8d335d709d5afeb02939a4909772cebe:0`
  - Validator cell: `0xa97335c213caf920e580e13488168da930d50ccee085af1c1c13e009135ff495:0`
  - `codeScriptHash`: `0x578e1f832861bc0040beaf777182f82262aa58a21ae2135f6afb0cbdfcfbf12b`
  - Binary blake2b (`codeHash`): `0x4e2dc6328519ad576cb9963f7693ae2a9b4ebc914c555bd5793975fd3a4055bf`
  - Game hour: `3600` s/h; both deployment cells use the deployer lock and are fully recoverable on shutdown.
- **Testnet**: https://ckb-farm-testnet.pages.dev
  - Code cell: `0xcb92cb0103c87b76d7be2a7cb2010eb36074c021339cd6417b0c39a9dc454df5:0`
  - `codeScriptHash`: `0x0253fea2b3d45853c5381fb20ed7efffce8f79cfbb059e1ea3befddf299f775d`
  - Binary blake2b (`codeHash`): `0x4e2dc6328519ad576cb9963f7693ae2a9b4ebc914c555bd5793975fd3a4055bf`
  - Game hour: `3600` s/h; testnet CKB is available via the [Nervos Faucet](https://faucet.nervos.org/).

Authoritative deployment records live in [web/src/chain/deployments.json](web/src/chain/deployments.json).

**Deployer keys are generated locally and never committed to git**:

```bash
cd web
npm run key:new -- deployer --network testnet   # creates keys/deployer.key (mode 0600, gitignored)
npm run key:info -- deployer --network testnet  # print address & balance
npx tsx scripts/deploy.ts --network testnet --keyfile keys/deployer.key
```

Keys are read strictly from `0600`-permissioned files (`--keyfile <path>` or `FARM_KEYFILE`); `--privkey` CLI flags are rejected. Mainnet deploy, upgrade, and shutdown commands additionally require `--network mainnet --yes --keyfile ...`.

**Both deployment cells are recoverable** (unless `--immortal-validator` is explicitly passed at deploy time). To retire a world and reclaim all ~80,563 CKB (refuses if any farm across any `unit` world remains open):

```bash
cd web
npm run shutdown:testnet -- --keyfile keys/deployer.key
# Mainnet: npx tsx scripts/shutdown.ts --network mainnet --yes --keyfile keys/mainnet-deployer.key
```

**Upgrading rules in place**:

```bash
bash scripts/build-contract.sh && bash scripts/build-wasm.sh
cd web
npx tsx scripts/upgrade.ts --network testnet --keyfile keys/deployer.key
npm run deploy:pages:testnet   # or npm run deploy:pages for mainnet
```

### Upgrades & Trust Model

The code cell's lock script is the upgrade authority. What the key holder **can** and **cannot** do:

**Can do:**
- Replace the code cell binary with arbitrary new rules. All existing farms execute the new rules starting on their next transaction; on-chain consensus does not restrict rule changes.
- Burn the code cell (Type ID allows burning). Doing so renders every remaining open farm cell unspendable, permanently stranding their CKB deposits.

**Cannot do:**
- Forge a duplicate code cell or drift the Type ID: the Type ID validator (`hash_type: "data2"`) enforces global uniqueness.
- Steal farm CKB under the current binary: capacity is monotonically non-decreasing and closing requires owner presence plus full deposit return. However, because the deployer can upgrade the binary, "cannot steal CKB" rests on trusting the deployer not to deploy malicious code.

**Summary**: *Ridge is an open-rules, transparently upgradable game with intentionally centralized single-admin upgrade authority* to enable rapid fixes and iteration. Keep the mainnet deployer key safely backed up offline; if desired in the future, upgrade authority can be migrated to a multisig/timelock or permanently renounced by locking the code cell to an all-zero lock.

## Verification Status & Known Boundaries

**Verified:**
- **69/69 Rust tests** passing in real CKB-VM: 9 rule tests, 20 contract tests, 5 upgrade-path tests, and 35 audit probe & regression tests.
- **Reproducible builds (local)**: `rust-toolchain.toml` pins `rustc 1.98.1`, yielding byte-identical `build/farm`, `build/type-id`, and WASM outputs on macOS aarch64.
- **Mainnet Beta & Testnet live**: both run `build/farm` (`0x4e2dc632…55bf`) with CCC wallet support (JoyID, MetaMask, OKX, UniSat); testnet verified end-to-end with real browser wallets.
- **13/13 devnet E2E steps** passing on the upgraded binary.
- **High & Medium audit findings resolved**: close tip forgery (`FIXED-01`), closing-visitor bypass (`FIXED-04`), mischief-help XP loop (`FIXED-03`), historical header day-stepping (`OPEN-03`), same-tx mischief+help / zero-state-change visitor DoS (`OPEN-04`), `shutdown.ts` multi-`unit` scan (`OPEN-05`), and frontend blocking of OmniLock-ACP / ACP / AlwaysSuccess addresses (`OPEN-01` mitigation).

**Known boundaries & future improvements:**
- **No third-party human audit firm**: four independent AI model audits are consolidated in [AUDIT.en.md](AUDIT.en.md) ([中文](AUDIT.md)), which do not replace a professional third-party audit firm.
- **Cross-OS build reproducibility**: verified on macOS aarch64; not yet verified in an independent Linux container.
- **Single public RPC per network**: fallback RPCs are not yet configured in `web/src/chain/network.ts`.
- **Per-farm daily mischief limit (Low)**: a player operating multiple farms gets 30 mischief actions per farm per day; the hard cap remains at most 1 friend weed + 1 friend pest per plot per season.
- **Guard dog grinding & 40% steal cap (Low)**: `dog_blocks` is deterministic in `(owner_lock_hash, public_seed)`, so a determined attacker can offline-grind fresh keys; the 40% total steal cap per plot per season is the hard boundary.
- **Batch visiting `O(N²)`**: mitigated in the official client by automatic chunking (`≤ 24` farms per transaction, ~25.6M cycles vs. 70M limit).
- **UTXO contention**: each farm is a single cell and can only be updated once per block; concurrent visits to a popular farm may need a retry.
- **Block-hash randomness**: plot weather and guard-dog seeds derive from block hashes, which is suitable for a casual farming game rather than cryptographic lottery fairness.
