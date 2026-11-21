// Closes leftover farms locked to the OLD data2 code deployment and returns
// their CKB to their owners (the deployer / visitor key files).
import { ccc } from "@ckb-ccc/ccc";
import { createClient } from "../src/chain/network";
import { keyFrom } from "./wallet";
const client = createClient("testnet");
const oldCode = {
  outPoint: { txHash: "0x6ffe1f5bafa0858a9fa889e7d93c7993e61d983f927cf3826813a88b855d37d9", index: 0 },
  codeHash: "0xe80a23f18da7ca31fee294ef8784ff3077daa3546f9d36ec7ed57c5ef9566320",
};
const keys = ["../.testnet-deployer.key", "../.testnet-visitor.key"].map(
  (p) => new ccc.SignerCkbPrivateKey(client, keyFrom(p)),
);
const signerOf = new Map<string, ccc.SignerCkbPrivateKey>();
for (const s of keys) {
  signerOf.set(ccc.hexFrom((await s.getRecommendedAddressObj()).script.hash()), s);
}
for await (const cell of client.findCellsOnChain({
  script: { codeHash: oldCode.codeHash, hashType: "data2", args: ccc.hexFrom(ccc.numLeToBytes(3600, 4)) },
  scriptType: "type",
  scriptSearchMode: "prefix",
  withData: true,
}, "asc", 100)) {
  const data = typeof cell.outputData === "string" ? ccc.bytesFrom(cell.outputData) : cell.outputData;
  const owner = ccc.hexFrom(data.slice(1, 33));
  const signer = signerOf.get(owner);
  if (!signer) {
    console.log(`skip (not ours): ${cell.outPoint.txHash}`);
    continue;
  }
  const tx = ccc.Transaction.from({ cellDeps: [{ outPoint: oldCode.outPoint, depType: "code" }] });
  tx.inputs.push(
    ccc.CellInput.from({
      previousOutput: cell.outPoint,
      cellOutput: cell.cellOutput,
      outputData: ccc.hexFrom(data),
    }),
  );
  tx.setWitnessAt(0, "0x");
  await tx.completeInputsAddOne(signer); // proves ownership: an input with the owner's lock
  await tx.completeFeeBy(signer);
  const txHash = await signer.sendTransaction(tx);
  console.log(`closing ${cell.outPoint.txHash} -> ${txHash}`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const t = await client.getTransactionNoCache(txHash).catch(() => undefined);
    if (t?.status === "committed") break;
    if (t?.status === "rejected") throw new Error(t.reason ?? "rejected");
  }
}
console.log("cleanup done");
