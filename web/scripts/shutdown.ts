// Retires the game on a network and recovers every shannon of CKB the two
// deployment cells hold — the farm code cell (~49.5k CKB) and the type-id
// validator (~28.4k CKB). Both are locked by the deployer, so both come home.
//
//   npm run shutdown                                  # devnet
//   npm run shutdown:testnet -- --keyfile keys/deployer.key
//
// Safety rails: refuses while farm cells remain (their owners must close them
// first — burning the code cell freezes any farm left open for ever), and
// requires --yes on the mainnet. After this, upgrades are impossible and the
// deployment record is removed; the site shows "not deployed".

import { ccc } from "@ckb-ccc/ccc";
import { arg, readDeployments, removeDeployment, signingKey } from "./env";
import { type NetworkId, createClient } from "../src/chain/network";

const network = (arg("network", "devnet") as NetworkId)!;
if (network === "mainnet" && !process.argv.includes("--yes")) {
  throw new Error(
    "shutting down on the MAINNET is irreversible for every player — close all farms first, then pass --yes.",
  );
}
const key = signingKey(network);

const deployment = readDeployments()[network];
if (deployment?.version !== 2) throw new Error(`no deployment record on ${network}`);

const client = createClient(network);
const signer = new ccc.SignerCkbPrivateKey(client, key);

const ZERO_LOCK = "0x" + "00".repeat(32);
const codeCell = await client.getCellLive(deployment.code, true);
if (!codeCell) throw new Error("the code cell is already gone");
const validatorCell = await client.getCellLive(deployment.validator, true);
if (!validatorCell) throw new Error("the validator cell is already gone");
// An older immortal validator (all-zero lock) cannot be spent by anyone —
// its capacity was burned at deploy time. Recover only what can be spent.
const validatorSpendable = ccc.hexFrom(validatorCell.cellOutput.lock.codeHash) !== ZERO_LOCK;
if (!validatorSpendable) {
  console.log("the validator uses an all-zero lock: immortal, its capacity was burned at deploy time.");
  console.log("recovering the code cell only.");
}

// No farm may be left behind: burning the code cell freezes any open farm's
// deposit for ever.
const argsHex = ccc.hexFrom(ccc.numLeToBytes(deployment.unit, 4));
const remaining: string[] = [];
for await (const cell of client.findCellsOnChain(
  {
    script: { codeHash: deployment.codeScriptHash, hashType: "type", args: argsHex },
    scriptType: "type",
    scriptSearchMode: "prefix",
    withData: false,
  },
  "asc",
  100,
)) {
  remaining.push(cell.outPoint.txHash);
}
if (remaining.length > 0 && !process.argv.includes("--force")) {
  console.error(`${remaining.length} farm cell(s) still live on ${network}:`);
  remaining.forEach((h) => console.error(`  ${h}`));
  console.error(`their owners must close them first (or pass --force to strand their deposits).`);
  process.exit(1);
}

console.log(`retiring ${network}: spending the code cell and the validator, refunding both.`);
const deployerLock = (await signer.getRecommendedAddressObj()).script;
const tx = ccc.Transaction.from({
  cellDeps: [{ outPoint: deployment.validator, depType: "code" }],
});
const cells: { ref: typeof deployment.code; cell: typeof codeCell }[] = [
  { ref: deployment.code, cell: codeCell },
];
if (validatorSpendable) cells.push({ ref: deployment.validator, cell: validatorCell });
for (const { ref, cell } of cells) {
  tx.inputs.push(
    ccc.CellInput.from({
      previousOutput: ref,
      cellOutput: {
        capacity: cell.cellOutput.capacity,
        lock: cell.cellOutput.lock,
        type: cell.cellOutput.type,
      },
      outputData: ccc.hexFrom(cell.outputData),
    }),
  );
}
const refund = ccc.CellOutput.from({ lock: deployerLock }, "0x");
const total = cells.reduce((sum, { cell }) => sum + BigInt(cell.cellOutput.capacity), 0n);
if (BigInt(refund.capacity) < total) refund.capacity = ccc.numFrom(total);
tx.addOutput(refund, "0x");
await tx.completeFeeBy(signer);
const txHash = await signer.sendTransaction(tx);
console.log(`shutdown tx ${txHash}`);
await client.waitTransaction(txHash, 0, 180_000, 1000);
removeDeployment(network);
console.log(`done: ${Number(total / 100_000_000n).toLocaleString()} CKB is back on your address.`);
console.log(`the deployment record has been removed — the site now shows "not deployed".`);
process.exit(0);
