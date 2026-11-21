// Farms on chain: finding them, and building the transactions that change them.
//
// Nothing here is trusted by the chain. Every transaction is checked by the
// farm script, which runs the same rules as `rules.ts`.

import { ccc } from "@ckb-ccc/ccc";
import type { Deployment, Network } from "./network";
import {
  type Action,
  type BlockRef,
  type FarmInput,
  RULE_ERRORS,
  RuleError,
  encodeActions,
  isVisit,
  newFarm,
  transition,
} from "./rules";

export interface FarmCell {
  outPoint: { txHash: string; index: number };
  capacity: bigint;
  /** Hex of the farm's type id. */
  id: string;
  idBytes: Uint8Array;
  state: Uint8Array;
  /** The block that committed the cell. */
  block: BlockRef & { hashHex: string; number: bigint };
}

export interface Clock {
  /** Seconds: the newest block time a transaction can prove right now. */
  timestamp: number;
  hash: string;
  number: bigint;
}

/** Something done to a farm: by its owner if `farm` is the player's own, by the player as a visitor otherwise. */
export interface Move {
  /** Farm id (hex). */
  farm: string;
  action: Action;
}

/** Why the farm script rejects a transaction, see contracts/farm/src/main.rs. */
const SCRIPT_ERRORS: Record<number, string> = {
  ...RULE_ERRORS,
  40: "合约读取交易失败",
  41: "农场脚本参数不对",
  42: "这不是一个农场格子",
  43: "农场编号不合法",
  44: "农场格子必须使用农场锁",
  45: "农场里的 CKB 不能取出",
  46: "需要农场主人的签名",
  47: "链上算出的结果和提交的不一致",
  48: "新农场必须从初始状态开始",
  49: "操作数据格式不对",
  50: "交易输入太多",
  51: "不能无故动用别人的农场",
  52: "关闭农场时不能附带操作",
  53: "区块时间超出范围",
};

export class ChainError extends Error {
  constructor(
    message: string,
    /** True if the farm changed under us: refreshing and trying again may work. */
    public stale = false,
  ) {
    super(message);
  }
}

