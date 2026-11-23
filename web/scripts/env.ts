// Shared by the node scripts: the rules (WASM), a client and the test accounts.

import { ccc } from "@ckb-ccc/ccc";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FarmChain } from "../src/chain/farm";
import { DEVNET_ACCOUNTS, NETWORKS, type Deployment, type NetworkId, createClient } from "../src/chain/network";
import { loadRules } from "../src/chain/rules";

export const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = resolve(WEB, "..");
const DEPLOYMENTS = resolve(WEB, "src/chain/deployments.json");
const SERVED_DEPLOYMENTS = resolve(WEB, "public/deployments.json");

export function arg(name: string, fallback?: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
}

export function readDeployments(): Partial<Record<NetworkId, Deployment>> {
  return JSON.parse(readFileSync(DEPLOYMENTS, "utf8"));
}

export function removeDeployment(network: NetworkId) {
  const all = readDeployments();
  delete all[network];
  const text = `${JSON.stringify(all, null, 2)}\n`;
  writeFileSync(DEPLOYMENTS, text);
  writeFileSync(SERVED_DEPLOYMENTS, text);
}

export function writeDeployment(network: NetworkId, deployment: Deployment) {
  const all = readDeployments();
  all[network] = deployment;
  const text = `${JSON.stringify(all, null, 2)}\n`;
  writeFileSync(DEPLOYMENTS, text);
  // The web app fetches this copy at boot, so an upgrade goes live without
  // redeploying the site.
  writeFileSync(SERVED_DEPLOYMENTS, text);
}

export async function openChain(network: NetworkId = "devnet"): Promise<FarmChain> {
  await loadRules(readFileSync(resolve(WEB, "src/chain/farm_wasm.wasm")));
  const deployment = readDeployments()[network];
  if (!deployment) throw new Error(`the farm script is not deployed on ${network}: npm run deploy:devnet`);
  return new FarmChain(createClient(network), NETWORKS[network], deployment);
}

/**
 * The key a deploy, an upgrade or a shutdown signs with.
 *
 * It comes from a file (`--keyfile <path>`, or the FARM_KEYFILE variable) and
 * never from the command line: an argument stays in the shell history and
 * shows in the process list of every user of the machine, and this key is the
 * administrator of every farm's deposit. The dev chain falls back to one of
 * its public test keys.
 */
export function signingKey(network: NetworkId): string {
  if (process.argv.includes("--privkey")) {
    throw new Error(
      "--privkey is no longer accepted: a key on the command line leaks into the shell history and the process list. " +
        "Keep it in a file and pass --keyfile <path> (npm run key:new -- deployer creates one).",
    );
  }
  const given = process.argv.includes("--keyfile");
  const path = given ? arg("keyfile") : process.env.FARM_KEYFILE;
  if (given && (!path || path.startsWith("--"))) throw new Error("--keyfile needs the path of a key file");
  if (!path) {
    if (network === "devnet") return DEVNET_ACCOUNTS[7].key;
    throw new Error(`--keyfile <path> (or FARM_KEYFILE) is required on ${network}`);
  }
  const file = resolve(path);
  let mode: number;
  try {
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error("not a file");
    mode = stat.mode & 0o777;
  } catch {
    throw new Error(`cannot read the key file ${file}`);
  }
  if (process.platform !== "win32" && (mode & 0o077) !== 0) {
    throw new Error(`${file} can be read by other users (mode ${mode.toString(8)}): chmod 600 it first`);
  }
  const key = readFileSync(file, "utf8").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${file} does not hold a private key (0x and 64 hex digits)`);
  return key;
}

export function account(client: ccc.Client, index: number): ccc.SignerCkbPrivateKey {
  return new ccc.SignerCkbPrivateKey(client, DEVNET_ACCOUNTS[index].key);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
