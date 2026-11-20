// The game as one store: the farms on chain, the basket of moves not sent yet,
// and what the farms will look like once they are.

import { ccc } from "@ckb-ccc/ccc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChainError, type Clock, type FarmCell, FarmChain, type Move } from "./chain/farm";
import { DEVNET_ACCOUNTS, NETWORKS, type NetworkId, createClient, deploymentOf } from "./chain/network";
import { type Catalog, type FarmView, loadRules, view } from "./chain/rules";
import wasmUrl from "./chain/farm_wasm.wasm?url";

export interface Toast {
  id: number;
  kind: "ok" | "bad" | "info";
  text: string;
}

export type Phase =
  | { at: "loading" }
  | { at: "broken"; why: string; hint?: string }
  | { at: "ready" };

const NETWORK: NetworkId = (import.meta.env.VITE_NETWORK as NetworkId) || "devnet";
const BURNER_KEY = "ckb-farm.burner-key";
const ACCOUNT_KEY = "ckb-farm.account";

function burnerKey(): string {
  let key = localStorage.getItem(BURNER_KEY);
  if (!key) {
    key = ccc.hexFrom(crypto.getRandomValues(new Uint8Array(32)));
    localStorage.setItem(BURNER_KEY, key);
  }
  return key;
}

export interface Account {
  label: string;
  key: string;
}

export function accounts(): Account[] {
  return NETWORK === "devnet" ? DEVNET_ACCOUNTS : [{ label: "浏览器钱包", key: burnerKey() }];
}

