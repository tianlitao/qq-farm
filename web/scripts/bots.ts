// Neighbours for the dev chain: a few test accounts that farm on their own and
// drop by other farms, so there is somebody to visit. They play by the same
// rules through the same transactions as anyone else; stop them with Ctrl-C.
//
//   npm run bots                 four neighbours (accounts C to F)
//   npm run bots -- --count 3    fewer
//   npm run bots -- --every 12   seconds between rounds

import type { ccc } from "@ckb-ccc/ccc";
import type { FarmCell, Move } from "../src/chain/farm";
import { ChainError } from "../src/chain/farm";
import { type FarmView, type PlotView, KIND_PEST, KIND_WEED, rules, view } from "../src/chain/rules";
import { account, arg, openChain, sleep } from "./env";

const NAMES = ["老周的坡地", "阿梨果园", "七号试验田", "河湾小圃"];
const FIRST_ACCOUNT = 2; // A and B are left for people
const count = Math.min(NAMES.length, Number(arg("count", "4")));
const every = Number(arg("every", "8")) * 1000;
/** How often a round includes a walk to somebody else's farm. */
const VISIT_CHANCE = 0.2;
const MISCHIEF_CHANCE = 0.15;

const chain = await openChain("devnet");
const catalog = rules();
const hexOf = (b: Uint8Array) => Buffer.from(b).toString("hex");

interface Bot {
  name: string;
  signer: ccc.Signer;
  owner: string;
  /** Which of the crops it can afford it likes: 0 the best, 1 the next... */
  taste: number;
}

const bots: Bot[] = [];
for (let i = 0; i < count; i++) {
  const signer = account(chain.client, FIRST_ACCOUNT + i);
  bots.push({ name: NAMES[i], signer, owner: hexOf(await chain.ownerOf(signer)), taste: i % 3 });
}

const say = (bot: Bot, text: string) => console.log(`${new Date().toLocaleTimeString()}  ${bot.name}  ${text}`);
const grown = (v: FarmView) => v.plots.map((plot, index) => ({ plot, index })).filter((x) => x.plot.crop) as { plot: PlotView; index: number }[];

/** What the bot does on its own farm, built up step by step against the rules. */
function chores(mine: FarmCell, now: number, bot: Bot): Move[] {
  const moves: Move[] = [];
  const me = (action: Move["action"]) => moves.push({ farm: mine.id, action });
  /** The farm as it will be after the moves so far. */
  const ahead = (): FarmView => {
    if (moves.length === 0) return view(mine, now, chain.unit);
    const [state] = chain.outcome(chain.layout(mine, [], moves), now);
    return view({ idBytes: mine.idBytes, state }, now, chain.unit);
  };
  const sure = () => {
    // Keep only what the rules accept, so one bad guess does not sink the round.
    const { kept } = chain.sift(mine, [], moves, now);
    moves.length = 0;
    moves.push(...kept);
  };

  let v = ahead();
  for (const { plot, index } of grown(v)) {
    if (plot.withered) {
      me({ op: "shovel", plot: index });
      continue;
    }
    plot.problems.forEach((p, kind) => p && me({ op: "clear", plot: index, kind }));
    if (plot.ripe) me({ op: "harvest", plot: index });
  }
  sure();

  // A crop past its last season leaves a stump.
  v = ahead();
  for (const { plot, index } of grown(v)) if (plot.withered) me({ op: "shovel", plot: index });
  sure();

  v = ahead();
  v.fruits.forEach((n, i) => n > 0 && me({ op: "sell", crop: i + 1, count: n }));
  sure();

  v = ahead();
  const next = v.land < catalog.maxPlots ? catalog.expand[v.land - catalog.initPlots] : undefined;
  // Leave enough to sow the new plot.
  if (next && v.level >= next.level && v.gold >= next.price + 600) me({ op: "expand" });
  sure();
  v = ahead();
  if (v.level >= catalog.dogLevel && v.dogUntil <= now && v.gold >= catalog.dogFoodPrice * 6) me({ op: "feedDog" });
  sure();

  v = ahead();
  const empty = v.plots.map((p, i) => (p.crop ? -1 : i)).filter((i) => i >= 0);
  if (empty.length > 0) {
    const open = catalog.crops.filter((c) => c.level <= v.level).sort((a, b) => b.level - a.level || b.seedPrice - a.seedPrice);
    let gold = v.gold;
    const seeds = [...v.seeds];
    const buy = new Map<number, number>();
    const sow: Move["action"][] = [];
    for (const plot of empty) {
      const choice =
        open.filter((c) => seeds[c.id - 1] > 0 || c.seedPrice <= gold)[Math.min(bot.taste, open.length - 1)] ??
        open.find((c) => seeds[c.id - 1] > 0 || c.seedPrice <= gold);
      if (!choice) break;
      if (seeds[choice.id - 1] > 0) seeds[choice.id - 1]--;
      else {
        gold -= choice.seedPrice;
        buy.set(choice.id, (buy.get(choice.id) ?? 0) + 1);
      }
      sow.push({ op: "plant", plot, crop: choice.id });
    }
    buy.forEach((n, crop) => me({ op: "buy", crop, count: n }));
    sow.forEach(me);
    sure();
  }
  return moves;
}

