// Plays the game against a real node, start to finish, and checks every step
// against what the chain then holds. Needs the dev chain and a deployment:
//
//   scripts/devnet.sh start && npm run deploy:devnet && npm run e2e
//
// Uses test accounts G and H, with farms made for this run and given up at its end.

import { ccc } from "@ckb-ccc/ccc";
import assert from "node:assert/strict";
import type { FarmCell, Move } from "../src/chain/farm";
import { ChainError } from "../src/chain/farm";
import { type FarmView, type PlotView, KIND_WEED, rules, view } from "../src/chain/rules";
import { account, openChain, sleep } from "./env";
import { keyFrom } from "./wallet";

const network = (process.env.FARM_NETWORK as "devnet" | "testnet") || "devnet";
const chain = await openChain(network);
const ann = network === "devnet" ? account(chain.client, 6) : new ccc.SignerCkbPrivateKey(chain.client, keyFrom("../.testnet-deployer.key"));
// A second key file gives the testnet visitor its own farm.
const bob = network === "devnet" ? account(chain.client, 7) : new ccc.SignerCkbPrivateKey(chain.client, keyFrom("../.testnet-visitor.key"));
const RADISH = 1;

let step = 0;
const say = (text: string) => console.log(`${String(++step).padStart(2)}. ${text}`);

async function look(farm: FarmCell, viewer?: FarmCell): Promise<FarmView> {
  const clock = await chain.clock();
  // The rules know a thief by the owner lock hash in their farm's state.
  return view(farm, clock.timestamp, chain.unit, viewer?.state.slice(1, 33));
}

/** The farm as the node holds it now. */
async function onChain(farm: FarmCell): Promise<FarmCell> {
  for (let i = 0; i < 40; i++) {
    const found = (await chain.listFarms(10_000)).find((f) => f.id === farm.id);
    if (found && found.outPoint.txHash === farm.outPoint.txHash) return found;
    await sleep(500);
  }
  throw new Error("the indexer never showed the farm's new cell");
}

async function play(signer: ccc.Signer, mine: FarmCell, others: FarmCell[], moves: Move[]): Promise<FarmCell[]> {
  const { farms } = await chain.play(signer, mine, others, moves);
  // What we computed is what the chain stored.
  for (const farm of farms) {
    const stored = await onChain(farm);
    assert.deepEqual(stored.state, farm.state);
  }
  return farms;
}

async function refused(run: Promise<unknown>, expected: RegExp) {
  try {
    await run;
  } catch (e) {
    assert.ok(e instanceof ChainError, String(e));
    assert.match(e.message, expected);
    return;
  }
  assert.fail("this should have been refused");
}

async function waitUntil(seconds: number) {
  for (;;) {
    const clock = await chain.clock();
    if (clock.timestamp >= seconds) return;
    await sleep(1000);
  }
}

const plot = (v: FarmView, i: number) => v.plots[i] as PlotView;

if (network === "testnet") {
  for (const signer of [ann, bob]) {
    const address = await signer.getRecommendedAddress();
    const balance = Number((await signer.getBalance()) / 100_000_000n);
    if (balance < 1000) throw new Error(`${address} needs testnet CKB from https://faucet.nervos.org`);
    console.log(`${address}: ${balance} CKB`);
  }
}
assert.ok(await chain.isDeployed(), "the farm script is not where deployments.json says");
say(`farm script found, game hour ${chain.unit}s`);

let { farm: annFarm } = await chain.createFarm(ann, "安的菜园");
let { farm: bobFarm } = await chain.createFarm(bob, "Bob 的地");
let v = await look(await onChain(annFarm));
assert.equal(v.name, "安的菜园");
assert.equal(v.gold, rules().initGold);
assert.equal(v.land, rules().initPlots);
say(`two farms created: ${annFarm.id.slice(0, 10)}…, ${bobFarm.id.slice(0, 10)}…`);

// Only the owner farms a farm.
await refused(
  chain.play(bob, annFarm, [], [{ farm: annFarm.id, action: { op: "buy", crop: RADISH, count: 1 } }]),
  /主人的签名/,
);
say("a stranger cannot spend the owner's gold");

// Buy and plant in one transaction.
const mine = (action: Move["action"]): Move => ({ farm: annFarm.id, action });
[annFarm] = await play(ann, annFarm, [], [
  mine({ op: "buy", crop: RADISH, count: 3 }),
  mine({ op: "plant", plot: 0, crop: RADISH }),
  mine({ op: "plant", plot: 1, crop: RADISH }),
  mine({ op: "plant", plot: 2, crop: RADISH }),
]);
v = await look(annFarm);
assert.equal(v.gold, rules().initGold - 3 * rules().crops[0].seedPrice);
assert.equal(plot(v, 0).crop, RADISH);
assert.equal(plot(v, 0).plantedAt, annFarm.block.timestamp, "planted when the block says so");
assert.equal(plot(v, 0).ripe, false);
say(`3 radishes planted in block ${annFarm.block.number}, ripe in ${plot(v, 0).duration}s`);

