// Dedicated deployer keys, generated deliberately and kept outside git.
//
//   npm run key:new -- deployer        create keys/deployer.key (refuses to overwrite)
//   npm run key:info -- deployer       address and balance of keys/deployer.key
//
// The key file holds testnet or mainnet coins depending on where you fund it.
// For the MAINNET the code cell's lock IS the upgrade authority over every
// farm — keep that key cold, never commit it, never reuse it casually.

import { ccc } from "@ckb-ccc/ccc";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type NetworkId } from "../src/chain/network";
import { arg, WEB } from "./env";

const name = arg("name") ?? process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--name" && all[i - 1] !== "--network" && a !== "new" && a !== "info")[0] ?? "deployer";
const keysDir = resolve(WEB, "keys");
mkdirSync(keysDir, { recursive: true });
const file = resolve(keysDir, `${name}.key`);

const network = (arg("network", "testnet") as NetworkId)!;
const client = createClient(network);

function load(): string {
  if (!existsSync(file)) throw new Error(`${file} does not exist yet: npm run key:new -- ${name}`);
  return readFileSync(file, "utf8").trim();
}

const action = process.argv.includes("new") ? "new" : "info";

if (action === "new") {
  if (existsSync(file) && !process.argv.includes("--force")) {
    throw new Error(`${file} already exists. Refusing to overwrite a key without --force.`);
  }
  const key = ccc.hexFrom(crypto.getRandomValues(new Uint8Array(32)));
  writeFileSync(file, `${key}\n`, { mode: 0o600 });
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  console.log(`generated ${file} (mode 0600, gitignored)`);
  console.log(`address (${network}):`, await signer.getRecommendedAddress());
  console.log(`fund it, then deploy with: npx tsx scripts/deploy.ts --network ${network} --privkey "$(cat ${file})"`);
  process.exit(0);
}

const signer = new ccc.SignerCkbPrivateKey(client, load());
console.log(`${file} on ${network}`);
console.log(`address:`, await signer.getRecommendedAddress());
console.log(`balance:`, Number((await signer.getBalance()) / 100_000_000n), "CKB");
process.exit(0);
