// Chinese/English for every user-facing string. The language is remembered in
// localStorage and applied to <html lang>; error messages from the chain layer
// are looked up at throw time, so a mid-session switch affects new errors only.

import { useEffect, useState } from "react";

export type Lang = "zh" | "en";
const LANG_KEY = "ckb-farm.lang";

function initial(): Lang {
  // Node scripts import this module too; there is no browser storage there.
  if (typeof localStorage === "undefined") return "zh";
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "en" || saved === "zh") return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

let lang: Lang = initial();
const listeners = new Set<() => void>();

function apply() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
}

if (typeof document !== "undefined") apply();

export function setLang(next: Lang) {
  lang = next;
  if (typeof localStorage !== "undefined") localStorage.setItem(LANG_KEY, next);
  apply();
  listeners.forEach((fn) => fn());
}

export function getLang(): Lang {
  return lang;
}

/** Subscribes the component tree to language changes. */
export function useLang(): [Lang, (next: Lang) => void] {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [lang, setLang];
}

/** Looks up a string in the current language, filling `{placeholders}`. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const text = dict[lang]?.[key] ?? dict.zh[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    vars[name] === undefined ? whole : String(vars[name]),
  );
}

const zh: Record<string, string> = {
  netDevnet: "本地开发链",
  netTestnet: "CKB 测试网",
  netMainnet: "CKB 主网",
  brandSub: "{network}上的农场",
  levelWord: "级",
  timeH: "小时",
  timeM: "分",
  timeS: "秒",
  crop1: "白萝卜",
  crop2: "胡萝卜",
  crop3: "玉米",
  crop4: "土豆",
  crop5: "茄子",
  crop6: "番茄",
  crop7: "豌豆",
  crop8: "辣椒",
  crop9: "南瓜",
  crop10: "草莓",
  crop11: "西瓜",
  crop12: "葡萄",
  crop13: "香蕉",
  crop14: "菠萝",
  crop15: "水蜜桃",
  crop16: "樱桃",
  goldTitle: "金币",
  account: "账户",
  connectWallet: "连接钱包",
  disconnectWallet: "断开钱包",

  bootText: "正在读取链上的田地…",
  reload: "重新连接",

  claimTitle: "开垦一块自己的地",
  claimIntro: "农场是一个存在 CKB 链上的格子，之后的每一次播种、收获和串门都由链上合约按同一套规则验算。",
  factDeposit: "≈332 CKB",
  factDepositNote: "占地押金，随时收回",
  factGold: "{gold} 金币",
  factGoldNote: "开垦即得的种子钱",
  factPlots: "{plots} 块地",
  factPlotsNote: "攒经验可开垦到 {max} 块",
  farmNameLabel: "农场的名字",
  createFarm: "开垦农场",
  walletHint: "连接 CCC 支持的钱包后就能开垦，JoyID、MetaMask 等都可以。",
  poor: "这个账户的 CKB 不够。",
  faucetLink: "去水龙头领取测试币",
  tryAnother: "换一个测试账户试试。",
  noFaucet: "这个网络没有水龙头，请自备 CKB。",

  rename: "改名",
  visiting: "{level} 级，你在这里做客",
  backHome: "回自己的农场",
  unnamedFarm: "无名农场",
  myFarmFallback: "我的农场",

  harvestAll: "全部收获",
  tidyAll: "全部打理",
  shovelAll: "全部铲除",
  sowAll: "空地全种{crop}",
  visitTools: "做客时用的工具",
  toolHand: "摘取和帮忙",
  toolWeed: "放草",
  toolPest: "放虫",

  emptyHint: "点一下播种",
  withered: "已枯萎",
  justSown: "刚播下",
  canHarvest: "可收 {n}",
  canSteal: "可摘 {n}",
  ripe: "熟了",
  youStole: "你摘过了",
  forOwner: "给主人留着",
  dogGuards: "狗守着",
  stolen: "被摘 {n}",
  season: "第{n}季",
  lockedTitle: "开垦这块地",
  lockedLevel: "需要 {level} 级",

  dogAwake: "看门狗站岗中，还有 {time}",
  dogHungry: "看门狗饿着，不看门",
  dogVisitorAwake: "它会拦下你在大约{percent}%的地里伸出的手",
  dogVisitorGone: "现在摘菜没有狗管",
  dogFeedInfo: "喂一次管一整天（{time}），能挡住约{percent}%的偷摘",
  dogLocked: "{level} 级后可以喂狗看门",
  feedDog: "喂狗",

  basketAria: "待上链的操作",
  undoAll: "全部撤销",
  send: "上链，{n} 个操作一笔交易",
  undoOne: "撤销这一步",

  dockSeeds: "种子",
  dockBarn: "仓库",
  dockNeighbours: "邻居",
  dockRules: "规则",

  plotText: "{i}号地",
  verbWeed: "除草",
  verbPest: "除虫",
  verbWater: "浇水",
  dClear: "{plot}{verb}",
  dBuy: "买{crop}种子 ×{count}",
  dPlant: "{plot}种{crop}",
  dHarvest: "收获{plot}",
  dShovel: "铲除{plot}",
  dSell: "卖{crop} ×{count}",
  dExpand: "开垦新地",
  dFeedDog: "喂狗",
  dRename: "改名为「{name}」",
  dHelp: "{who}帮{plot}{verb}",
  dMischiefWeed: "{who}往{plot}放草",
  dMischiefPest: "{who}往{plot}放虫",
  dSteal: "{who}摘{plot}",
  whoSep: "：",

  seedsNote: "选一种拿在手里，点空地就种下。袋里没有会顺手买一颗。",
  growInfo: "{hours} 小时成熟，收 {yield} 个",
  seasonsMore: "，共 {seasons} 季",
  sellInfo: "每个卖 {price}，经验 +{exp}",
  lockedUnlock: "{level} 级解锁",
  inBag: "袋里有 {n}",

  barnNote: "仓库是空的。收获的果实会放在这里，卖掉换金币。",
  perFruit: "每个卖 {price}",
  sell: "卖出",
  sellAll: "全部卖出，共 {gold} 金币",

  nbNote: "这条链上每一座农场都是你的邻居，不需要加好友。",
  nbEmpty: "眼下只有你一户。换个账户再开一座，就能互相串门了。",
  nbLevelLand: "{level} 级，{land} 块地",
  pillSteal: "{n} 块可摘",
  pillHelp: "{n} 块要帮忙",

  rulesIntro:
    "这里没有服务器。农场是 CKB 上的一个格子，下面每一条都写在合约里，由全网节点验算。代码 cell 由部署者的锁看守，升级会留在链上历史里可查。",
  rulesTime: "这个世界里 1 个游戏小时是 {time}，一天 {hours} 小时。",
  rulesPlantTime: "播种的时刻取自打包那笔交易的区块，谁也没法谎报。",
  rulesProblems: "作物会自己长草、生虫、缺水。到收获时每留一样没处理，就少收 {percent}%。",
  rulesSteal: "熟了的作物，每位玩家（按钱包）每季每块地能摘一次，全部玩家合计最多摘走四成。",
  rulesHelp: "帮邻居除草、除虫、浇水得 {exp} 点经验，每天前 {n} 次有效。",
  rulesMischief: "每天最多往别人地里放 {n} 次草或虫。",
  rulesDog: "{level} 级起可以喂狗，花 {price} 金币管一天，挡住约 {percent}% 的偷摘。",
  rulesVisit: "串门不需要对方签名，也动不了规则以外的任何东西。",
  codeVersion: "合约版本哈希",
  worldId: "农场世界标识",
  myAddress: "我的地址",
  rulesClose:
    "农场格子里押着的 CKB 始终是你的。收回农场会销毁这座农场连同里面的金币、作物和等级，把 CKB 退回钱包，无法撤销。",
  closeBtn: "收回农场，取回 CKB",
  rulesAudit:
    "已审计：qwen4-max（2026-11-21，三轮），源码审查 + CKB-VM 攻击探针 + 实链验证。当前仍有未修的高危问题（close 授权可被伪造），尚不具备上主网条件。模型审计，不等同第三方审计公司。",
  rulesAuditLink: "查看审计报告",

  renameTitle: "给农场起个名字",
  renameBtn: "就叫这个",
  closeTitle: "收回农场？",
  closeText: "金币、作物和等级都会随之消失，只有格子里的 CKB 回到钱包，这一步无法撤销。",
  cancel: "再想想",
  confirmClose: "确认收回",

  notEnoughGoldSeeds: "金币不够买{crop}种子",
  pendingWait: "种子刚下地，等区块确认",
  notRipeYet: "{crop}还要 {time}",
  emptyPlotToast: "这块地是空的",
  alreadyWithered: "已经枯萎了",
  nothingToHelp: "长势不错，没什么要帮忙的",
  committed: "已上链，{n} 个操作生效",
  farmClaimed: "农场开垦好了",
  farmClosed: "农场已收回，CKB 回到了钱包",

  staleRefresh: "农场刚刚被别人动过，已刷新",
  walletPoor: "钱包里的 CKB 不够支付这笔交易",
  noNode: "连不上 CKB 节点",
  slowTx: "交易迟迟没有上链，请稍后刷新查看",
  noFarm: "找不到这个农场",
  notDeployed: "农场合约还没有部署到{network}",
  rpcFail: "连不上 {rpc}：{message}",
  notOnNetwork: "农场合约不在{network}上",
  devnetHint: "在项目目录运行 scripts/devnet.sh start，再到 web 目录运行 npm run deploy:devnet，然后刷新本页。",

  rule10: "农场数据损坏",
  rule11: "无效的操作",
  rule12: "没有这种作物",
  rule13: "没有这块地",
  rule14: "等级不够",
  rule15: "金币不够",
  rule16: "种子不够",
  rule17: "仓库里没有这么多果实",
  rule18: "仓库放不下了",
  rule19: "这块地已经种了东西",
  rule20: "这块地是空的",
  rule21: "还没成熟",
  rule22: "已经枯萎，请先铲除",
  rule23: "这里没有需要处理的问题",
  rule24: "这里已经有了",
  rule25: "土地已经全部开垦",
  rule26: "需要链上时间，请稍后再试",
  rule27: "缺少播种所在的区块头",
  rule28: "访客农场不在这笔交易里",
  rule29: "这一季你已经摘过这块地了",
  rule30: "这块地不能再被摘了，给主人留点吧",
  rule31: "看门狗守着这块地",
  rule32: "今天使坏的次数用完了",
  rule33: "数值溢出",
  rule34: "游戏时速超出范围",

  err40: "合约读取交易失败",
  err41: "农场脚本参数不对",
  err42: "这不是一个农场格子",
  err43: "农场编号不合法",
  err44: "农场格子必须使用农场锁",
  err45: "农场里的 CKB 不能取出",
  err46: "需要农场主人的签名",
  err47: "链上算出的结果和提交的不一致",
  err48: "新农场必须从初始状态开始",
  err49: "操作数据格式不对",
  err50: "交易输入太多",
  err51: "不能无故动用别人的农场",
  err52: "关闭农场时不能附带操作",
  err53: "区块时间超出范围",
  errUnknown: "合约拒绝了这笔交易（代码 {code}）",
};

const en: Record<string, string> = {
  netDevnet: "local devnet",
  netTestnet: "the CKB testnet",
  netMainnet: "the CKB mainnet",
  brandSub: "a farm on {network}",
  levelWord: "Lv",
  timeH: "h",
  timeM: "m",
  timeS: "s",
  crop1: "Radish",
  crop2: "Carrot",
  crop3: "Corn",
  crop4: "Potato",
  crop5: "Eggplant",
  crop6: "Tomato",
  crop7: "Pea",
  crop8: "Chili",
  crop9: "Pumpkin",
  crop10: "Strawberry",
  crop11: "Watermelon",
  crop12: "Grape",
  crop13: "Banana",
  crop14: "Pineapple",
  crop15: "Peach",
  crop16: "Cherry",
  goldTitle: "Gold",
  account: "Account",
  connectWallet: "Connect wallet",
  disconnectWallet: "Disconnect",

  bootText: "Reading the fields on chain…",
  reload: "Reconnect",

  claimTitle: "Claim a plot of your own",
  claimIntro:
    "A farm is a cell on the CKB chain. Every later planting, harvest and visit is checked by the on-chain contract against one set of rules.",
  factDeposit: "≈332 CKB",
  factDepositNote: "your deposit, reclaim any time",
  factGold: "{gold} gold",
  factGoldNote: "seed money to start with",
  factPlots: "{plots} plots",
  factPlotsNote: "grow to {max} with experience",
  farmNameLabel: "Name your farm",
  createFarm: "Claim the farm",
  walletHint: "Connect a CCC-supported wallet to claim — JoyID, MetaMask and more.",
  poor: "This account does not have enough CKB. ",
  faucetLink: "Get testnet CKB from the faucet",
  tryAnother: "Try another test account.",
  noFaucet: "this network has no faucet — bring your own CKB.",

  rename: "Rename",
  visiting: "level {level}, you are visiting",
  backHome: "Back to my farm",
  unnamedFarm: "Unnamed farm",
  myFarmFallback: "My farm",

  harvestAll: "Harvest all",
  tidyAll: "Tend all",
  shovelAll: "Shovel all",
  sowAll: "Sow {crop} on empty plots",
  visitTools: "visit tools",
  toolHand: "Pick & help",
  toolWeed: "Weed",
  toolPest: "Bugs",

  emptyHint: "tap to sow",
  withered: "withered",
  justSown: "just sown",
  canHarvest: "harvest {n}",
  canSteal: "pick {n}",
  ripe: "ripe",
  youStole: "you already picked",
  forOwner: "saved for the owner",
  dogGuards: "dog on guard",
  stolen: "picked {n}",
  season: "season {n}",
  lockedTitle: "Clear this plot",
  lockedLevel: "needs level {level}",

  dogAwake: "The guard dog is on duty for {time}",
  dogHungry: "The guard dog is hungry and off duty",
  dogVisitorAwake: "it will stop about {percent}% of your picks",
  dogVisitorGone: "no dog is watching now",
  dogFeedInfo: "one feed lasts a day ({time}) and stops about {percent}% of picks",
  dogLocked: "the guard dog unlocks at level {level}",
  feedDog: "Feed",

  basketAria: "moves waiting for the chain",
  undoAll: "Undo all",
  send: "Commit {n} moves in one transaction",
  undoOne: "undo this move",

  dockSeeds: "Seeds",
  dockBarn: "Barn",
  dockNeighbours: "Neighbours",
  dockRules: "Rules",

  plotText: "plot {i}",
  verbWeed: "weed",
  verbPest: "de-bug",
  verbWater: "water",
  dBuy: "buy {count} {crop} seeds",
  dPlant: "sow {crop} at {plot}",
  dHarvest: "harvest {plot}",
  dShovel: "shovel {plot}",
  dSell: "sell {count} {crop}",
  dExpand: "clear new land",
  dFeedDog: "feed the dog",
  dRename: "rename to “{name}”",
  dHelp: "{who} helps {plot}: {verb}",
  dMischiefWeed: "{who} drops a weed at {plot}",
  dMischiefPest: "{who} drops a bug at {plot}",
  dSteal: "{who} picks {plot}",

  seedsNote: "Pick one to hold, then tap empty plots to sow. Short on seeds? One is bought for you.",
  growInfo: "ripe in {hours}h, yields {yield}",
  seasonsMore: ", {seasons} seasons",
  sellInfo: "sells for {price}, +{exp} exp",
  lockedUnlock: "unlocks at level {level}",
  inBag: "{n} in the bag",

  barnNote: "The barn is empty. Harvested fruit lands here; sell it for gold.",
  perFruit: "sells for {price}",
  sell: "Sell",
  sellAll: "Sell all — {gold} gold",

  nbNote: "Every farm on this chain is your neighbour. No friend list needed.",
  nbEmpty: "Only you so far. Claim another farm with another account and go visiting.",
  nbLevelLand: "level {level}, {land} plots",
  pillSteal: "{n} pickable",
  pillHelp: "{n} need help",

  rulesIntro:
    "There is no server here. A farm is a cell on CKB, and every rule below lives in the contract, checked by the whole network. The code cell is guarded by the deployer's lock, and upgrades stay visible in chain history.",
  rulesTime: "One game hour lasts {time}; a day is {hours} game hours.",
  rulesPlantTime: "The planting moment is the block that packed the transaction — nobody can lie about it.",
  rulesProblems:
    "Crops grow weeds, pests and dry spells on their own; each one left untended costs {percent}% of the harvest.",
  rulesSteal: "Ripe crops: each player (by wallet) picks a plot once per season, and all players together at most 40%.",
  rulesHelp: "Helping a neighbour earns {exp} exp, effective for the first {n} of the day.",
  rulesMischief: "At most {n} weeds or bugs a day in other people's fields.",
  rulesDog: "From level {level} you can feed the dog: {price} gold for a day, stopping about {percent}% of picks.",
  rulesVisit: "Visits need no signature and can touch nothing beyond the rules.",
  codeVersion: "Contract version hash",
  worldId: "Farm world id",
  myAddress: "My address",
  rulesClose:
    "The CKB in the farm cell is always yours. Closing destroys the farm — gold, crops and levels — and returns the CKB to your wallet. It cannot be undone.",
  closeBtn: "Close the farm, take the CKB back",
  rulesAudit:
    "Audited by qwen4-max (2026-11-21, three rounds): source review, CKB-VM attack probes, and live-chain verification. A high-severity issue is still open (close authorization can be forged); not mainnet-ready. A model audit, not a third-party audit firm.",
  rulesAuditLink: "Read the audit report",

  renameTitle: "Name your farm",
  renameBtn: "That's the name",
  closeTitle: "Close the farm?",
  closeText: "Gold, crops and levels go with it — only the cell's CKB returns to your wallet. This cannot be undone.",
  cancel: "Wait, no",
  confirmClose: "Close it",

  notEnoughGoldSeeds: "not enough gold for {crop} seeds",
  pendingWait: "just sown — waiting for the block",
  notRipeYet: "{crop} needs {time} more",
  emptyPlotToast: "this plot is empty",
  alreadyWithered: "already withered",
  nothingToHelp: "doing fine — nothing to help with",
  committed: "committed, {n} moves applied",
  farmClaimed: "the farm is claimed",
  farmClosed: "farm closed; the CKB is back in your wallet",

  staleRefresh: "the farm just changed under us — refreshed",
  walletPoor: "not enough CKB in the wallet for this transaction",
  noNode: "cannot reach the CKB node",
  slowTx: "the transaction is taking long — refresh and check later",
  noFarm: "cannot find that farm",
  notDeployed: "the farm contract is not deployed on {network}",
  rpcFail: "cannot reach {rpc}: {message}",
  notOnNetwork: "the farm contract is not on {network}",
  devnetHint: "run scripts/devnet.sh start in the project, then npm run deploy:devnet in web/, and reload this page.",

  rule10: "farm data corrupted",
  rule11: "invalid move",
  rule12: "no such crop",
  rule13: "no such plot",
  rule14: "level too low",
  rule15: "not enough gold",
  rule16: "not enough seeds",
  rule17: "not enough fruit in the barn",
  rule18: "the barn is full",
  rule19: "this plot is already sown",
  rule20: "this plot is empty",
  rule21: "not ripe yet",
  rule22: "withered — shovel it first",
  rule23: "nothing to deal with here",
  rule24: "already there",
  rule25: "all land is cleared",
  rule26: "chain time needed — try again soon",
  rule27: "missing the header of the planting block",
  rule28: "the visiting farm is not in this transaction",
  rule29: "you already picked this plot this season",
  rule30: "nothing left to pick — saved for the owner",
  rule31: "the guard dog is watching",
  rule32: "no mischief left today",
  rule33: "number overflow",
  rule34: "game hour out of range",

  err40: "the contract failed to read the transaction",
  err41: "bad farm script args",
  err42: "not a farm cell",
  err43: "invalid farm id",
  err44: "a farm cell must carry the farm lock",
  err45: "CKB cannot leave a farm cell",
  err46: "the farm owner must sign this",
  err47: "the chain computed a different result than submitted",
  err48: "a new farm must start from the initial state",
  err49: "malformed action data",
  err50: "too many inputs in the transaction",
  err51: "no reason to touch somebody else's farm",
  err52: "closing cannot carry actions",
  err53: "block time out of range",
  errUnknown: "the contract refused this transaction (code {code})",
};

const dict: Record<Lang, Record<string, string>> = { zh, en };

/** Crop names follow the language, ids are 1-based as on chain. */
export function cropName(id: number): string {
  return t(`crop${id}`);
}
