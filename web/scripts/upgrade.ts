// Swaps the farm rules in place: spends the code cell and recreates it with
// the freshly built binary — same type id, same lock, new rules. Every farm
// references the code cell by its type id, so they all run the new code from
// the next transaction on.
//
//   npm run build && npm run upgrade                 # devnet
//   npm run build && npx tsx scripts/upgrade.ts --network testnet --privkey 0x...
//
// The type-id validator (see scripts/deploy.ts) makes the swap honest: the
// recreated cell keeps its type id, and nobody but the deployer can spend the
// code cell at all. This key is therefore the root of trust of every farm's
// CKB — keep it safe.

import { ccc } from "@ckb-ccc/ccc";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEVNET_ACCOUNTS, type NetworkId, createClient } from "../src/chain/network";
import { ROOT, arg, readDeployments, writeDeployment } from "./env";

const network = (arg("network", "devnet") as NetworkId)!;
const key = arg("privkey", network === "devnet" ? DEVNET_ACCOUNTS[7].key : undefined);
if (!key) throw new Error("--privkey is required outside the dev chain");
if (network === "mainnet" && !process.argv.includes("--yes")) {
  throw new Error(
    "this upgrades the contract on the CKB MAINNET for every farm. Re-read AUDIT-*.md first, " +
      "then pass --yes together with the dedicated mainnet key.",
  );
}

const deployment = readDeployments()[network];
if (deployment?.version !== 2) {
  throw new Error(`no upgradable deployment on ${network}: run deploy first`);
}
const record = deployment;

const client = createClient(network);
const signer = new ccc.SignerCkbPrivateKey(client, key);
const code = readFileSync(resolve(ROOT, "build/farm"));
const nextDataHash = ccc.hashCkb(code);
const validatorDataHash = ccc.hashCkb(readFileSync(resolve(ROOT, "build/type-id")));

// If a previous upgrade committed but died before updating the record, the
// recorded outpoint is stale — recover the live code cell by its type script
// hash (only one cell can carry it, the validator enforces that).
async function findCodeCell(): Promise<{ cell: ccc.Cell; ref: { txHash: string; index: number } } | undefined> {
  for await (const cell of client.findCellsOnChain(
    { script: { codeHash: validatorDataHash, hashType: "data2", args: "0x" }, scriptType: "type", scriptSearchMode: "prefix", withData: false },
    "asc",
    100,
  )) {
    if (cell.cellOutput.type && ccc.hexFrom(cell.cellOutput.type.hash()) === record.codeScriptHash) {
      return { cell, ref: { txHash: cell.outPoint.txHash, index: Number(cell.outPoint.index) } };
    }
  }
  return undefined;
}

let codeRef = deployment.code;
let current = await client.getCellLive(deployment.code, true);
if (!current) {
  const found = await findCodeCell();
  if (!found) throw new Error(`the code cell is nowhere on chain; deploy anew`);
  console.log(`the record was stale; the live code cell is ${found.ref.txHash}:${found.ref.index}`);
  codeRef = found.ref;
  current = found.cell;
}
const currentDataHash = ccc.hashCkb(current.outputData);
if (currentDataHash === nextDataHash) {
  writeDeployment(network, { ...deployment, code: codeRef, codeHash: nextDataHash });
  console.log(`the code cell already runs this build (${nextDataHash}); record updated`);
  process.exit(0);
}
const liveScriptHash = current.cellOutput.type ? ccc.hexFrom(current.cellOutput.type.hash()) : undefined;
if (liveScriptHash !== record.codeScriptHash) {
  throw new Error(`the live code cell's type script does not match the record; deploy anew`);
}

console.log(`upgrade on ${network}:`);
console.log(`  from ${currentDataHash}`);
console.log(`  to   ${nextDataHash}`);

const tx = ccc.Transaction.from({
  cellDeps: [{ outPoint: deployment.validator, depType: "code" }],
});
tx.inputs.push(
  ccc.CellInput.from({
    previousOutput: codeRef,
    cellOutput: {
      capacity: current.cellOutput.capacity,
      lock: current.cellOutput.lock,
      type: current.cellOutput.type,
    },
    outputData: ccc.hexFrom(current.outputData),
  }),
);
const output = ccc.CellOutput.from(
  {
    capacity: current.cellOutput.capacity,
    lock: current.cellOutput.lock,
    type: current.cellOutput.type,
  },
  ccc.hexFrom(code),
);
const needed = ccc.fixedPointFrom(output.occupiedSize + code.length);
if (output.capacity < needed) output.capacity = needed;
tx.addOutput(output, ccc.hexFrom(code));
await tx.completeFeeBy(signer);
const txHash = await signer.sendTransaction(tx);
console.log(`upgrade tx ${txHash}`);
await client.waitTransaction(txHash, 0, 180_000, 1000);

writeDeployment(network, {
  ...deployment,
  code: { txHash, index: 0 },
  codeHash: nextDataHash,
});
console.log(`done. farms now run the new rules; refresh the app to pick up the record.`);
process.exit(0);
