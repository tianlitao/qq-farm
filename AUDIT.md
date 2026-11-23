# 垄上（CKB 链上农场）综合安全审计报告（AUDIT.md）

> 本文档统一汇总并去重对账了四份独立 AI 模型审计报告的全部发现、修复验证与交叉订正，作为当前代码库与链上二进制（`0xec8803d8…cad4`）的统一安全基线。
>
> **免责声明**：本报告由四份 AI 模型审计合并整理而成，**不等同于第三方专业安全审计机构的人工审计或形式化验证**。合约当前尚未部署至 CKB 主网；在完成“上主网前清单”中的所有 P0 阻断项并经过独立人工复核前，不建议承载真实主网资金。

---

## 一、四份审计报告总览与来源索引

| 审计模型 | 报告文件 | 审计日期 | 覆盖阶段与独特贡献 |
| --- | --- | --- | --- |
| **glm-5.3-flash** | [AUDIT-glm-5.3-flash.md](AUDIT-glm-5.3-flash.md) | 2026-11-21 ~ 11-23 | v2 首发与五轮跟踪：首报 ACP 锁授权问题（V1）、Sybil（V3）、`O(N²)` 周期量化（V4）、升级自愈与 `public/deployments.json`（V5）、`key.ts`/i18n/农场列表陈旧条目（K1/K2/R5-1）及 `shutdown.ts` devnet 实链回收验证 |
| **qwen4-max** | [AUDIT-qwen4-max.md](AUDIT-qwen4-max.md) | 2026-11-21 ~ 11-23 | 四轮追踪：揭示第二轮修复引入的高危回归“61 CKB 小费关闭任意农场”（R3-F1）、首报放草-帮忙刷经验循环（R3-F2）、看门狗密钥研磨实证（R3-F3，31,856 次）、主网客户端接线错误（R3-F4）与 `r4` 复验 |
| **Claude Fable 5.2** | [AUDIT-fable-5.2.md](AUDIT-fable-5.2.md) | 2026-11-21 ~ 11-23 | 独立发现并修复关闭授权漏洞（FB-1）、首报并修复“关闭中农场当访客绕过每日使坏上限”（FB-2，错误码 54）、明确指出使坏按农场计（FB-3）与 cell 碰撞 griefing（FB-5），完成工具链锁定（`rust-toolchain.toml`）与私钥文件权限加固 |
| **Gemini 4 Neon** | [AUDIT-gemini-4-neon.md](AUDIT-gemini-4-neon.md) | 2026-11-23 | 独立全量源码审计：纠正前三轮对 ACP 强关的“纯亏本破坏”误判，揭示攻击者可借 `CLOSE_FEE_ALLOWANCE = 1 CKB` 实现**无签名盈利盗取 ~1 CKB + 毁场**（GN-01）；首报**历史区块头按天步进（Time-Travel）重置每日计数器**（GN-03）、`shutdown.ts` 漏检非默认 `unit` 世界致冻币风险（GN-04）、`apply_credit` 误扣诚实帮忙配额（GN-06）、`transition()` 空操作农场冗余重放（GN-09）及前端 Bidi 字符过滤缺口（GN-10） |

---

## 二、当前审计基线与综合结论

### 1. 当前验证对象
- **核心合约与规则**：`contracts/farm/src/main.rs`、`contracts/type-id/src/main.rs`、`crates/farm-core/src/{lib,crops}.rs`、`crates/farm-wasm/src/lib.rs`
- **合约二进制（本地链 & 测试网均已升级上线）**：
  - `build/farm`（52,008 字节）：blake2b-256 `0x4e2dc6328519ad576cb9963f7693ae2a9b4ebc914c555bd5793975fd3a4055bf` / sha256 `deb85f6f6a08fd98e5176e3e73010300d1e4be23813485dcf92f4fd3779567ab`
    - 测试网升级交易：`0xcb92cb0103c87b76d7be2a7cb2010eb36074c021339cd6417b0c39a9dc454df5`（type script hash `0x0253fea2…9f775d` 不变）
    - 本地链升级交易：`0xec7304f6fb35421b73a75bce3fa48c98c64df672fbef3d256bb0e54734ef0c7d`（type script hash `0x60a2616b…0b3bd` 不变）
  - `web/src/chain/farm_wasm.wasm`（34,017 字节）：sha256 `b2d5eb508898717e6be68881cae0ceacbeefa7891d47883530d2737342363ec4`（已同步构建并发布至 Cloudflare Pages `ckb-farm.pages.dev`）
  - `build/type-id`（28,368 字节，未变）：blake2b-256 `0x3a353bb830b3bde3edacdc05ef9d209de35547230052c6b52cd1dd8a8a7e591c` / sha256 `e809f152889e000243366b375b53c392e9b912f897b7b63ca1ffd958764892cf`