function explain(error: unknown): ChainError {
  if (error instanceof ChainError) return error;
  if (error instanceof RuleError) return new ChainError(error.message);
  const text = error instanceof Error ? error.message : String(error);
  const code = /error code (-?\d+)/.exec(text);
  if (code) {
    const n = Number(code[1]);
    return new ChainError(SCRIPT_ERRORS[n] ?? `合约拒绝了这笔交易（代码 ${n}）`, n === 47);
  }
  if (/Unknown\(|Dead\(|OutPoint|Resolve|Conflict|RBF/i.test(text)) {
    return new ChainError("农场刚刚被别人动过，已刷新", true);
  }
  if (/Insufficient|not enough capacity|capacity/i.test(text)) {
    return new ChainError("钱包里的 CKB 不够支付这笔交易");
  }
  if (/fetch|network|ECONNREFUSED|Failed to/i.test(text)) {
    return new ChainError("连不上 CKB 节点");
  }
  return new ChainError(text.length > 160 ? `${text.slice(0, 160)}…` : text);
}

const hex = (bytes: Uint8Array) => ccc.hexFrom(bytes);
const bytes = (h: string) => ccc.bytesFrom(h);
const outPointKey = (o: { txHash: string; index: number | bigint }) => `${o.txHash}:${Number(o.index)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FarmChain {
  private blocks = new Map<string, FarmCell["block"]>();
  /** Farm cells our own committed transactions spent, in case the indexer still lists them. */
  private spent = new Set<string>();
  private fresh = new Map<string, FarmCell>();

  constructor(
    public readonly client: ccc.Client,
    public readonly network: Network,
    public readonly deployment: Deployment,
  ) {}

  get unit(): number {
    return this.deployment.unit;
  }

  private unitArgs(): Uint8Array {
    return ccc.numLeToBytes(this.unit, 4);
  }

  farmLock(): ccc.Script {
    return ccc.Script.from({ codeHash: this.deployment.codeHash, hashType: "data2", args: "0x" });
  }

  farmType(id: Uint8Array): ccc.Script {
    return ccc.Script.from({
      codeHash: this.deployment.codeHash,
      hashType: "data2",
      args: hex(ccc.bytesConcat(this.unitArgs(), id)),
    });
  }

  /** Is the farm script where the deployment record says it is? */
  async isDeployed(): Promise<boolean> {
    const { txHash, index } = this.deployment;
    const cell = await this.client.getCellLive({ txHash, index }, true);
    return !!cell && ccc.hashCkb(cell.outputData) === this.deployment.codeHash;
  }

  /** The header transactions use to prove what time it is. */
  async clock(): Promise<Clock> {
    const tip = await this.client.getTip();
    const lag = BigInt(this.network.headerLag);
    const header = await this.client.getHeaderByNumber(tip > lag ? tip - lag : 0n);
    if (!header) throw new ChainError("连不上 CKB 节点");
    return { timestamp: Number(header.timestamp / 1000n), hash: header.hash, number: header.number };
  }

  private async blockOf(txHash: string): Promise<FarmCell["block"] | undefined> {
    const known = this.blocks.get(txHash);
    if (known) return known;
    const tx = await this.client.getTransactionNoCache(txHash);
    if (!tx?.blockHash || tx.status !== "committed") return undefined;
    const header = await this.client.getHeaderByHash(tx.blockHash);
    if (!header) return undefined;
    const block = {
      timestamp: Number(header.timestamp / 1000n),
      hash: bytes(header.hash),
      hashHex: header.hash,
      number: header.number,
    };
    this.blocks.set(txHash, block);
    return block;
  }

  /** Every farm of this world. */
  async listFarms(limit = 300): Promise<FarmCell[]> {
    const key = {
      script: { codeHash: this.deployment.codeHash, hashType: "data2" as const, args: hex(this.unitArgs()) },
      scriptType: "type" as const,
      scriptSearchMode: "prefix" as const,
      withData: true,
    };
    const farms: FarmCell[] = [];
    const listed = new Set<string>();
    for await (const cell of this.client.findCellsOnChain(key, "asc", 100)) {
      const args = bytes(cell.cellOutput.type!.args);
      if (args.length !== 36) continue;
      const idBytes = args.slice(4);
      const id = hex(idBytes);
      listed.add(id);
      const outPoint = { txHash: cell.outPoint.txHash, index: Number(cell.outPoint.index) };
      if (this.spent.has(outPointKey(outPoint))) {
        // The indexer is a block behind us.
        const fresh = this.fresh.get(id);
        if (fresh) farms.push(fresh);
        continue;
      }
      this.fresh.delete(id);
      const block = await this.blockOf(outPoint.txHash);
      if (!block) continue;
      farms.push({
        outPoint,
        capacity: cell.cellOutput.capacity,
        id,
        idBytes,
        state: bytes(cell.outputData),
        block,
      });
      if (farms.length >= limit) break;
    }
    // A farm we just created may not be indexed yet.
    for (const [id, cell] of this.fresh) {
      if (!listed.has(id) && farms.length < limit) farms.push(cell);
    }
    return farms;
  }

  /** The id an account owns farms under: the hash of its lock. */
  async ownerOf(signer: ccc.Signer): Promise<Uint8Array> {
    const { script } = await signer.getRecommendedAddressObj();
    return bytes(script.hash());
  }

  private farmOutput(id: Uint8Array, state: Uint8Array, atLeast = 0n) {
    const output = ccc.CellOutput.from({ lock: this.farmLock(), type: this.farmType(id) }, hex(state));
    if (output.capacity < atLeast) output.capacity = atLeast;
    return output;
  }

  private codeDep(): ccc.CellDepLike {
    return { outPoint: { txHash: this.deployment.txHash, index: this.deployment.index }, depType: "code" };
  }

  /** Waits for a transaction to be committed and returns its block. */
  private async committed(txHash: string, timeoutMs = 120_000): Promise<FarmCell["block"]> {
    const started = Date.now();
    let seen = false;
    let missing = 0;
    while (Date.now() - started < timeoutMs) {
      await sleep(700);
      const tx = await this.client.getTransactionNoCache(txHash).catch(() => undefined);
      const status = tx?.status;
      if (status === "committed") {
        const block = await this.blockOf(txHash);
        if (block) return block;
      } else if (status === "rejected") {
        throw explain(new Error(tx?.reason ?? "Conflict"));
      } else if (status === "pending" || status === "proposed") {
        seen = true;
        missing = 0;
      } else if (seen && ++missing > 4) {
        // It was in the pool and is gone: something else spent its inputs.
        throw new ChainError("农场刚刚被别人动过，已刷新", true);
      }
    }
    throw new ChainError("交易迟迟没有上链，请稍后刷新查看");
  }

  /** Creates a farm for the signer. */
  async createFarm(signer: ccc.Signer, name: string): Promise<{ txHash: string; farm: FarmCell }> {
    try {
      const state = newFarm(await this.ownerOf(signer), name);
      const tx = ccc.Transaction.from({ cellDeps: [this.codeDep()] });
      tx.addOutput(this.farmOutput(new Uint8Array(32), state), hex(state));
      await tx.completeInputsByCapacity(signer);
      const idBytes = bytes(ccc.hashTypeId(tx.inputs[0], 0));
      tx.outputs[0].type = this.farmType(idBytes);
      await tx.completeFeeBy(signer);
      const txHash = await signer.sendTransaction(tx);
      const block = await this.committed(txHash);
      const farm: FarmCell = {
        outPoint: { txHash, index: 0 },
        capacity: tx.outputs[0].capacity,
        id: hex(idBytes),
        idBytes,
        state,
        block,
      };
      this.fresh.set(farm.id, farm);
      return { txHash, farm };
    } catch (e) {
      throw explain(e);
    }
  }

  /**
   * Lays the moves out as one transaction: the player's farm is input 0, the
   * farms it visits follow. Returns each farm's action list.
   */
  layout(mine: FarmCell, others: FarmCell[], moves: Move[]): { cell: FarmCell; actions: Uint8Array }[] {
    const order = [mine];
    const lists = new Map<string, Action[]>([[mine.id, []]]);
    for (const move of moves) {
      if ((move.farm === mine.id) === isVisit(move.action)) throw new RuleError(11);
      if (!lists.has(move.farm)) {
        const cell = others.find((f) => f.id === move.farm);
        if (!cell) throw new ChainError("找不到这个农场", true);
        order.push(cell);
        lists.set(move.farm, []);
      }
      lists.get(move.farm)!.push(move.action);
    }
    return order.map((cell) => ({ cell, actions: encodeActions(lists.get(cell.id)!, 0) }));
  }

  /** The states the farms have after these action lists, as the script will compute them. */
  outcome(farms: { cell: FarmCell; actions: Uint8Array }[], now: number): Uint8Array[] {
    const inputs: FarmInput[] = farms.map(({ cell, actions }, index) => ({
      index,
      id: cell.idBytes,
      state: cell.state,
      block: cell.block,
      actions,
    }));
    const proven = Math.max(now, ...farms.map((f) => f.cell.block.timestamp));
    return farms.map((_, me) => transition(inputs, me, proven, this.unit).state);
  }

  /** The moves the rules allow, in order; the rest with the reason they are refused. */
  sift(
    mine: FarmCell,
    others: FarmCell[],
    moves: Move[],
    now: number,
  ): { kept: Move[]; dropped: { move: Move; reason: string }[] } {
    const kept: Move[] = [];
    const dropped: { move: Move; reason: string }[] = [];
    for (const move of moves) {
      try {
        this.outcome(this.layout(mine, others, [...kept, move]), now);
        kept.push(move);
      } catch (e) {
        dropped.push({ move, reason: explain(e).message });
      }
    }
    return { kept, dropped };
  }

  /** Sends the moves as one transaction and waits for it. Returns the farms as they are afterwards. */
  async play(
    signer: ccc.Signer,
    mine: FarmCell,
    others: FarmCell[],
    moves: Move[],
    onSent?: (txHash: string) => void,
  ): Promise<{ txHash: string; farms: FarmCell[] }> {
    try {
      const farms = this.layout(mine, others, moves);
      const clock = await this.clock();
      const states = this.outcome(farms, clock.timestamp);

      const headerDeps = [...new Set([...farms.map((f) => f.cell.block.hashHex), clock.hash])];
      const tx = ccc.Transaction.from({ cellDeps: [this.codeDep()], headerDeps });
      farms.forEach(({ cell, actions }, i) => {
        tx.inputs.push(
          ccc.CellInput.from({
            previousOutput: cell.outPoint,
            cellOutput: { capacity: cell.capacity, lock: this.farmLock(), type: this.farmType(cell.idBytes) },
            outputData: hex(cell.state),
          }),
        );
        tx.addOutput(this.farmOutput(cell.idBytes, states[i], cell.capacity), hex(states[i]));
        if (actions.length > 0) tx.setWitnessArgsAt(i, ccc.WitnessArgs.from({ inputType: hex(actions) }));
        else tx.setWitnessAt(i, "0x");
      });
      // The fee comes from the player's wallet; that input is also what proves
      // to the farm script that the owner is behind this.
      await tx.completeFeeBy(signer);
      const txHash = await signer.sendTransaction(tx);
      onSent?.(txHash);
      const block = await this.committed(txHash);

      const after = farms.map(({ cell }, i): FarmCell => {
        this.spent.add(outPointKey(cell.outPoint));
        const next = {
          outPoint: { txHash, index: i },
          capacity: tx.outputs[i].capacity,
          id: cell.id,
          idBytes: cell.idBytes,
          state: states[i],
          block,
        };
        this.fresh.set(cell.id, next);
        return next;
      });
      return { txHash, farms: after };
    } catch (e) {
      throw explain(e);
    }
  }

  /**
   * Gives the farm up: the cell is destroyed and the CKB it held goes back to
   * its owner. Only the owner can; the script wants to see one of their cells.
   */
  async closeFarm(signer: ccc.Signer, farm: FarmCell): Promise<string> {
    try {
      const tx = ccc.Transaction.from({ cellDeps: [this.codeDep()] });
      tx.inputs.push(
        ccc.CellInput.from({
          previousOutput: farm.outPoint,
          cellOutput: { capacity: farm.capacity, lock: this.farmLock(), type: this.farmType(farm.idBytes) },
          outputData: hex(farm.state),
        }),
      );
      tx.setWitnessAt(0, "0x");
      await tx.completeInputsAddOne(signer);
      await tx.completeFeeBy(signer);
      const txHash = await signer.sendTransaction(tx);
      await this.committed(txHash);
      this.spent.add(outPointKey(farm.outPoint));
      this.fresh.delete(farm.id);
      return txHash;
    } catch (e) {
      throw explain(e);
    }
  }

  /** Spendable CKB of the signer, in shannons. */
  async balance(signer: ccc.Signer): Promise<bigint> {
    return signer.getBalance();
  }

  /** Sends CKB (dev chain faucet, topping up a browser wallet). */
  async transfer(from: ccc.Signer, to: ccc.ScriptLike, ckb: number): Promise<string> {
    try {
      const tx = ccc.Transaction.from({ outputs: [{ lock: to, capacity: ccc.fixedPointFrom(ckb) }] });
      await tx.completeInputsByCapacity(from);
      await tx.completeFeeBy(from);
      const txHash = await from.sendTransaction(tx);
      await this.committed(txHash);
      return txHash;
    } catch (e) {
      throw explain(e);
    }
  }
}