export function useGame() {
  const [phase, setPhase] = useState<Phase>({ at: "loading" });
  const [catalog, setCatalog] = useState<Catalog>();
  const [accountIndex, setAccountIndex] = useState(() => {
    const saved = Number(localStorage.getItem(ACCOUNT_KEY) ?? 0);
    return saved < accounts().length ? saved : 0;
  });
  const [farms, setFarms] = useState<FarmCell[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [clock, setClock] = useState<Clock>();
  /** Local time when `clock` was read, to keep countdowns moving between blocks. */
  const [clockAt, setClockAt] = useState(0);
  const [owner, setOwner] = useState<string>();
  const [address, setAddress] = useState<string>();
  const [balance, setBalance] = useState<bigint>();
  const [visiting, setVisiting] = useState<string>();
  const [basket, setBasket] = useState<Move[]>([]);
  const [busy, setBusy] = useState<string>();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const chain = useMemo(() => {
    const deployment = deploymentOf(NETWORK);
    return deployment ? new FarmChain(createClient(NETWORK), NETWORKS[NETWORK], deployment) : undefined;
  }, []);

  const signer = useMemo(
    () => (chain ? new ccc.SignerCkbPrivateKey(chain.client, accounts()[accountIndex].key) : undefined),
    [chain, accountIndex],
  );

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++toastId.current;
    setToasts((all) => [...all.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), kind === "bad" ? 6000 : 3500);
  }, []);

  const refresh = useCallback(async () => {
    if (!chain || !signer) return;
    const [list, now, bal] = await Promise.all([chain.listFarms(), chain.clock(), chain.balance(signer)]);
    setFarms(list);
    setClock(now);
    setClockAt(Date.now());
    setBalance(bal);
    setLoaded(true);
  }, [chain, signer]);

  // Start: rules, node, deployment.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setCatalog(await loadRules(fetch(wasmUrl)));
        if (!chain) {
          throw new ChainError(`农场合约还没有部署到${NETWORKS[NETWORK].name}`);
        }
        let deployed: boolean;
        try {
          deployed = await chain.isDeployed();
        } catch {
          throw new ChainError(`连不上 ${NETWORKS[NETWORK].rpc}`);
        }
        if (!deployed) throw new ChainError(`农场合约不在${NETWORKS[NETWORK].name}上`);
        if (!cancelled) setPhase({ at: "ready" });
      } catch (e) {
        if (cancelled) return;
        const why = e instanceof Error ? e.message : String(e);
        const hint =
          NETWORK === "devnet"
            ? "在项目目录运行 scripts/devnet.sh start，再到 web 目录运行 npm run deploy:devnet，然后刷新本页。"
            : undefined;
        setPhase({ at: "broken", why, hint });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chain]);

  // Who is playing.
  useEffect(() => {
    if (!chain || !signer) return;
    let cancelled = false;
    setOwner(undefined);
    setLoaded(false);
    setBasket([]);
    setVisiting(undefined);
    localStorage.setItem(ACCOUNT_KEY, String(accountIndex));
    (async () => {
      const obj = await signer.getRecommendedAddressObj();
      if (cancelled) return;
      setOwner(obj.script.hash().slice(2));
      setAddress(obj.toString());
    })();
    return () => {
      cancelled = true;
    };
  }, [chain, signer, accountIndex]);

  // Keep up with the chain.
  useEffect(() => {
    if (phase.at !== "ready" || busy) return;
    let stop = false;
    const tick = () => {
      if (!stop && !document.hidden) refresh().catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 4000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [phase.at, busy, refresh]);

  // A clock that moves between blocks. Never ahead of what the next block can prove by much.
  const [, setBeat] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setBeat((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const proven = clock?.timestamp ?? 0;
  const now = proven + Math.max(0, Math.floor((Date.now() - clockAt) / 1000));

  const mine = useMemo(() => {
    if (!owner || !catalog) return undefined;
    return farms.find((f) => ccc.hexFrom(f.state.slice(1, 33)).slice(2) === owner);
  }, [farms, owner, catalog]);

  const visited = visiting ? farms.find((f) => f.id === visiting) : undefined;

  // The basket, checked against the rules at the time the chain can prove.
  const sifted = useMemo(() => {
    if (!chain || !mine || basket.length === 0) return undefined;
    return chain.sift(mine, farms, basket, proven);
  }, [chain, mine, farms, basket, proven]);

  // Farms as they will be once the basket is sent.
  const preview = useMemo(() => {
    const states = new Map<string, FarmCell>();
    if (!chain || !mine || !sifted || sifted.kept.length === 0) return states;
    try {
      const layout = chain.layout(mine, farms, sifted.kept);
      const after = chain.outcome(layout, proven);
      layout.forEach(({ cell }, i) => states.set(cell.id, { ...cell, state: after[i] }));
    } catch {
      // Sifting already vouched for these; a race with a refresh, nothing to show.
    }
    return states;
  }, [chain, mine, farms, sifted, proven]);

  const look = useCallback(
    (farm: FarmCell | undefined, withBasket: boolean): FarmView | undefined => {
      if (!farm || !chain || !catalog) return undefined;
      // A previewed state has no block yet: what it plants shows as just sown.
      const ahead = withBasket ? preview.get(farm.id) : undefined;
      const cell = ahead ? { idBytes: ahead.idBytes, state: ahead.state } : farm;
      try {
        return view(cell, now, chain.unit, mine && mine.id !== farm.id ? mine.idBytes : undefined);
      } catch {
        return undefined;
      }
    },
    [chain, catalog, preview, now, mine],
  );

  const basketRef = useRef(basket);
  basketRef.current = basket;
  const add = useCallback(
    (...moves: Move[]) => {
      if (!chain || !mine) return;
      const next = [...basketRef.current];
      let refusal: string | undefined;
      for (const move of moves) {
        const { dropped } = chain.sift(mine, farms, [...next, move], proven);
        const refused = dropped.find((d) => d.move === move);
        if (refused) refusal ??= refused.reason;
        else next.push(move);
      }
      if (refusal) toast("bad", refusal);
      basketRef.current = next;
      setBasket(next);
    },
    [chain, mine, farms, proven, toast],
  );

  const remove = useCallback((index: number) => setBasket((b) => b.filter((_, i) => i !== index)), []);
  const clear = useCallback(() => setBasket([]), []);

  const send = useCallback(
    async (moves?: Move[]) => {
      if (!chain || !signer || !mine || busy) return;
      const { kept } = chain.sift(mine, farms, moves ?? basket, proven);
      if (kept.length === 0) return;
      setBusy("正在签名…");
      try {
        const { farms: after } = await chain.play(signer, mine, farms, kept, () => setBusy("等待区块打包…"));
        setFarms((all) => all.map((f) => after.find((a) => a.id === f.id) ?? f));
        if (!moves) setBasket([]);
        toast("ok", `已上链，${kept.length} 个操作生效`);
      } catch (e) {
        const error = e instanceof ChainError ? e : new ChainError(String(e));
        toast("bad", error.message);
      } finally {
        setBusy(undefined);
        refresh().catch(() => {});
      }
    },
    [chain, signer, mine, farms, basket, proven, busy, toast, refresh],
  );

  const create = useCallback(
    async (name: string) => {
      if (!chain || !signer || busy) return;
      setBusy("正在开垦农场…");
      try {
        const { farm } = await chain.createFarm(signer, name);
        setFarms((all) => [...all.filter((f) => f.id !== farm.id), farm]);
        toast("ok", "农场开垦好了");
      } catch (e) {
        toast("bad", e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(undefined);
        refresh().catch(() => {});
      }
    },
    [chain, signer, busy, toast, refresh],
  );

  const close = useCallback(async () => {
    if (!chain || !signer || !mine || busy) return;
    setBusy("正在收回农场…");
    try {
      await chain.closeFarm(signer, mine);
      setFarms((all) => all.filter((f) => f.id !== mine.id));
      setBasket([]);
      setVisiting(undefined);
      toast("ok", "农场已收回，CKB 回到了钱包");
    } catch (e) {
      toast("bad", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
      refresh().catch(() => {});
    }
  }, [chain, signer, mine, busy, toast, refresh]);

  return {
    network: NETWORKS[NETWORK],
    phase,
    catalog,
    chain,
    accounts: accounts(),
    accountIndex,
    setAccountIndex,
    address,
    balance,
    farms,
    loaded,
    mine,
    visited,
    visit: setVisiting,
    now,
    look,
    basket,
    sifted,
    add,
    remove,
    clear,
    send,
    create,
    close,
    busy,
    toasts,
    toast,
  };
}

export type Game = ReturnType<typeof useGame>;