- **主网状态**：尚未部署。
- **测试基线**：`cargo test -p farm-tests` 全部 **69/69**（含新增 `tests/tests/audit_gemini.rs` 3 项回归测试）在真实 CKB-VM 中通过；`tsc --noEmit`（含前端与 `shutdown.ts`）通过；`detectUnsupportedOwnerLock` 三网 18 组用例实测通过。

### 2. 综合结论
- **强签名锁资产安全已稳固，全部中危问题均已在本地代码与新二进制中修复**：
  - 强签名锁（`secp256k1`、`JoyID`、非 ACP `OmniLock`）资产安全经过多轮 CKB-VM 探针与实链验证；
  - **全部三项中危问题（OPEN-03 历史区块头按天步进、OPEN-04 零状态变化访客 DoS、OPEN-05 `shutdown.ts` 跨 `unit` 漏检）现已修复**并编译进本地 `build/farm`（`0x4e2dc632…`）与 WASM，69/69 CKB-VM 测试全绿（待执行 `npm run upgrade` 同步至测试网/本地链）；
  - **OPEN-01（ACP / OmniLock-ACP 盈利性强关）** 已在官方前端实施拦截缓解（拒绝 ACP / OmniLock-ACP / AlwaysSuccess 开垦，保留已有农场关场能力）。
- **当前主网前核心遗留**：
  1. **单私钥中心化升级与销毁权**（`OPEN-02`，高危/治理）：代码 cell 单把热私钥仍需在主网前替换为多签/时间锁或放弃升级权；
  2. **OPEN-01 合约层残留**：前端拦截无法约束第三方直连构造交易，彻底根治需合约层引入两步关场；
  3. **运维与实测收尾**：升级测试网至 `0x4e2dc632…`、重新打包发布前端、走通真实浏览器钱包全流程。

---

## 三、未修复问题统一清单（Open Findings）

> 本节按当前严重度排序，整合四份报告中所有尚未闭环的问题，并标注原始编号对应关系。

| 统一编号 | 严重等级 | 标题 | 来源编号 | 涉及文件 |
| --- | --- | --- | --- | --- |
| **OPEN-01** | **高危 (High)**（前端已缓解） | ACP / Omnilock-ACP 锁用户的农场可被无签名强制关闭，且攻击者每场盈利 ~1 CKB（官方前端已禁止 ACP / Omnilock-ACP 开垦；合约层尚未限制第三方客户端） | **GN-01**（订正 V1/R3-F1d/FB-7 残留） | `contracts/farm/src/main.rs`、`web/src/chain/farm.ts` |
| **OPEN-02** | **高危 (架构信任)** | 单私钥中心化升级与销毁权（可偷全部农场押金或永久冻币） | **V2 / F2 / FB-4 / GN-02** | `contracts/type-id`、`web/scripts/{deploy,upgrade}.ts` |
| **OPEN-03** | **中危 (Medium)**（**已修复上线**） | 历史区块头“按天步进（Time-Travel）”重置每日计数器（已在 `farm-core` 锚定访客提交区块头 + 校验 `now >= planted_at`，已升级本地链/测试网，`audit_gemini.rs` 回归通过） | **GN-03** | `contracts/farm/src/main.rs`、`crates/farm-core/src/lib.rs` |
| **OPEN-04** | **中危 (Medium)**（**已修复上线**） | 零状态变化访客交易（放草+拔草）活性 DoS（已在 `farm-core` 禁止同笔放草后拔草 + `update()` 拒绝纯访客零状态变化，已升级本地链/测试网，`audit_gemini.rs` 回归通过） | **FB-5 / GN-05** | `contracts/farm/src/main.rs`、`crates/farm-core/src/lib.rs` |
| **OPEN-05** | **中危 (运维安全)**（**已修复**） | `shutdown.ts` 退场前仅检查单一默认 `unit` 世界（已改为 `args: "0x"` 全量 `type` + `lock` 前缀扫描） | **GN-04**（已交叉核验订正） | `web/scripts/shutdown.ts` |
| **OPEN-06** | **低危 (Low)** | `apply_credit` 对 0 经验的好友杂草清除仍扣除每日 `help_today` 配额 | **GN-06** | `crates/farm-core/src/lib.rs` |
| **OPEN-07** | **低危 (设计残留)** | 看门狗与偷菜槽位可离线研磨新密钥绕过；16 位 `thief_slot` 位图存在高达 37.5% 的诚实玩家误碰撞 | **V3 / R3-F3 / FB-6 / GN-07** | `crates/farm-core/src/lib.rs` |
| **OPEN-08** | **低危 (规则边界)** | 每日使坏上限按农场计（多开绕过）；成熟后同笔 `OP_CLEAR + OP_HARVEST` 零减产；同主人双农场互助多赚 50% 经验 | **FB-3 / R4-FB3 / GN-08** | `crates/farm-core/src/lib.rs` |
| **OPEN-09** | **信息 / 优化 (Info)** | `transition()` 未跳过空操作农场加重 `O(N²)` 周期、`level_of` 线性循环、锁/类型分派边界、前端 Bidi 过滤与运维健壮性 | **V4 / F4 / F5 / FB-8 / FB-9 / R5-3 / GN-09 / GN-10** | 多文件（见详述） |

