// Puts the farm script on chain and records where.
//
//   npm run deploy:devnet
//   npx tsx scripts/deploy.ts --network testnet --privkey 0x... [--unit 3600] [--keep-key]
//
// The code cell is locked with a lock nobody can open (unless --keep-key), and
// farm scripts refer to the code by its hash: nobody, the deployer included,
// can change the rules or switch the game off.

import { ccc } from "@ckb-ccc/ccc";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEVNET_ACCOUNTS, type NetworkId, createClient } from "../src/chain/network";
import { ROOT, arg, readDeployments, writeDeployment } from "./env";

const network = (arg("network", "devnet") as NetworkId)!;
const unit = Number(arg("unit", network === "devnet" ? "30" : "3600"));
const key = arg("privkey", network === "devnet" ? DEVNET_ACCOUNTS[7].key : undefined);
if (!key) throw new Error("--privkey is required outside the dev chain");
if (!(unit >= 1 && unit <= 3600)) throw new Error("--unit must be 1..3600 seconds");

const client = createClient(network);
const signer = new ccc.SignerCkbPrivateKey(client, key);
const code = readFileSync(resolve(ROOT, "build/farm"));
const codeHash = ccc.hashCkb(code);

const existing = readDeployments()[network];
if (existing && existing.codeHash === codeHash) {
  const cell = await client.getCellLive({ txHash: existing.txHash, index: existing.index }, true);
  if (cell && ccc.hashCkb(cell.outputData) === codeHash) {
    if (existing.unit !== unit && arg("unit")) writeDeployment(network, { ...existing, unit });
    console.log(`already deployed on ${network}: ${existing.txHash}:${existing.index}`);
    process.exit(0);
  }
}

// No cell can hold code with an all-zero hash, so this lock never unlocks.
const nobody = { codeHash: `0x${"00".repeat(32)}`, hashType: "data" as const, args: "0x" };
const lock = process.argv.includes("--keep-key") ? (await signer.getRecommendedAddressObj()).script : nobody;

const tx = ccc.Transaction.from({ outputs: [{ lock }], outputsData: [ccc.hexFrom(code)] });
await tx.completeInputsByCapacity(signer);
await tx.completeFeeBy(signer);
const txHash = await signer.sendTransaction(tx);
console.log(`deploying ${code.length} bytes on ${network}, tx ${txHash}`);
await client.waitTransaction(txHash, 0, 180_000, 1000);

writeDeployment(network, { txHash, index: 0, codeHash, unit });
console.log(`deployed. code hash ${codeHash}, game hour ${unit}s`);
process.exit(0);
