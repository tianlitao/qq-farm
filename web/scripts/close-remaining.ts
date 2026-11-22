// Closes every farm of the current deployment owned by the given keys.
import { ccc } from "@ckb-ccc/ccc";
import { arg, readDeployments } from "./env";
import { keyFrom } from "./wallet";
import { NETWORKS, type NetworkId, createClient } from "../src/chain/network";
import { FarmChain } from "../src/chain/farm";
import { loadRules } from "../src/chain/rules";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const network = (arg("network", "testnet") as NetworkId)!;
const deployment = readDeployments()[network];
if (deployment?.version !== 2) throw new Error("no v2 deployment");
await loadRules(readFileSync(resolve(import.meta.dirname ?? ".", "../src/chain/farm_wasm.wasm")));
const client = createClient(network);
const chain = new FarmChain(client, NETWORKS[network], deployment);
const keys = ["../.testnet-deployer.key", "../.testnet-visitor.key"].map((p) => keyFrom(p));
const signers = keys.map((k) => new ccc.SignerCkbPrivateKey(client, k));
const owners = new Map<string, ccc.SignerCkbPrivateKey>();
for (const s of signers) owners.set(ccc.hexFrom((await s.getRecommendedAddressObj()).script.hash()), s);

const farms = await chain.listFarms();
console.log(`live farms: ${farms.length}`);
for (const farm of farms) {
  const ownerHex = ccc.hexFrom(farm.state.slice(1, 33));
  const signer = owners.get(ownerHex);
  if (!signer) {
    console.log(`skip foreign farm ${farm.id}`);
    continue;
  }
  console.log(`closing ${farm.id} ...`);
  await chain.closeFarm(signer, farm);
}
console.log("done");
