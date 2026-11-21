// A short live check of the testnet deployment: creates a farm, sows, and
// closes it again. The long growth/steal/harvest flow is in e2e.ts (it takes
// two game hours, i.e. two real hours, on testnet).
//
//   FARM_NETWORK=testnet npm run e2e    # the full flow

import { ccc } from "@ckb-ccc/ccc";
import assert from "node:assert/strict";
import { view } from "../src/chain/rules";
import { openChain } from "./env";
import { keyFrom } from "./wallet";

const chain = await openChain("testnet");
const signer = new ccc.SignerCkbPrivateKey(chain.client, keyFrom("../.testnet-deployer.key"));
assert.ok(await chain.isDeployed(), "the farm script is not on testnet");

const address = await signer.getRecommendedAddress();
console.log(`${address}: ${Number((await signer.getBalance()) / 100_000_000n)} CKB`);

const { farm } = await chain.createFarm(signer, "链上测试田");
console.log(`farm created, cell ${farm.outPoint.txHash.slice(0, 12)}…`);
const { farms } = await chain.play(signer, farm, [], [
  { farm: farm.id, action: { op: "buy", crop: 1, count: 2 } },
  { farm: farm.id, action: { op: "plant", plot: 0, crop: 1 } },
  { farm: farm.id, action: { op: "plant", plot: 1, crop: 1 } },
]);
const v = view(farms[0], (await chain.clock()).timestamp, chain.unit);
assert.equal(v.plots[0].crop, 1);
console.log(`two radishes sown, gold ${v.gold}, ripe in ${Math.round(v.plots[0].duration / 60)} minutes`);
await chain.closeFarm(signer, farms[0]);
console.log("farm closed, CKB returned; the testnet script works");
process.exit(0);