/** A walk to one other farm: pick what is ripe, lend a hand, now and then leave a weed. */
function visit(mine: FarmCell, farms: FarmCell[], now: number): { moves: Move[]; host?: FarmCell } {
  const others = farms.filter((f) => f.id !== mine.id);
  if (others.length === 0) return { moves: [] };
  const host = others[Math.floor(Math.random() * others.length)];
  const there = (action: Move["action"]): Move => ({ farm: host.id, action });
  const moves: Move[] = [];
  // The rules know a thief by the owner lock hash in their farm's state.
  const v = view(host, now, chain.unit, mine.state.slice(1, 33));
  for (const { plot, index } of grown(v)) {
    if (plot.withered) continue;
    if (plot.steal > 0) moves.push(there({ op: "steal", plot: index }));
    plot.problems.forEach((p, kind) => p && moves.push(there({ op: "help", plot: index, kind })));
  }
  if (Math.random() < MISCHIEF_CHANCE) {
    const targets = grown(v).filter((x) => !x.plot.withered && !x.plot.ripe);
    const target = targets[Math.floor(Math.random() * targets.length)];
    if (target) moves.push(there({ op: "mischief", plot: target.index, kind: Math.random() < 0.5 ? KIND_WEED : KIND_PEST }));
  }
  return { moves, host };
}

async function round(bot: Bot) {
  const farms = await chain.listFarms(1000);
  const mine = farms.find((f) => hexOf(f.state.slice(1, 33)) === bot.owner);
  if (!mine) {
    await chain.createFarm(bot.signer, bot.name);
    return say(bot, "开垦了农场");
  }
  const { timestamp: now } = await chain.clock();
  let moves = chores(mine, now, bot);
  let host: FarmCell | undefined;
  if (Math.random() < VISIT_CHANCE) {
    const walk = visit(mine, farms, now);
    const all = chain.sift(mine, farms, [...moves, ...walk.moves], now).kept;
    if (all.length > moves.length) host = walk.host;
    moves = all;
  }
  if (moves.length === 0) return;
  await chain.play(bot.signer, mine, farms, moves);
  const tally = new Map<string, number>();
  for (const m of moves) tally.set(m.action.op, (tally.get(m.action.op) ?? 0) + 1);
  const words: Record<string, string> = {
    buy: "买种子", plant: "播种", harvest: "收获", shovel: "铲除", sell: "卖出", expand: "开垦", feedDog: "喂狗",
    clear: "打理", rename: "改名", help: "帮忙", mischief: "使坏", steal: "摘菜",
  };
  const text = [...tally].map(([op, n]) => `${words[op]}×${n}`).join(" ");
  say(bot, host ? `${text}（去了「${view(host, now, chain.unit).name}」）` : text);
}

console.log(`${bots.length} 位邻居上线：${bots.map((b) => b.name).join("、")}。游戏内 1 小时 = ${chain.unit} 秒。Ctrl-C 停止。`);
for (;;) {
  for (const bot of bots) {
    try {
      await round(bot);
    } catch (e) {
      // Somebody else touched the same farm first, or the node hiccupped: next round.
      if (!(e instanceof ChainError && e.stale)) say(bot, `这一轮没成：${e instanceof Error ? e.message : e}`);
    }
  }
  await sleep(every);
}
