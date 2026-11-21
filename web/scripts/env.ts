// Shared by the node scripts: the rules (WASM), a client and the test accounts.

import { ccc } from "@ckb-ccc/ccc";
import { readFileSync, writeFileSync } from "node:fs";
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

export function account(client: ccc.Client, index: number): ccc.SignerCkbPrivateKey {
  return new ccc.SignerCkbPrivateKey(client, DEVNET_ACCOUNTS[index].key);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
