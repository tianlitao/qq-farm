import { ccc } from "@ckb-ccc/ccc";
import { createClient } from "../src/chain/network";
const client = createClient("testnet");
const oldCodeHash = "0xe80a23f18da7ca31fee294ef8784ff3077daa3546f9d36ec7ed57c5ef9566320";
const unitArgs = ccc.numLeToBytes(3600, 4);
const oldCodeCell = { txHash: "0x6ffe1f5bafa0858a9fa889e7d93c7993e61d983f927cf3826813a88b855d37d9", index: 0 };
const code = await client.getCellLive(oldCodeCell, true);
console.log("old code cell live:", !!code);
let n = 0;
for await (const cell of client.findCellsOnChain({
  script: { codeHash: oldCodeHash, hashType: "data2", args: ccc.hexFrom(unitArgs) },
  scriptType: "type", scriptSearchMode: "prefix", withData: false,
}, "asc", 100)) {
  n++;
  console.log("old farm:", cell.outPoint.txHash, "capacity:", Number(cell.cellOutput.capacity / 100_000_000n), "CKB");
}
console.log("old farms on testnet:", n);
