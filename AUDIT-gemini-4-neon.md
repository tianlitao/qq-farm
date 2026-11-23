# 垄上（CKB 链上农场）智能合约安全审计报告

**中文** | [English](AUDIT-gemini-4-neon.en.md)

| 项目信息 | 内容 |
| --- | --- |
| **项目名称** | 垄上 · CKB 链上农场 (`qq_farm`) |
| **审计模型** | **Gemini 4 Neon** |
| **审计日期** | 2026-11-23 |
| **审计范围** | `contracts/farm`、`contracts/type-id`、`crates/farm-core`、`crates/farm-wasm`、`web/scripts/{deploy,upgrade,shutdown,env,key}.ts`、`web/src/chain/{farm,rules,network}.ts` |
| **合约二进制校验（blake2b-256 / sha256）** | `build/farm` (51,760 B): blake2b `0xec8803d81c086f93e41335e74b375ba506d3ce54abd8cf354c26ac7c9469cad4` / sha256 `15ae10f746b4de5e9992dd97507f07a303917ee69ff3a07b649dceba9f6b97a6`<br>`build/type-id` (28,368 B): blake2b `0x3a353bb830b3bde3edacdc05ef9d209de35547230052c6b52cd1dd8a8a7e591c` / sha256 `e809f152889e000243366b375b53c392e9b912f897b7b63ca1ffd958764892cf` |
| **基线测试状态** | `cargo test -p farm-tests` 全部 64 项 CKB-VM 测试通过 |
| **审计方法** | 独立逐行源码审计（不复用历史审计结论）、CKB UTXO/Cell 模型与脚本组语义分析、状态机与经济不变量验证、部署与运维脚本审查 |

> **声明**：本报告由 **Gemini 4 Neon** 独立完成，基于静态源码分析、CKB 共识规则核验及现有测试套件复核，不能替代第三方专业安全审计机构的形式化验证与实网渗透测试。合约当前尚未部署至 CKB 主网，在解决下述高/中危问题及治理风险前，不建议承载真实主网资金。

---

## 一、执行摘要

项目整体架构简洁清晰：规则内核（`farm-core`）采用 `no_std` Rust 实现，链上脚本（`contracts/farm`）与前端 WASM（`crates/farm-wasm`）共享同一份状态转移实现；农场 cell 借助“公开 lock + 严格 type script 状态机 + Type ID 唯一性”的模式，实现了无需主人签名即可串门互动的链上玩法；前期已修复的常规强签名锁关闭授权漏洞、关闭中访客逃避计数漏洞以及放草刷经验漏洞均在当前二进制中生效。

但在本次独立审计中，**Gemini 4 Neon** 发现若干此前未被识别或被低估的安全漏洞与逻辑缺陷：

### 发现总览

| 编号 | 标题 | 严重等级 | 涉及模块 | 状态 |
| --- | --- | --- | --- | --- |
| **GN-01** | ACP / Omnilock-ACP 锁用户可被无签名强制关场并**盈利性盗取 ~1 CKB**（纠正“纯亏本破坏”误判） | **高危 (High)** | `contracts/farm/src/main.rs`、`web/src/chain/farm.ts` | **前端已拦截缓解**（合约层待改） |
| **GN-02** | 单私钥中心化升级与销毁权可盗取全部农场押金或永久冻结资产 | **高危 (High / 架构信任)** | `contracts/type-id`、`web/scripts/{deploy,upgrade}.ts` | 已知/未治理 |
| **GN-03** | 历史区块头“按天步进（Time-Travel）”重置每日计数器：单农场可绕过 `MISCHIEF_PER_DAY` 与部分 `HELP_EXP_PER_DAY` 限制数千倍 | **中危 (Medium)** | `contracts/farm/src/main.rs`、`crates/farm-core/src/lib.rs` | **已修复上线（devnet & testnet）** |
| **GN-04** | `shutdown.ts` 退场检查仅扫描单一默认 `unit` 世界，遗漏非默认 `unit` 农场，存在误烧 `code` cell 致玩家永久冻币风险 | **中危 (Medium)** | `web/scripts/shutdown.ts` | **已修复** |
| **GN-05** | 同笔交易“放草 + 拔草”零状态变化仍可反复消费受害者 cell，结合 GN-03 可构成低成本持续活性 DoS | **中危 (Medium)** | `contracts/farm/src/main.rs`、`crates/farm-core/src/lib.rs` | **已修复上线（devnet & testnet）** |
| **GN-06** | `apply_credit` 对 0 经验的好友杂草清除仍扣除每日 `help_today` 额度，损害诚实帮忙玩家 | **低危 (Low)** | `crates/farm-core/src/lib.rs` | 未修复 |
| **GN-07** | 偷菜与看门狗判定可离线研磨密钥绕过，且 16 位 `thief_slot` 位图存在高达 37.5% 的正常玩家哈希碰撞误拒 | **低危 (Low)** | `crates/farm-core/src/lib.rs` | 部分已缓解 |
| **GN-08** | 游戏经济与机制边界：成熟后同笔 `OP_CLEAR + OP_HARVEST` 零损耗收菜、同主人双农场互助多获 50% 经验、每农场独立使坏上限 | **低危 / 信息 (Low/Info)** | `crates/farm-core/src/lib.rs` | 已知/未修复 |
| **GN-09** | `transition()` 未跳过空操作列表农场的解码与结算（加剧 `O(N²)` 周期开销）及 `level_of` 线性循环 | **信息 / 优化 (Info)** | `crates/farm-core/src/lib.rs`、`contracts/farm/src/main.rs` | 未修复 |
| **GN-10** | `farm.name` 未校验 UTF-8 与 Unicode 双向控制字符（Bidi）、锁/类型模式仅凭 `args.len()` 分派的误用冻币风险及遗留脚本清理 | **信息 (Info)** | `contracts/farm/src/main.rs`、`web/src/chain/rules.ts` | 未修复 |

