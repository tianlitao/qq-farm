// Puts the farm script on chain and records where.
//
//   npm run deploy:devnet
//   npx tsx scripts/deploy.ts --network testnet --privkey 0x... [--unit 3600]
//
// Two cells:
// * a type-id validator, locked by nobody (an all-zero hash no cell can have),
//   so it is immutable and forever;
// * the farm code cell, locked by the deployer. Its type script is the
//   validator, which pins one type id to it. Farm cells reference the code cell
//   by that type id (hash type "type"), so `npm run upgrade` can spend the code
//   cell and recreate it with new code — same type id, new rules — and every
//   farm starts running the new rules in place.

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
const validator = readFileSync(resolve(ROOT, "build/type-id"));
const codeDataHash = ccc.hashCkb(code);
const validatorDataHash = ccc.hashCkb(validator);

// No cell can hold code with an all-zero hash, so this lock never unlocks.
const nobody = { codeHash: `0x${"00".repeat(32)}`, hashType: "data" as const, args: "0x" };

const existing = readDeployments()[network];
if (existing?.version === 2) {
  const validatorCell = await client.getCellLive(existing.validator, true);
  if (validatorCell && ccc.hashCkb(validatorCell.outputData) === validatorDataHash) {
    const codeCell = await client.getCellLive(existing.code, true);
    if (codeCell && ccc.hashCkb(codeCell.outputData) === codeDataHash) {
      if (existing.unit !== unit && arg("unit")) {
        writeDeployment(network, { ...existing, unit });
        console.log(`game hour on ${network} set to ${unit}s`);
      } else {
        console.log(`already deployed on ${network}: code cell ${existing.code.txHash}:${existing.code.index}`);
      }
      process.exit(0);
    }
    if (codeCell) {
      console.error(`the code cell runs another build (${ccc.hashCkb(codeCell.outputData)}).`);
      console.error(`rebuild first, then run "npm run upgrade" to swap the code in place.`);
      process.exit(1);
    }
    console.error(`the recorded code cell is gone; deploying a fresh world.`);
  } else {
    console.error(`the recorded validator is gone or stale; deploying everything anew.`);
  }
}

async function deployValidator(): Promise<{ txHash: string; index: number }> {
  const tx = ccc.Transaction.from({ outputs: [{ lock: nobody }], outputsData: [ccc.hexFrom(validator)] });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer);
  const txHash = await signer.sendTransaction(tx);
  console.log(`deploying the type-id validator (${validator.length} bytes), tx ${txHash}`);
  await client.waitTransaction(txHash, 0, 180_000, 1000);
  return { txHash, index: 0 };
}

const reused =
  existing?.version === 2 &&
  (await client.getCellLive(existing.validator, true)) !== undefined &&
  ccc.hashCkb((await client.getCellLive(existing.validator, true))!.outputData) === validatorDataHash;
const validatorRef = reused ? existing!.validator : await deployValidator();

// The code cell: identity from its type script (pinned by the validator),
// rules from its data.
const deployerLock = (await signer.getRecommendedAddressObj()).script;
const tx = ccc.Transaction.from({ cellDeps: [{ outPoint: validatorRef, depType: "code" }] });
tx.addOutput(
  ccc.CellOutput.from(
    {
      lock: deployerLock,
      // Placeholder args; the type id is known once the inputs are complete.
      type: { codeHash: validatorDataHash, hashType: "data2", args: "0x" + "00".repeat(32) },
    },
    ccc.hexFrom(code),
  ),
  ccc.hexFrom(code),
);
await tx.completeInputsByCapacity(signer);
const codeTypeId = ccc.bytesFrom(ccc.hashTypeId(tx.inputs[0], 0));
tx.outputs[0].type = ccc.Script.from({
  codeHash: validatorDataHash,
  hashType: "data2",
  args: ccc.hexFrom(codeTypeId),
});
// What farm cells will reference: the hash of the code cell's whole type script.
const codeScriptHash = ccc.hexFrom(tx.outputs[0].type.hash());
const needed = ccc.fixedPointFrom(tx.outputs[0].occupiedSize + code.length);
if (tx.outputs[0].capacity < needed) tx.outputs[0].capacity = needed;
await tx.completeFeeBy(signer);
const codeTx = await signer.sendTransaction(tx);
console.log(`deploying the farm code cell (${code.length} bytes), tx ${codeTx}`);
await client.waitTransaction(codeTx, 0, 180_000, 1000);

writeDeployment(network, {
  version: 2,
  validator: validatorRef,
  code: { txHash: codeTx, index: 0 },
  codeScriptHash,
  codeHash: codeDataHash,
  unit,
});
console.log(`deployed on ${network}. code script hash ${codeScriptHash}, game hour ${unit}s`);
console.log(`later builds go live with: npm run upgrade`);
process.exit(0);
