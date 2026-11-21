import { ccc } from "@ckb-ccc/ccc";
import deployments from "./deployments.json";
import devnetScripts from "./devnet-scripts.json";

export type NetworkId = "devnet" | "testnet";

export interface CellRef {
  txHash: string;
  index: number;
}

export interface Deployment {
  version: 2;
  /** The immutable type-id validator: the type script of the code cell. */
  validator: CellRef;
  /** The upgradable farm-code cell: spending it with new code upgrades the game. */
  code: CellRef;
  /** Hash of the code cell's type script; farm cells reference the code by it, with hash type "type". */
  codeScriptHash: string;
  /** blake2b of the code cell's data (the running binary), to spot a stale record. */
  codeHash: string;
  /** Seconds per game hour: which world the app plays in. */
  unit: number;
}

export interface Network {
  id: NetworkId;
  name: string;
  rpc: string;
  /** How many blocks behind the tip the clock header is taken, against reorgs. */
  headerLag: number;
  explorer?: string;
  faucet?: string;
}

export const NETWORKS: Record<NetworkId, Network> = {
  devnet: { id: "devnet", name: "本地开发链", rpc: "http://127.0.0.1:8214", headerLag: 0 },
  testnet: {
    id: "testnet",
    name: "CKB 测试网",
    rpc: "https://testnet.ckb.dev/",
    headerLag: 6,
    explorer: "https://testnet.explorer.nervos.org",
    faucet: "https://faucet.nervos.org",
  },
};

export function deploymentOf(network: NetworkId): Deployment | undefined {
  return (deployments as unknown as Partial<Record<NetworkId, Deployment>>)[network];
}

export function createClient(network: NetworkId): ccc.Client {
  if (network === "devnet") {
    return new ccc.ClientPublicTestnet({
      url: NETWORKS.devnet.rpc,
      // Never fall back to a public node: this is another chain.
      fallbacks: [],
      scripts: devnetScripts as unknown as Record<ccc.KnownScript, ccc.ScriptInfoLike>,
    });
  }
  return new ccc.ClientPublicTestnet({ url: NETWORKS.testnet.rpc, fallbacks: [] });
}

/** The funded accounts of the dev chain's genesis block. Public test keys, worthless anywhere else. */
export const DEVNET_ACCOUNTS: { label: string; key: string }[] = [
  { label: "测试账户 A", key: "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6" },
  { label: "测试账户 B", key: "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1" },
  { label: "测试账户 C", key: "0x59ddda57ba06d6e9c5fa9040bdb98b4b098c2fce6520d39f51bc5e825364697a" },
  { label: "测试账户 D", key: "0xf4a1fc19468b51ba9d1f0f5441fa3f4d91e625b2af105e1e37cc54bf9b19c0a1" },
  { label: "测试账户 E", key: "0x0334ddff3b1e19af5c5fddda8dbcfb235416eaaba11cfca8acf63ad46e9f55b2" },
  { label: "测试账户 F", key: "0x6f358d92f408511707803d292efa148236a2e114d73a472be2a07e0ba49200c7" },
  { label: "测试账户 G", key: "0xbde2f19c98dc5ab4cc98f73c573757a9f1782dc44398022a23f77ca752ad8fbe" },
  { label: "测试账户 H", key: "0x7c1280118923ea96529909638dac9bd258251a222783f91dedbf82de15526fd2" },
];