---

## 二、核心合约架构与信任边界评估

1. **双角色脚本模型（`contracts/farm/src/main.rs`）**
   - 农场 cell 的 lock script 为 `farm`（`args = []`），仅校验 `Source::GroupInput` 每个 cell 都携带合法 36 字节参数的 `farm` type script（`check_lock`）。
   - 农场 cell 的 type script 为 `farm`（`args = unit:u32_le || type_id:[u8;32]`），强制单进单出/创建唯一性（`check_type_id(4, 32)`），在 `create` / `update` / `close` 三条路径下验证状态机输出与资金守恒。
   - **正面评价**：在普通强签名锁（如标准 `secp256k1_blake160`、`JoyID` 非 ACP 模式）场景下，当前 `create`、`update` 的 `owner_pays`（要求 owner 锁入账且净支出 `spent > 0`）与 `close` 的双条件检查（要求 owner 锁入账 + 合并计算所有关闭农场的 `closing_deposits` 且全额回流仅允许 `≤ 1 CKB` 差额）有效防止了陌生人盗取押金或盗花金币。
2. **可升级两 cell 结构（`contracts/type-id/src/main.rs`）**
   - `code` cell 的 type script 为 `type-id`（以 `hash_type: "data2"` 钉死校验器二进制哈希），所有农场以 `hash_type: "type"` 引用 `code` cell 的 type script 哈希。
   - 校验器仅保证身份唯一性与不漂移，不约束升级后的二进制逻辑，且允许销毁（burn）。

---

## 三、详细安全发现

---

### [GN-01] 高危：ACP / Omnilock-ACP 锁用户的农场可被无签名强制关闭，且攻击者每场净赚 ~1 CKB

