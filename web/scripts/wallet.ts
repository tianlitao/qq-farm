// A key file for scripts that need an account outside the dev chain (deploying
// to testnet, the end-to-end run there). Creates the key on first use.
//
//   npx tsx scripts/wallet.ts ../.testnet-deployer.key      address and balance
//
// The key file is in .gitignore. It only ever holds testnet coins.

import { ccc } from "@ckb-ccc/ccc";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "../src/chain/network";

export function keyFrom(path: string): string {
  const file = resolve(path);
  if (!existsSync(file)) {
    writeFileSync(file, `${ccc.hexFrom(crypto.getRandomValues(new Uint8Array(32)))}\n`, { mode: 0o600 });
  }
  return readFileSync(file, "utf8").trim();
}

if (process.argv[1]?.endsWith("wallet.ts")) {
  const path = process.argv[2];
  if (!path) throw new Error("usage: tsx scripts/wallet.ts <key file>");
  const signer = new ccc.SignerCkbPrivateKey(createClient("testnet"), keyFrom(path));
  console.log(await signer.getRecommendedAddress());
  console.log(`${Number((await signer.getBalance()) / 100_000_000n)} CKB`);
  process.exit(0);
}