---

### [OPEN-01] 高危：ACP / Omnilock-ACP 锁用户可被无签名强制关闭并盈利盗取 ~1 CKB

- **来源与交叉订正**：**Gemini 4 Neon（GN-01）**，纠正 **glm-5.3-flash（V1）**、**qwen4-max（R3-F1d）** 与 **Claude Fable 5.2（FB-7）** 中将 ACP 关场残留视为“攻击者自掏押金、纯亏本破坏、受害者资金无损”的误判。
- **位置**：[contracts/farm/src/main.rs](file:///Users/mac/ckb_projects/qq_farm/contracts/farm/src/main.rs#L60-L62)、[L154-L197](file:///Users/mac/ckb_projects/qq_farm/contracts/farm/src/main.rs#L154-L197)、[L218-L248](file:///Users/mac/ckb_projects/qq_farm/contracts/farm/src/main.rs#L218-L248)
- **机理**：
  - `close()` 校验 `flow.present` 且 `-flow.spent + CLOSE_FEE_ALLOWANCE (1 CKB) >= closing_deposits`。
  - 对使用标准 RFC-0026 ACP 锁或 Omnilock-ACP 锁的玩家，只要其地址存在任意存活 ACP cell（如 `61 CKB` 找零），任意陌生人无需签名即可把受害者农场（`332 CKB`）与该 ACP cell（`61 CKB`）共同放入输入，将 ACP cell 输出扩容至 `61 + 331 = 392 CKB`（净增 `+331 CKB`，无签名通过 ACP 锁校验），并把差额 `1 CKB - tx_fee ≈ 0.9999 CKB` 转给自己。
  - 押金来源是受害者的农场 cell 本身而非攻击者腰包，且 `audit_fable.rs` 仅测试了扣留 2 CKB 被拒，漏检了正好扣留 `1 CKB` 容差的盈利路径。
- **影响**：攻击者每强制关闭一座 ACP 农场即可**净赚 ~0.9999 CKB**，同时永久销毁受害者的全部游戏进度（等级、金币、18 块扩地），可被自动化机器人批量套利。
- **修复建议**：
  1. **合约层根治（推荐）**：引入两步关场——先执行主人操作 `OP_MARK_CLOSING`（要求 `owner_pays` 即 `flow.spent > 0`，ACP 锁无签名无法减少容量），置位“待关闭”标志后方允许 `close()` 销毁，同时将 `CLOSE_FEE_ALLOWANCE` 收紧至 `0.01 CKB`（`1_000_000` shannons）；
  2. **客户端已实施拦截缓解（2026-11-23）**：官方前端已在 [web/src/chain/farm.ts](file:///Users/mac/ckb_projects/qq_farm/web/src/chain/farm.ts)（`detectUnsupportedOwnerLock` 及 `createFarm`）、[web/src/game.ts](file:///Users/mac/ckb_projects/qq_farm/web/src/game.ts) 与 [web/src/App.tsx](file:///Users/mac/ckb_projects/qq_farm/web/src/App.tsx) 中禁止 `OmniLock-ACP`（`args[21] & 0x02 !== 0`）、标准 `AnyoneCanPay` 及 `AlwaysSuccess` 地址开垦新农场并给出明确提示（不影响已有农场的正常收回）。残留边界：合约层尚未禁止第三方客户端直接用 ACP 地址开垦，彻底根治仍需上述合约层两步关场改造。

---

### [OPEN-02] 高危（架构信任模型）：单私钥中心化升级与销毁权

- **来源**：**四份报告一致确认**（**V2 / F2 / FB-4 / GN-02**）
- **位置**：[contracts/type-id/src/main.rs](file:///Users/mac/ckb_projects/qq_farm/contracts/type-id/src/main.rs#L16-L21)、[web/scripts/deploy.ts](file:///Users/mac/ckb_projects/qq_farm/web/scripts/deploy.ts#L109-L135)、[web/scripts/upgrade.ts](file:///Users/mac/ckb_projects/qq_farm/web/scripts/upgrade.ts#L81-L110)
- **机理与影响**：农场 cell 的 lock 与 type 均通过 `hash_type: "type"` 指向由单一热私钥锁定的 `code` cell；`type-id` 校验器仅保证身份唯一不漂移，不审查升级后的二进制内容，也允许销毁 `code` cell。一旦该私钥泄露或作恶，可随时替换为放行脚本**盗走全网所有农场锁定的 CKB**，或烧毁 `code` cell **永久冻结全部押金**。此外，`deploy.ts` 已默认将 `validator` 设为部署者锁（可回收；`--immortal-validator` 可切回全零永生锁），当前测试网校验器仍为不可回收全零锁。
- **修复建议**：上主网前必须替换为**硬件多签 + 链上时间锁（Timelock）**治理，或在合约完全稳定后将 `code` cell 转移至全零锁永久放弃升级权。

---

### [OPEN-03] 中危：历史区块头“按天步进（Time-Travel）”重置每日计数器

- **来源**：**Gemini 4 Neon（GN-03）**（前三轮未发现）
- **位置**：[contracts/farm/src/main.rs](file:///Users/mac/ckb_projects/qq_farm/contracts/farm/src/main.rs#L270-L289)、[crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L200-L215)、[L518-L548](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L518-L548)、[L811-L829](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L811-L829)
- **机理**：
  1. `Farm::new()` 将初始 `day` 设为 `0`；
  2. 目标农场无 `pending` 地块时，`settle()` 不读取 `input_block()`，交易无需携带其近期区块头；
  3. CKB 允许 `header_deps` 引用创世以来的任意历史区块头，`proven_time()` 仅取其最大时间戳；
  4. `OP_MISCHIEF` 及清除好友杂草的 `OP_HELP` 不检查 `now`。
- **影响**：攻击者仅用 **1 座新农场**（`day = 0`），首笔不带区块头执行 30 次 `OP_MISCHIEF`，随后逐笔传入 2019 年创世至今的递增历史区块头（CKB 主网约 2,560+ 天），每笔触发 `roll_day()` 清零 `mischief_today` 与 `help_today`，几分钟内即可执行 **~76,800+ 次使坏**（用完关场重开即可归零再刷）；对跨多游戏日的老作物（尤其是 devnet `unit=30` 下 2 小时即跨 10 天）同样可借此绕过 `HELP_EXP_PER_DAY = 50` 速刷经验；结合 **OPEN-04** 可实现单农场低成本无限期活性 DoS。
- **修复状态（2026-11-23，已修复并重编译，待升级上链）**：
  1. 已在 [crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L902-L932) 的 `transition()` 中对涉及 `Credit::Help` / `Credit::Mischief` 的访客农场强制要求附带自身提交区块头（`mine.block` 必须存在且 `clock.now >= block.timestamp`，否则报 `Error::MissingHeader`），同步跳过 `other.actions.is_empty()`（顺带修复 **OPEN-09** 空操作重放开销，两农场偷摘周期由 298,313 降至 291,243）；
  2. 已在 `OP_MISCHIEF` 中校验 `!plot.is_pending() && now < plot.planted_at` 返回 `Error::NeedTime`；
  3. 已在 [tests/tests/audit_gemini.rs](file:///Users/mac/ckb_projects/qq_farm/tests/tests/audit_gemini.rs) 通过 `gn03_historical_header_day_stepping_is_refused` 与 `gn03_help_also_requires_visitor_block_header` 真实 CKB-VM 回归验证。

---

### [OPEN-04] 中危：零状态变化访客交易绕过 `E_NOTHING_HAPPENED` 构成活性 DoS

- **来源**：**Claude Fable 5.2（FB-5）**、**Gemini 4 Neon（GN-05）**（qwen4-max 与 glm-5.3-flash 复审确认）
- **位置**：[contracts/farm/src/main.rs](file:///Users/mac/ckb_projects/qq_farm/contracts/farm/src/main.rs#L355-L372)、[crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L668-L845)
- **机理与影响**：`update()` 原先仅在 `cells[mine].actions.is_empty()` 时拒绝空转，未校验输出状态是否相对输入发生实际变化。陌生人在受害者农场的 witness 中连续放入 `[OP_MISCHIEF, OP_HELP]`（放草后立刻拔草），受害者状态逐字节不变，但 cell 的 `OutPoint` 被刷新，导致主人在途的收获、管理乃至关场交易全部因 UTXO 冲突作废。
- **修复状态（2026-11-23，已修复并重编译，待升级上链）**：
  1. 已在 `farm-core::run_actions` 中追踪 `mischief_this_tx`，禁止 `OP_HELP` 清除同一笔交易中刚投放的杂草/害虫（报 `Error::BadAction`）；
  2. 已在 `contracts/farm/src/main.rs` 的 `update()` 中对纯访客交易（`!outcome.needs_owner`）校验 `expected[..len] == cells[mine].state[..]` 报 `E_NOTHING_HAPPENED`（51）；
  3. 已在 `gn04_same_tx_mischief_and_help_is_refused`、`probe_exp_from_clearing_own_mischief` 与 `r3_help_exp_mischief_loop` 中通过真实 CKB-VM 回归验证（跨两笔交易的正常放草/帮忙仍正常通过）。

---

### [OPEN-05] 中危（运维安全）：`shutdown.ts` 退场检查遗漏非默认 `unit` 世界，存在误冻资产风险

- **来源与交叉订正**：**Gemini 4 Neon（GN-04）**。
  - *交叉核验说明*：GN-04 初版曾怀疑 `shutdown.ts` 同笔交易既消费又引用 `validator` cell 会被节点拒绝；经核查 CKB `resolve_transaction` 规则（同笔交易允许 `cell_dep` 引用自身 `input`，`seen_inputs` 仅约束前序交易）并与 **glm-5.3-flash** 第四轮 devnet 实测（单笔成功回收 77,955 CKB）对账后，已确认单笔回收可行并撤回该误报；但下方“漏检非默认 `unit` 世界”缺陷确认成立。
- **位置**：[web/scripts/shutdown.ts](file:///Users/mac/ckb_projects/qq_farm/web/scripts/shutdown.ts#L44-L66)
- **机理与影响**：合约允许玩家以任意合法 `unit`（`1..=3600`）引用同一 `codeScriptHash` 创建农场，但 `shutdown.ts` 原先仅按 `args: numLeToBytes(deployment.unit, 4)` 前缀扫描存量农场，会漏检非默认 `unit` 的存活农场并误烧 `code` cell 导致冻币。
- **修复状态（2026-11-23，已修复）**：已将 `shutdown.ts` 改为按 `args: "0x"` 空前缀同时扫描 `scriptType: "type"` 与 `scriptType: "lock"` 并按 `txHash:index` 去重，确保覆盖所有 `unit` 世界中依赖该 `codeScriptHash` 的一切存活 cell；已通过 TypeScript 类型检查。

---

### [OPEN-06] 低危：`apply_credit` 对 0 经验好友杂草清除仍消耗 `help_today` 额度

- **来源**：**Gemini 4 Neon（GN-06）**
- **位置**：[crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L559-L571)、[L622-L630](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L622-L630)
- **机理与影响**：修复“放草-拔草刷经验”后，清除好友放的草/虫（`earned == false`）不再给经验，但 `farm.help_today += 1` 仍在 `if earned` 外部执行，且 `clear_problem()` 优先清除好友杂草。诚实玩家热心帮邻居清草既不得经验，还会白白耗尽每日 50 次有经验帮忙的额度。
- **修复建议**：将 `farm.help_today += 1` 移入 `if earned && farm.help_today < HELP_EXP_PER_DAY` 分支内。

---

### [OPEN-07] 低危（设计残留）：看门狗/偷菜可离线研磨新密钥绕过 & 16 位槽位高概率误碰撞

- **来源**：**qwen4-max（R3-F3 / F3）**、**Claude Fable 5.2（FB-6）**、**glm-5.3-flash（V3）**、**Gemini 4 Neon（GN-07）**
- **位置**：[crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L481-L489)、[L504-L514](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L504-L514)
- **机理与影响**：
  1. `dog_blocks` 与 `thief_slot` 是 `(owner[0..8], plot.seed)` 的确定性函数，而 `plot.seed` 上链公开。`r3_dog_grind_still_possible` 实测第 **31,856** 次尝试即可离线筛出绕过全部 18 块地看门狗的新钱包密钥（且可创建 6–7 个临时可退款农场独自偷满 40% `steal_cap`，或由主人小号提前偷满自保）。
  2. `plot.thieves` 仅为 16 位位图，对樱桃等可被 7 人偷摘的作物，前 6 人偷过后，无关的诚实邻居有高达 **`6 / 16 = 37.5%`** 的概率因哈希碰撞被误拒 `AlreadyStolen`。
- **修复建议**：文档明确将 40% 定位为硬边界、狗与槽位为概率节制；若未来升级至状态 `VERSION = 2`，可将 `thieves` 扩为 `u32`/`u64` 位图，并可校验访客农场创建时间早于 `plot.planted_at` 以阻断事后研磨。

---

### [OPEN-08] 低危（规则与经济边界）：按农场计使坏、成熟后零损耗清草与同主人双场互助

- **来源**：**Claude Fable 5.2（FB-3）**、**qwen4-max（R4-FB3）**、**Gemini 4 Neon（GN-08）**
- **要点**：
  1. **每日使坏按农场计（实证 `probe_mischief_limit_is_per_farm`）**：同玩家第二座农场另享 30 次/天（硬边界为每地块每季最多一草一虫）；
  2. **成熟后同笔 `OP_CLEAR + OP_HARVEST` 零损耗**：`OP_CLEAR` 未检查 `now < ripe_at`，玩家无需在生长期照料，成熟时一次清理并收获即可拿满 100% 产量与清理经验；
  3. **同主人双农场互助多赚 +50% 经验**：`OP_HELP`（3 XP）未禁止 `actor_owner == farm.owner`，比自己 `OP_CLEAR`（2 XP）多赚 50% 经验。

---

### [OPEN-09] 信息与优化汇总（合约性能、锁模型假设、客户端与运维）

- **来源**：**四份报告汇总**（**V4 / F4 / F5 / FB-8 / FB-9 / R5-3 / GN-09 / GN-10**）
- **合约与性能**：
  - **`transition()` 未跳过空操作农场**（GN-09）：[crates/farm-core/src/lib.rs](file:///Users/mac/ckb_projects/qq_farm/crates/farm-core/src/lib.rs#L890-L906) 未像 `is_visitor()` 一样跳过 `other.actions.is_empty()`，加剧批量串门 `O(N²)` 周期开销（30 座农场约 3,949 万 cycles，客户端已拆单 `≤ 24` 座/笔约 2,558 万 cycles，远低于 7,000 万上限），建议补上 `other.actions.is_empty()` 跳过；
  - **`level_of(exp)` 线性循环**（GN-09）：极端高经验下最多迭代 ~9,268 次，可改为整数平方根或二分；
  - **锁/类型模式仅凭 `args.len()` 分派**（GN-10）：非标准构造（如 `args = []` 作 type script 或 `args = 36B` 作无 type cell 的 lock script）会造成自发永久冻币；
  - **锁签名范围假设与交易组合限制**（FB-8 / GN-10）：`close` 与 `owner_pays` 假设主人锁为全交易签名（不兼容 open-tx / 部分签名锁），且同一笔交易不能同时关闭 A 农场并执行 B 农场主人操作或把押金直接转至他处。
- **前端与运维**：
  - **`farm.name` 未剔除 Unicode Bidi 覆盖字符**（GN-10）：[web/src/chain/rules.ts](file:///Users/mac/ckb_projects/qq_farm/web/src/chain/rules.ts#L249-L259) 已过滤 C0/DEL 且无 `innerHTML` XSS，但建议同步剥离 `U+202A–U+202E` / `U+2066–U+2069` 防视觉欺骗；
  - **RPC 单点无 fallback**（F5 / FB-9）：公共节点仅配置单一 URL；
  - **多农场 UI 显示**（FB-9）：`findFarmByOwner` 仅返回同一钱包下的第一座农场；
  - **依赖公告**（FB-9）：`npm audit --omit=dev` 有 23 条来自 `@ckb-ccc` 上游 `elliptic` 的低危公告（无中高危）；
  - **遗留测试脚本密钥路径**（GN-10）：`e2e.ts` / `cleanup-old.ts` / `close-remaining.ts` 仍读 `../.testnet-*.key`，建议统一至 `env.ts` 的 `signingKey()`；
  - **测试并发稳定性**（R5-3）：7 套 Rust 测试并发执行时偶发资源竞争失败，单跑必过，CI 建议串行或加重试；
  - **已发布网页需同步刷新**（FB-2）：每次测试网合约升级后须重新构建发布静态站点（`public/deployments.json` 需为最新代码 cell outpoint）。

---

## 四、已修复并闭环的历史漏洞（Resolved Findings）

| 编号 | 原等级 | 问题描述 | 原报告编号 | 修复方式与实链/VM 验证 |
| --- | --- | --- | --- | --- |
| **FIXED-01** | **严重 / 高危** | 第二轮 `owner_net < 0` 方向授权导致陌生人仅付 61 CKB 小费即可无签名关闭**任意**农场并偷走 ~270 CKB | **R3-F1 / FB-1** | `close()` 改为双条件：主人锁须在输入中 **且** 全部关闭农场押金合并回流主人（`closing_deposits`，容差 `≤ 1 CKB`）。`audit_fable.rs`（8 测试）、`audit_round3.rs` 及本地链真实节点全拒（46），测试网已升级（强签名锁完全免疫；ACP 残留见 **OPEN-01**） |
| **FIXED-02** | **中危** | v1 仅校验 `owner_present`，导致 ACP 弱锁可被无签名冒充执行主人操作及创建幽灵农场 | **V1 / F1** | `create()` 与 `update()` 改为 `owner_pays`（要求主人输入在场且净支出 `spent > 0`），ACP 无法伪造净减，强签名锁不受影响 |
| **FIXED-03** | **中危** | 同笔交易放草-拔草循环 30 轮无成本白刷 90 经验 | **R3-F2** | `Credit::Help { earned }` 仅对自然问题发放经验，循环收益归零（`probe_exp_from_clearing_own_mischief` 与 `r3_help_exp_mischief_loop` 断言 0 经验） |
| **FIXED-04** | **低危** | 关闭中的农场被指名为访客时绕过每日使坏上限并烧毁被偷果实 | **FB-2** | `close()` 调用 `is_visitor()` 重放同世界其他农场操作，若自身被点名为访客则报 `E_CLOSING_VISITOR`（54）。`audit_fable_r2.rs`（6 测试）及本地链、测试网实链验证全部通过 |
| **FIXED-05** | **中危（工程）** | `createClient("mainnet")` 误返 `ClientPublicTestnet` 连测试网，`key.ts` 主网客户端脚本表错配 | **R3-F4 / F5** | 改为返回 `ClientPublicMainnet`，`key.ts` 复用同一入口，实测连主网 RPC 成功 |
| **FIXED-06** | **低危（设计）** | 偷菜防重与狗判定按 `farm.id` 计，同玩家开第二座农场可重复偷同一地块 | **V3 / F3** | 改为按访客农场状态中的 `owner` 锁哈希（字节 `1..33`）计槽位与狗判定，`r3_sybil_fix_holds_and_honest_steal_works` 回归通过（新钥匙研磨残留见 **OPEN-07**） |
| **FIXED-07** | **低危（可扩展性）** | 批量串门 >40 座农场触及 70M cycles 上限 | **V4 / F4** | 前端 `play()` 自动拆单为 `≤ 24` 座/笔（~2,558 万 cycles），状态逐笔结转 |
| **FIXED-08** | **低危（运维/前端）** | 升级中断记录失步、农场列表幽灵条目滞留、无工具链锁定、命令行 `--privkey` 泄露风险、`key.ts` 参数解析与英文 i18n 拼接错误、`bots/e2e` viewer 参数错误 | **V5 / K1 / K2 / R5-1 / Fable 11-23 修补** | 全部修复：`upgrade.ts` 链上自愈 + 双写 `public/deployments.json`；列表刷新按活集合清理；新增 `rust-toolchain.toml`（1.98.1）；`signingKey()` 禁用 `--privkey` 并强制 `0600` keyfile；修复 `key.ts`、i18n 与 `bots.ts`/`e2e.ts` |

---

## 五、已核实成立的核心安全性质

经四份报告独立代码审查、64+ 项真实 CKB-VM 测试与本地链/测试网实链验证确认：

1. **状态机确定性与防篡改**：`update()` 逐字节比对 `farm_core::transition` 输出与 `GroupOutput` 数据；非法状态被 `Farm::decode` 严格拦截（版本、长度、地块数、作物范围、标志位、季数、空地全零）。
2. **农场容量单调不减**：正常游玩中 `capacity_out >= capacity_in`（`E_CAPACITY` = 45），且 `create()`/`update()` 强制输出锁保持为 `farm_lock`（`E_LOCK` = 44）。
3. **身份唯一性**：农场与代码 cell 均受 `check_type_id` 约束，不可复制、不可漂移、不可伪造第二世界（`tests/tests/upgrade.rs` 5 项测试实证）。
4. **算术安全**：`contracts/Cargo.toml` 开启 `overflow-checks = true`，金币/种子/果实采用 `checked_*`，经验采用 `saturating_add`，`owner_flow` 采用 `i128` 汇总，时间戳转换使用 `u32::try_from`（安全支撑至 2106 年）。
5. **前后端规则同源**：合约与前端 WASM 编译自同一份 `no_std` `farm-core`，无规则分叉。
6. **跨世界隔离**：不同 `unit` 的农场在 `world()` 中严格隔离，无法相互偷菜或传递信用。

---

## 六、尚未验证的范围

- **CKB 主网**：尚未部署，未执行任何主网交易。
- **真实浏览器钱包签名**：JoyID、MetaMask、OKX、UniSat 等均仅完成 UI 选择器接入，未用真实私钥在浏览器中走完开垦 → 播种 → 串门 → 收获 → 关场闭环。
- **测试网完整 2 小时真实周期**：v2 世界尚未完整跑完一轮 2 小时成熟/偷摘/收获 E2E（已验证开垦、播种、放草、关闭及 FB-2 攻击拒绝）。
- **跨平台可复现构建**：`rust-toolchain.toml` 逐字节一致仅在本机（macOS aarch64）验证，尚未在 Linux 容器等独立环境复核。
- **模糊测试与第三方人工审计**：尚未进行 fuzzing、形式化验证及专业安全审计公司独立复核。

---

## 七、统一上主网前清单（按优先级）

### P0 · 阻断上线（主网前必改）
1. **修复 OPEN-01（ACP 盈利性强关与 ~1 CKB 盗取）**：合约层引入两步关场（`OP_MARK_CLOSING` 强制 `owner_pays`）并收紧 `CLOSE_FEE_ALLOWANCE`，同时前端拦截/警示 ACP 类地址；补充针对 `deposit - 1 CKB` 扣留路径的 CKB-VM 回归测试。
2. **解决 OPEN-02（单私钥升级治理）**：将 `code` cell 升级锁切换为硬件多签 + 链上时间锁，或在稳定后永久转移至全零锁放弃升级权。

### P1 · 强烈建议在主网前修复
3. **修复 OPEN-03（历史区块头按天步进重置计数器）**：`update()` 锚定农场输入自身区块头、新农场首次更新锚定 `day`、`OP_MISCHIEF` 校验 `now >= planted_at`，并补充历史区块头步进攻击的 CKB-VM 回归测试。
4. **修复 OPEN-04（零状态变化访客活性 DoS）**：对 `!outcome.needs_owner` 交易拒绝 `actual == cells[mine].state`，并禁止同笔同人同地块的放草+拔草组合。
5. **修复 OPEN-05（`shutdown.ts` 跨 `unit` 漏检）**：将退场前存量农场扫描改为全量前缀 `args: "0x"`（覆盖 `type` 与 `lock`）。
6. **真实钱包与完整流程实测**：使用真实浏览器钱包在测试网走通完整 2 小时生命周期，再在主网小额验证；并在独立 Linux 环境中复核构建哈希一致性。

### P2 · 体验优化与长期加固
7. **修复 OPEN-06 & OPEN-09 轻量化改动**：`apply_credit` 仅在 `earned == true` 时递增 `help_today`；`transition()` 跳过 `other.actions.is_empty()`；前端 `decodeName` 过滤 Bidi 控制字符；配置公共 RPC fallback；统一遗留脚本的密钥加载；每次升级后及时同步重新发布静态网页。
8. **明确文档披露与第三方复核**：在规则页与 README 中如实更新 OPEN-01/03/07/08 边界（40% 固定上限、狗与每日次数性质、仅使用强签名锁）；如引入高价值或金币↔CKB 兑换通道，必须重新进行经济与合约审计并引入第三方专业审计机构。

---

## 八、复现与验证命令

```bash
# 运行全部 CKB-VM 合约、规则、升级与三轮审计探针测试
cargo test -p farm-tests

# 单独查看各轮审计探针输出
cargo test -p farm-tests --test audit -- --nocapture
cargo test -p farm-tests --test audit_round3 -- --nocapture
cargo test -p farm-tests --test audit_fable -- --nocapture
cargo test -p farm-tests --test audit_fable_r2 -- --nocapture

# 校验合约可复现构建哈希（不覆盖 build/）
cd contracts && CARGO_TARGET_DIR=../target/audit/pinned cargo build --release --target riscv64imac-unknown-none-elf -p farm -p type-id
shasum -a 256 ../target/audit/pinned/riscv64imac-unknown-none-elf/release/farm ../build/farm

# 本地链 13 步端到端测试（需先运行 ./start.sh）
cd web && npm run e2e
```

---

*本综合报告合并自 `glm-5.3-flash`、`qwen4-max`、`Claude Fable 5.2`、`Gemini 4 Neon` 四份独立审计报告，整理于 2026-11-23（由 Gemini 4 Neon 汇总编校）。*