- **位置**：
  - [contracts/farm/src/main.rs](file:///Users/mac/ckb_projects/qq_farm/contracts/farm/src/main.rs#L60-L62) (`CLOSE_FEE_ALLOWANCE`)
  - [contracts/farm/src/main.rs](file:///Users/mac/ckb_projects/qq_farm/contracts/farm/src/main.rs#L154-L197) (`owner_flow`, `closing_deposits`)
  - [contracts/farm/src/main.rs](file:///Users/mac/ckb_projects/qq_farm/contracts/farm/src/main.rs#L218-L248) (`close`)

#### 漏洞原理

当前 `close()` 为防止“小费伪造”和“弱锁抽干”，采取双条件校验：
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
其中 `CLOSE_FEE_ALLOWANCE = 100_000_000`（即 **1 CKB**）。

文档（`README.md` 第 220 行）与现有测试（`audit_round3.rs` 第 274–325 行、`audit_fable.rs` 第 105–111 行）均错误地认为：对 Anyone-Can-Pay（ACP / Omnilock ACP 模式）锁用户，强制关闭是“攻击者自掏押金赠回 owner 的纯亏本破坏，受害者资金无损”，且测试仅验证了扣留 2 CKB 会被拒绝，**忽略了押金本身来自受害者的农场 cell 且存在 1 CKB 的免检差额**。

对于使用 CKB 标准 RFC-0026 ACP 锁或 Omnilock-ACP 锁的玩家（这些锁是 CKB 生态常见锁，并在项目 `devnet/specs/` 中内置），只要其钱包存在任意一个存活的 ACP cell（例如开垦/游玩后的找零 cell，容量假设为 `61 CKB`），**任意陌生人无需受害者签名**即可构造如下合法交易：

```text
Inputs:
  [0] 受害者农场 cell     (lock = farm_lock,   capacity = 332 CKB)
  [1] 受害者 ACP cell     (lock = victim_acp,  capacity =  61 CKB)
  [2] 攻击者普通 cell     (lock = attacker,    capacity =  61 CKB)

Outputs:
  [0] 受害者 ACP cell     (lock = victim_acp,  capacity = 392 CKB)  // = 61 + 332 - 1 CKB
  [1] 攻击者普通 cell     (lock = attacker,    capacity = 61.9999 CKB) // 净赚 +0.9999 CKB
```

逐项核验链上约束：
1. **`victim_acp` 锁脚本**：输出容量比输入容量净增 `+331 CKB`（远超常见 ACP `min_ckb` 门槛），且 type script / UDT 数量不变——按 RFC-0026 规则，**无需受害者签名即可直接通过**。
2. **`farm` type script (`close`)**：
   - `flow.present == true`（Input[1] 为 `victim_acp`）；
   - `flow.spent = 61 - 392 = -331 CKB`，因此 `gained = +331 CKB`；
   - `closing_deposits = 332 CKB`；
   - `gained + CLOSE_FEE_ALLOWANCE = 331 + 1 = 332 >= 332`——**校验通过！**
3. **CKB 容量守恒**：输入 `454 CKB`，输出 `453.9999 CKB`，手续费 `0.0001 CKB`——**校验通过！**

#### 影响评估

- **直接资金盗窃**：攻击者**无需自掏押金**，反而在每次强制关闭中从受害者农场押金里**直接套利 `1 CKB - tx_fee ≈ 0.9999 CKB`**。攻击者甚至可以部署自动化 MEV/清道夫机器人扫描全链 ACP 农场，形成持续盈利攻击。
- **游戏进度永久销毁**：受害者可能耗时数月培养的高等级农场（最高 18 块地、大量金币与作物）被一键永久抹除；若受害者重新开垦，攻击者可反复收割。
- 即使将 `CLOSE_FEE_ALLOWANCE` 压低至 `0.01 CKB`，只要其大于真实矿工费（约 `0.00005 CKB`），该攻击仍保持正收益。

#### 修复建议

1. **合约层根治（推荐：两步关场 `OP_REQUEST_CLOSE`）**：
   - 新增由主人触发的操作码（如 `OP_MARK_CLOSING`，需满足 `owner_pays`，即 `flow.spent > 0`——即便对 ACP 锁，减少容量也**必须**持有主人私钥签名），在农场状态中置位“待关闭”标志；
   - `close()` 要求农场已处于“待关闭”状态（且仍保留押金全额回流 `owner` 的检查，同时将 `CLOSE_FEE_ALLOWANCE` 从 `1 CKB` 收紧至 `0.01 CKB` 即 `1_000_000` shannons）。
   - 这样既保持无需引入额外签名算法的简洁架构，又让 ACP / Omnilock-ACP 锁用户彻底免疫无签名关场与 1 CKB 抽水。
2. **前端已落地缓解（2026-11-23）**：已在 [web/src/chain/farm.ts](file:///Users/mac/ckb_projects/qq_farm/web/src/chain/farm.ts)（`detectUnsupportedOwnerLock` + `createFarm` 强校验）、[web/src/game.ts](file:///Users/mac/ckb_projects/qq_farm/web/src/game.ts) 与 [web/src/App.tsx](file:///Users/mac/ckb_projects/qq_farm/web/src/App.tsx) 中禁止 `AnyoneCanPay`、`OmniLock-ACP`（`args[21] & 0x02 !== 0`）及 `AlwaysSuccess` 地址开垦农场并展示中英文警示；同时保留已存在 ACP 农场的关闭回收能力。注意：该限制位于客户端层，第三方自行构造交易仍可绕过，彻底封堵仍需采用上述合约层两步关场方案。

---

### [GN-02] 高危（架构信任模型）：单私钥中心化升级与销毁权可盗取全部玩家 CKB 或永久冻币

- **位置**：
  - [contracts/type-id/src/main.rs](file:///Users/mac/ckb_projects/qq_farm/contracts/type-id/src/main.rs#L16-L21)
  - [web/scripts/deploy.ts](file:///Users/mac/ckb_projects/qq_farm/web/scripts/deploy.ts#L109-L135)
  - [web/scripts/upgrade.ts](file:///Users/mac/ckb_projects/qq_farm/web/scripts/upgrade.ts#L81-L110)

#### 漏洞原理

农场 cell 的 **lock script** 和 **type script** 均使用 `hash_type: "type"` 指向 `code` cell 的 `codeScriptHash`。而 `code` cell 的 lock 是部署者的单一 `secp256k1` 私钥，`type-id` 校验器仅保证身份唯一性，既不限制替换的新二进制内容，也允许直接销毁（burn）`code` cell。

#### 影响评估

- **全量资金被盗（Rug Pull / 私钥泄露）**：一旦部署者私钥泄露或作恶，攻击者只需一次升级交易将 `code` cell 的数据替换为任意放行脚本（如 `always_success`），即可无视一切规则，**瞬间转走链上所有存活农场 cell 中锁定的全部 CKB**（每个农场 332–500+ CKB）。
- **全网永久冻币**：若部署者意外或恶意销毁 `code` cell，所有未关闭的农场将永久失去可执行代码，押金永远无法取回。

#### 修复建议

主网部署前必须完成治理加固（三选一或组合）：
1. **硬件多签 + 链上时间锁（Timelock）**：将 `code` cell 的 lock 替换为 `M-of-N` 硬件多签锁，或封装带延迟生效窗口（如 7–14 天）的升级锁，确保玩家有充裕时间审查新代码并在必要时关场退出；
2. **明确放弃升级权（不可变部署）**：待合约稳定并通过第三方审计后，将 `code` cell 转移至全零不可解锁定（`nobody` lock）或让农场切换为 `hash_type: "data2"` 不可升级版本；
3. **运维隔离**：禁止使用与日常钱包混用的热私钥持有 `validator` 和 `code` cell，避免误花导致服务中断。

---

### [GN-03] 中危：历史区块头“按天步进（Time-Travel）”重置每日计数器，单农场可突破使坏与帮忙上限数千倍

- **位置**：
  - [contracts/farm/src/main.rs](file:///Users/mac/ckb_projects/qq_farm/contracts/farm/src/main.rs#L270-L289) (`input_block`, `proven_time`)
  - [crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L200-L215) (`Farm::new`)
  - [crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L518-L548) (`settle`, `roll_day`)
  - [crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L811-L829) (`OP_MISCHIEF`)

#### 漏洞原理

合约依赖 `roll_day()` 按游戏天重置 `mischief_today`（上限 30）与 `help_today`（上限 50）：
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
同时存在四个条件叠加：
1. **新农场初始 `day = 0`**（`Farm::new` 第 207 行），创世/开垦时未将 `day` 锚定到当前链上时间。
2. **已结算农场不强制附带自身区块头**：`settle()` 仅在存在 `pending` 地块时才读取 `input.block`（第 520–523 行）；只要目标农场没有待结算的刚播种地块，交易无需将目标农场的近期区块头放入 `header_deps`。
3. **CKB 允许在 `header_deps` 中引用创世以来的任意历史区块头**：`proven_time()` 仅取 `header_deps` 中的最大时间戳。
4. **`OP_MISCHIEF` 及清除好友杂草的 `OP_HELP` 完全不检查 `now`**：即使 `now` 是 2019 年的区块时间，也完全可以对 2026 年种植的已结算作物放草/放虫和拔草！

#### 攻击场景

以 CKB 主网（`unit = 3600`，自 2019 年 11 月创世至今已跨越约 **2,560+ 个自然日**）为例，攻击者仅需创建 **1 座新农场**（`farm.day = 0`，押金 332 CKB 全额可退）：
- **第 1 笔交易**：不带 `header_deps`（`now = 0, day = 0`），对任意已结算受害者农场执行 **30 次 `OP_MISCHIEF`**（`mischief_today: 0 -> 30`）。
- **第 2 笔交易**：`header_deps` 仅放入 **2019-11-16（第 18,216 天）** 的历史区块头；`roll_day()` 判定 `18,216 > 0`，立即将 `mischief_today` 与 `help_today` **清零**，再执行 **30 次 `OP_MISCHIEF`**。
- **第 3 笔交易**：`header_deps` 放入 **第 18,217 天** 的历史区块头；`18,217 > 18,216`，**再次清零**，再执行 **30 次 `OP_MISCHIEF`**。
- ……以此类推逐日步进至今日（第 20,780 天）。

#### 影响评估

- **每日使坏上限彻底失效**：单座农场在几分钟内即可合法执行 `~2,560 × 30 ≈ 76,800` 次 `OP_MISCHIEF`；即便耗尽全部历史天数，关闭重开一座新农场（仅付 ~0.0002 CKB 手续费）即可再次将 `day` 归零并循环。
- **持续活性 DoS 放大数千倍**：配合下述 **GN-05**（同笔放草+拔草零状态变化），单个农场就能以极低手续费在每个区块持续改变受害者农场的 OutPoint，使受害者的收获、管理乃至关场交易反复因 cell 冲突失效。
- **部分绕过每日帮忙经验上限（`HELP_EXP_PER_DAY = 50`）**：对于已生长跨越 `K` 个游戏日的老作物（在主网/测试网为多日未收的闲置农场，在 devnet `unit=30` 下 1 游戏日仅 12 分钟、2 小时即跨 10 个游戏日），攻击者可按游戏日步进历史区块头，在一分钟内收割 `50 × K` 次自然问题帮忙经验（`150 × K` XP）。

#### 修复建议

1. **将农场 `day` 锚定到自身提交区块（核心修复）**：
   - 在 `update()` 中（至少当存在访客操作或调用 `roll_day` 时）要求交易必须包含**当前农场输入 cell 所在区块的 `header_dep`**（即要求 `input_block(mine)` 为 `Some(block)`），强制 `proven_time() >= block.timestamp`。一旦农场细胞在当前区块上链，其后续交易永远无法时光倒流引用更早的历史区块头；
   - 对新创建的农场（`day == 0`），首次 `update()` 时类似 `settle()` 直接从创建区块头初始化 `farm.day`（或者给农场增设 `created_pending` 标志，在首次更新时用创建区块时间戳锚定 `day`）。
2. **时间一致性校验**：在 `OP_MISCHIEF` 中增加校验：对于非 pending 地块，要求 `now as u64 >= plot.planted_at as u64`，防止用早于播种时刻的区块头对作物使坏。

---

### [GN-04] 中危：`shutdown.ts` 退场检查遗漏非默认 `unit` 世界，存在误冻玩家资产风险

- **位置**：
  - [web/scripts/shutdown.ts](file:///Users/mac/ckb_projects/qq_farm/web/scripts/shutdown.ts#L44-L65)

#### 漏洞原理

- `shutdown.ts` 第 46–59 行在销毁 `code` cell 前检查是否还有存活农场：
  ```ts
  const argsHex = ccc.hexFrom(ccc.numLeToBytes(deployment.unit, 4));
  for await (const cell of client.findCellsOnChain({
    script: { codeHash: deployment.codeScriptHash, hashType: "type", args: argsHex },
    scriptType: "type",
    scriptSearchMode: "prefix",
    ...
  }))
  ```
- 然而链上合约 `contracts/farm/src/main.rs` 允许**任何玩家**使用同一个 `codeScriptHash`、以任意合法 `unit`（`1..=3600`）创建农场（不同 `unit` 只是彼此不可见的平行世界，但共享同一份 `code` cell）。
- 如果有第三方客户端或玩家在非默认 `unit`（例如 `unit = 60`）下创建了农场，`shutdown.ts` 的前缀扫描将**完全漏检**并判定“无存活农场”，随后烧毁 `code` cell，导致这些玩家的农场 CKB **永久锁死无法取回**。

> **交叉核验订正**：初版曾怀疑 `shutdown.ts` 在同笔交易中同时将 `validator` 放入 `cellDeps` 和 `inputs` 会被 CKB 节点拒收。经核查 CKB `resolve_transaction` 语义（同笔交易内 `cell_deps` 仅检查前序交易已消费集合 `seen_inputs`，允许引用本交易自身的 `input`）并与 `glm-5.3-flash` 的 devnet 实测（单笔成功回收 77,955 CKB）交叉印证，单笔回收本身可行，已撤回该误报；但跨 `unit` 世界漏检缺陷真实存在。

#### 修复建议

- **全量前缀扫描**：将 `shutdown.ts` 第 50 行的扫描参数改为 `args: "0x"`（空前缀），同时按 `scriptType: "lock"` 检查 `{ codeHash: deployment.codeScriptHash, hashType: "type", args: "0x" }`，确保覆盖所有 `unit` 世界中依赖该 `code` cell 的一切存活 cell 后再允许执行关服销毁。

---

### [GN-05] 中危：零状态变化访客交易绕过 `E_NOTHING_HAPPENED`，可对任意种植中农场发起低成本活性 DoS

- **位置**：
  - [contracts/farm/src/main.rs](file:///Users/mac/ckb_projects/qq_farm/contracts/farm/src/main.rs#L355-L358)

#### 漏洞原理

合约意图阻止陌生人无意义地消费他人农场 cell（注释：`// Nobody gets to spend a farm cell just to get in its owner's way.`），但仅检查了操作列表是否为空：
```rust
if cells[mine].actions.is_empty() && !outcome.needs_owner {
    return Err(E_NOTHING_HAPPENED);
}
```
它**没有检查农场编码后的输出状态是否相对输入发生了实际变化**。陌生人只需在受害者农场的 witness 中依次放入 `[OP_MISCHIEF(actor, plot, KIND_WEED), OP_HELP(actor, plot, KIND_WEED)]`（前一步放草，后一步拔草），受害者农场输出数据与输入数据**逐字节完全一致**，但交易被合约放行，受害者农场 cell 的 `OutPoint` 被更换。

#### 影响评估

- 在 CKB 的 UTXO 模型中，更换 `OutPoint` 会使受害者正在签名、广播或等待打包的所有交易（包括收获、扩地、喂狗、甚至**关场取回押金**）立即作废。
- 只要受害者有一块正在生长（或已成熟未收）的作物，攻击者结合 **GN-03**（历史区块头步进重置每日使坏次数），仅需单座农场、每笔约 `0.0001 CKB` 手续费，即可对目标农场实施持续性活性阻塞（Liveness DoS）。

#### 修复建议

1. 在 `update()` 中对非主人触发的交易（`!outcome.needs_owner`）增加净状态变更检查：若 `actual == cells[mine].state`，直接返回 `E_NOTHING_HAPPENED`；
2. 同时禁止同一 `actor` 在同一笔交易中对同一地块同时执行 `OP_MISCHIEF` 与 `OP_HELP`；
3. 配合 **GN-03** 的修复，从源头把骚扰频率严格压回合理的每日成本边界内。

---

### [GN-06] 低危：`apply_credit` 对 0 经验的好友杂草清除仍消耗每日 `help_today` 额度

- **位置**：
  - [crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L559-L571) (`apply_credit`)
  - [crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L622-L630) (`clear_problem`)

#### 漏洞原理

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
为防止“放草-拔草刷经验”，合约正确地规定仅自然产生的问题（`earned == true`）给予 `EXP_HELP = 3` 经验。但 `farm.help_today += 1` 写在了 `if earned` **之外**！并且 `clear_problem()` 优先清除好友放的草/虫（`friend_flag`），再清除自然问题。

#### 影响评估

- 诚实玩家热心帮邻居清理他人投放的杂草/害虫时，既拿不到任何经验，还会**白白消耗每天 50 次有经验帮忙的配额（`HELP_EXP_PER_DAY`）**，导致其当天后续清理真正的自然问题时也拿不到经验。
- 与常量定义及文档语义（`Helping a neighbour only earns experience this many times a day`）不符。

#### 修复建议

仅在实际获得经验时递增 `help_today`：
```rust
Credit::Help { earned } => {
    if earned && farm.help_today < HELP_EXP_PER_DAY {
        farm.help_today += 1;
        farm.add_exp(EXP_HELP);
    }
}
```

---

### [GN-07] 低危：看门狗与偷菜防重槽位可离线研磨密钥绕过，且 16 位位图存在高概率误伤诚实玩家

- **位置**：
  - [crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L481-L489) (`thief_slot`, `dog_blocks`)
  - [crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L504-L514) (`check_steal`)

#### 漏洞原理

```rust
pub fn thief_slot(plot: &Plot, thief: &[u8; 32]) -> u16 {
    1 << (mix32(id_word(thief, 0) ^ plot.seed) & 15)
}

pub fn dog_blocks(plot: &Plot, thief: &[u8; 32]) -> bool {
    mix32(id_word(thief, 4) ^ plot.seed ^ 0x0d06_0d06) % 100 < DOG_BLOCK_PERCENT
}
```
1. **离线密钥研磨**：地块结算后 `plot.seed`（甚至在播种块产出后即可推导）完全公开。攻击者可以离线生成若干新的钱包密钥（不同 `owner` 锁哈希），以平均仅需 2 次尝试的极低算力筛出同时满足 `!dog_blocks` 且落入空闲 `thief_slot` 的地址，再用可全额退还的 332 CKB 押金临时开垦 6–7 座农场，独自把目标地块 40% 的 `steal_cap` 全部偷满后关场退回 CKB。同理，主人也可以用自己的小号预先“偷满”自己成熟地块的 40% 份额，实现 100% 产量自留并彻底免疫邻居偷菜。
2. **16 槽位哈希碰撞误伤诚实玩家**：`plot.thieves` 仅为 `u16`（16 个槽位）。对于高产作物（如樱桃每季产量 36、每次偷 2、上限 14，允许 7 名玩家偷菜），当已有 6 名玩家偷过后，**高达 `6 / 16 = 37.5%` 的完全无关的诚实邻居**会因哈希碰撞收到 `Error::AlreadyStolen`（“这一季你已经摘过这块地了”），实际并未偷过。

#### 影响评估

- 不涉及 CKB 资金损失；总损失受 `STEAL_CAP_PERCENT = 40%` 硬顶约束。但削弱了喂狗（300 金币/天）与“每人每季一次”的玩法公平性，且在热门农场场景下造成明显误拒体验。

#### 修复建议

- 若未来升级状态格式（`VERSION = 2`），可将 `thieves` 扩展为 `u32` 或 `u64` 位图（每块地仅增加 2–6 字节，对应 2–6 CKB 押金），可将 6 人偷菜后的诚实碰撞率从 37.5% 降至 18.8%（`u32`）或 9.4%（`u64`）；
- 若需提高看门狗防研磨门槛，可改为“提交-揭示”或将狗判定绑定到“创建于播种区块之前的农场”（记录农场创建区块时间戳并校验 `visitor.created_at < plot.planted_at`），使攻击者无法针对特定 `plot.seed` 事后新生成钱包地址研磨。

---

### [GN-08] 低危 / 信息：游戏机制与数值边界问题

1. **成熟后同笔交易“先清理再收获”零损耗（[crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L776-L784)）**
   - `OP_CLEAR` 未检查 `now < ripe_at`。因为所有自然问题的触发时间严格早于 `ripe_at`，主人完全不需要在作物生长过程中上线照料，只需等作物成熟后在同一笔交易里批量提交 `[OP_CLEAR(...), OP_HARVEST(...)]`，即可拿到 100% 无减产果实与全部清理经验。如果“生长期照料”是核心玩法，应禁止对已成熟地块清除自然问题（或明确作为产品设计的省心特性予以保留）。
2. **同主人多农场互助白赚 +50% 经验（[crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L788-L810)）**
   - `OP_CLEAR` 给 `EXP_CLEAR = 2`，而 `OP_HELP` 给 `EXP_HELP = 3`，但 `OP_HELP` 仅拒绝 `actor == input.index`，未校验 `actor_owner != farm.owner`。拥有两座农场的玩家可以让 B 农场清理 A 农场的自然问题，使每次清理多获得 50% 经验。建议在 `OP_HELP` 中校验 `actor_owner != farm.owner`（或统一自然清理经验值）。
3. **每日使坏上限按农场计数而非按玩家计数**
   - 同一玩家开 `N` 座农场即可拥有 `30 × N` 次/天的使坏额度（即使修复 GN-03 后仍成立）。考虑到单地块每季最多一草一虫的硬上限，属于可接受的低危限制，但建议持续在文档中保持透明说明。

---

### [GN-09] 信息 / 性能优化：`transition()` 未跳过空操作列表农场及 `level_of` 线性循环

- **位置**：
  - [crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L890-L906) (`transition`)
  - [crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L339-L345) (`level_of`)

#### 分析

1. 在 `is_visitor()` 第 923 行，代码正确地跳过了空操作列表：`if i == me || other.actions.is_empty() { continue; }`。但在 `transition()` 第 891 行仅检查了 `if i == me { continue; }`，没有跳过 `other.actions.is_empty()`。在典型的“1 座访客农场访问 `N` 座邻居农场”交易中，访客自身农场的 `actions` 通常为空，结果被其余 `N` 座邻居农场的脚本重复解码、`settle` 和 `roll_day` 了 `N` 次；且若空操作农场带有未结算地块而交易未附带其区块头，还会触发不必要的 `MissingHeader` 报错。
2. `level_of(exp: u32)` 使用线性 `while` 循环逐级累加，正常等级下耗时极短，但极端高经验值（逼近 `u32::MAX`）时每次调用（`OP_BUY_SEED` / `OP_EXPAND` / `OP_FEED_DOG`）将迭代约 9,268 次。改为整数平方根或二分查找可降至 `O(1)` / `O(log L)`。

#### 修复建议

在 `transition()` 第 891 行改为 `if i == me || other.actions.is_empty() { continue; }`，即可在不改变语义的前提下直接降低批量串门的链上周期（cycles）开销。

---

### [GN-10] 信息：其他代码健壮性与运维细节

1. **锁/类型模式仅通过 `args.len()` 区分（[contracts/farm/src/main.rs](file:///Users/mac/ckb_projects/qq_farm/contracts/farm/src/main.rs#L78-L86)）**：
   - `run()` 仅根据 `args.len()` 为 `0` 或 `36` 分派至 `check_lock` 或 `check_type`。对所有按协议生成的农场 cell 是安全的；但如果第三方工具误将 `args = []` 的脚本挂为 type script（创建时 `GroupInput` 为空会放行，花掉时必报 `E_NOT_A_FARM`），或误将 `args = 36B` 的脚本挂为无 type script cell 的 lock script（花掉时 `world()` 找不到对应 type script 必报 `E_SYSCALL`），均会导致该非标准 cell 永久锁死。建议在 SDK/文档中明确约束脚本用法。
2. **`farm.name` 未过滤 Unicode 双向控制字符（[web/src/chain/rules.ts](file:///Users/mac/ckb_projects/qq_farm/web/src/chain/rules.ts#L249-L259)）**：
   - 链上允许任意 18 字节作为农场名；前端 `decodeName` 已过滤 C0/DEL 控制字符与替换符（React 渲染亦防止了 HTML XSS），但未过滤 Unicode Bidi 覆盖字符（如 `U+202A`–`U+202E`、`U+2066`–`U+2069`），攻击者可在邻居列表里制造视觉文字反转欺骗。建议前端正则同步剔除 Bidi 控制字符范围。
3. **`owner_pays` 与 `close` 的交易组合限制**：
   - 当前 `owner_pays`（要求 `flow.spent > 0`）与 `close`（要求 `gained + 1 CKB >= closing_deposits`）互斥，主人无法在同一笔交易中“关掉 A 农场同时给 B 农场买种子/开新场”，也无法“关场同时将押金直接转至另一个新地址”（需拆成两笔交易）。此为无签名防弱锁设计的合理取舍，建议在客户端提示中明确。
4. **遗留测试脚本引用旧私钥路径**：
   - `web/scripts/env.ts` 和 `web/scripts/key.ts` 已很好地强制了 `0600` 权限且禁止 `--privkey` 命令行传参；但 `web/scripts/e2e.ts`、`cleanup-old.ts`、`close-remaining.ts` 仍直接引用 `../.testnet-deployer.key` / `../.testnet-visitor.key`，建议统一迁移至 `signingKey()` 入口以保持一致的密钥管理规范。

---

## 四、已核实安全的机制（Positive Findings）

本次审计同步复核了以下关键安全边界，确认在当前二进制（`0xec8803d8...`）下均有效成立：

- **强签名锁防盗**：对标准 `secp256k1` / `JoyID`（非 ACP）等强签名锁，陌生人既无法调用任何主人操作（`OP_BUY_SEED`..`OP_RENAME`），也无法通过小费伪造关闭他人农场，亦无法盗取农场押金。
- **状态转移确定性与防伪造**：农场 type script 逐字节比对 `farm_core::transition` 的编码结果与 `GroupOutput` 数据，杜绝篡改金币、经验、土地数、果实、看门狗时效或主人锁哈希。
- **关闭中访客逃逸已封堵**：`close()` 校验了 `E_CLOSE_WITH_ACTIONS`（52）与 `is_visitor`（`E_CLOSING_VISITOR` = 54），关闭中的农场不能作为访客参与任何偷菜、帮忙或使坏。
- **容量单调不减**：`update()` 强制 `capacity_out >= capacity_in`（`E_CAPACITY` = 45），且 `create()`/`update()` 强制输出锁保持为 `farm_lock`（`E_LOCK` = 44），防止通过正常游玩抽走农场押金。
- **整数溢出与边界保护**：`contracts/Cargo.toml` 在 release 配置下启用了 `overflow-checks = true`，且 `farm-core` 核心账本计算（金币加减、种子/果实库存、看门狗截止时间、`owner_flow` 的 `i128` 汇总、时间戳 `seconds()` 的 `u32::try_from`）均使用显式检查或饱和运算，未发现可利用的算术溢出漏洞。
- **多世界隔离**：`world()` 严格按 `same_code` 且 `unit` 前缀匹配筛选交易内农场，不同 `unit` 世界的农场无法交叉偷菜或传递信用。

---

## 五、修复优先级路线图

| 优先级 | 编号 | 行动项 |
| --- | --- | --- |
| **P0（上线主网前必改）** | **GN-01** | 引入两步关场（`OP_MARK_CLOSING` 需 `owner_pays`）并收紧 `CLOSE_FEE_ALLOWANCE`，彻底修复 ACP / Omnilock-ACP 盈利性强制关场与 1 CKB 盗取漏洞 |
| **P0（上线主网前必改）** | **GN-02** | 消除单把热私钥升级权：主网部署前切换为硬件多签 + 时间锁治理，或在稳定后永久放弃升级权 |
| **P1（强烈建议修复）** | **GN-03 & GN-05** | `update()` 强制附带自身提交区块头锚定 `proven_time()`、新农场首次更新锚定 `day`、`OP_MISCHIEF` 校验 `now >= planted_at`；同时对纯访客交易禁止输出状态与输入完全相同（`actual == input`） |
| **P1（强烈建议修复）** | **GN-04** | 将 `shutdown.ts` 的存量农场检查改为全量前缀 `args: "0x"`（含 `type` 与 `lock` 查询，覆盖所有 `unit` 世界） |
| **P2（体验与优化）** | **GN-06, GN-07, GN-09, GN-10** | 修复 `apply_credit` 中 `help_today` 仅在 `earned == true` 时递增；`transition()` 跳过空操作农场；前端 `decodeName` 过滤 Bidi 字符；后续版本视情况扩展 `thieves` 位图与防研磨规则 |

---

*审计完成：Gemini 4 Neon（2026-11-23）*