// Too early for everybody.
await refused(chain.play(ann, annFarm, [], [mine({ op: "harvest", plot: 0 })]), /还没成熟/);
await refused(
  chain.play(bob, bobFarm, [annFarm], [{ farm: annFarm.id, action: { op: "steal", plot: 0 } }]),
  /还没成熟/,
);
say("nothing to harvest or steal before it is ripe");

// Bob drops a weed on Ann's first plot.
[bobFarm, annFarm] = await play(bob, bobFarm, [annFarm], [
  { farm: annFarm.id, action: { op: "mischief", plot: 0, kind: KIND_WEED } },
]);
v = await look(annFarm);
assert.equal(plot(v, 0).problems[KIND_WEED] & 2, 2);
assert.equal((await look(bobFarm)).mischiefToday, 1);
say("a neighbour left a weed, without the owner signing anything");

// Ann pulls it, and deals with whatever the weather brought so far.
const chores: Move[] = [];
v = await look(annFarm);
for (let i = 0; i < 3; i++) {
  plot(v, i).problems.forEach((p, kind) => {
    if (p) chores.push(mine({ op: "clear", plot: i, kind }));
  });
}
[annFarm] = await play(ann, annFarm, [], chores);
assert.equal(plot(await look(annFarm), 0).problems[KIND_WEED] & 2, 0);
say(`${chores.length} problem(s) cleared`);

await waitUntil(plot(v, 0).ripeAt);
v = await look(annFarm, bobFarm);
assert.equal(plot(v, 0).ripe, true);
say("the radishes are ripe");

// Bob takes what the rules let him.
const loot: Move[] = [];
for (let i = 0; i < 3; i++) {
  if (plot(v, i).steal > 0) loot.push({ farm: annFarm.id, action: { op: "steal", plot: i } });
}
assert.ok(loot.length > 0);
const expected = loot.length * rules().crops[0].steal;
[bobFarm, annFarm] = await play(bob, bobFarm, [annFarm], loot);
assert.equal((await look(bobFarm)).fruits[0], expected);
say(`the neighbour picked ${expected} radish(es) from ${loot.length} plot(s)`);
await refused(chain.play(bob, bobFarm, [annFarm], [loot[0]]), /已经摘过/);
say("but not twice from the same plot");

// Ann harvests the rest, sells it and clears the field.
v = await look(annFarm);
const due = [0, 1, 2].reduce((sum, i) => sum + plot(v, i).harvest, 0);
const gold = v.gold;
[annFarm] = await play(ann, annFarm, [], [
  mine({ op: "harvest", plot: 0 }),
  mine({ op: "harvest", plot: 1 }),
  mine({ op: "harvest", plot: 2 }),
  mine({ op: "sell", crop: RADISH, count: due }),
  mine({ op: "shovel", plot: 0 }),
  mine({ op: "shovel", plot: 1 }),
  mine({ op: "shovel", plot: 2 }),
]);
v = await look(annFarm);
assert.equal(v.gold, gold + due * rules().crops[0].sellPrice);
assert.equal(v.exp >= 3 * rules().crops[0].exp + 3 * rules().expShovel, true);
assert.equal(plot(v, 0).crop, 0);
say(`harvested and sold ${due} radishes: ${gold} -> ${v.gold} gold, ${v.exp} exp`);

// A forged result never gets in: claim more gold than the rules give.
{
  const moves = [mine({ op: "buy", crop: RADISH, count: 1 })];
  const honest = chain.outcome.bind(chain);
  chain.outcome = (farms, now) =>
    honest(farms, now).map((state) => {
      const forged = state.slice();
      forged[33] ^= 0x40; // gold
      return forged;
    });
  await refused(chain.play(ann, annFarm, [], moves), /不一致/);
  chain.outcome = honest;
}
say("a forged farm state is rejected by the script");

// Only the owner gets the CKB back, and the farm is gone afterwards.
await refused(chain.closeFarm(bob, annFarm), /主人的签名/);
const before = await chain.balance(ann);
await chain.closeFarm(ann, annFarm);
await chain.closeFarm(bob, bobFarm);
for (let i = 0; (await chain.listFarms(10_000)).some((f) => f.id === annFarm.id); i++) {
  assert.ok(i < 40, "the closed farm is still listed");
  await sleep(500);
}
const back = (await chain.balance(ann)) - before;
assert.ok(back > annFarm.capacity - 100_000n, "the farm's CKB went back to its owner");
say(`farms closed by their owners, ${Number(back / 100_000_000n)} CKB returned`);

console.log("\nall good: the node accepted every honest move and refused the rest");
process.exit(0);
