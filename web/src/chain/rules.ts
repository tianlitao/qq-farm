// The game rules, straight from farm-core (compiled to WASM). The chain runs
// the same code, so what this module computes is what the script will accept.

import { t } from "../i18n";

export interface CropInfo {
  id: number;
  level: number;
  seedPrice: number;
  growHours: number;
  seasons: number;
  regrowHours: number;
  yield: number;
  sellPrice: number;
  exp: number;
  steal: number;
  stealCap: number;
}

export interface Catalog {
  crops: CropInfo[];
  expand: { level: number; price: number }[];
  initPlots: number;
  maxPlots: number;
  nameLen: number;
  headerLen: number;
  plotLen: number;
  initGold: number;
  hoursPerDay: number;
  dogLevel: number;
  dogFoodPrice: number;
  dogBlockPercent: number;
  problemPenaltyPercent: number;
  helpExpPerDay: number;
  mischiefPerDay: number;
  expClear: number;
  expHelp: number;
  expShovel: number;
}

/** 0 none, 1 natural, 2 left by a neighbour, 3 both. Order: weed, pest, dry. */
export type Problems = [number, number, number];

export interface PlotView {
  crop: number;
  season: number;
  pending: boolean;
  withered: boolean;
  plantedAt: number;
  ripeAt: number;
  duration: number;
  ripe: boolean;
  stolen: number;
  harvest: number;
  /** What the viewer would get by stealing here, or -code saying why not. */
  steal: number;
  problems: Problems;
}

export interface FarmView {
  owner: string;
  name: string;
  gold: number;
  exp: number;
  level: number;
  levelFrom: number;
  levelTo: number;
  land: number;
  dogUntil: number;
  helpToday: number;
  mischiefToday: number;
  seeds: number[];
  fruits: number[];
  plots: (PlotView | { crop: 0 })[];
}

export interface BlockRef {
  /** Seconds. */
  timestamp: number;
  hash: Uint8Array;
}

export interface FarmInput {
  /** Index of the farm cell among the transaction inputs. */
  index: number;
  id: Uint8Array;
  state: Uint8Array;
  block?: BlockRef;
  actions: Uint8Array;
}

export const KIND_WEED = 0;
export const KIND_PEST = 1;
export const KIND_DRY = 2;

/** Why the rules refuse something, see farm_core::Error. */
export const RULE_ERRORS: Record<number, string> = {
  10: "农场数据损坏",
  11: "无效的操作",
  12: "没有这种作物",
  13: "没有这块地",
  14: "等级不够",
  15: "金币不够",
  16: "种子不够",
  17: "仓库里没有这么多果实",
  18: "仓库放不下了",
  19: "这块地已经种了东西",
  20: "这块地是空的",
  21: "还没成熟",
  22: "已经枯萎，请先铲除",
  23: "这里没有需要处理的问题",
  24: "这里已经有了",
  25: "土地已经全部开垦",
  26: "需要链上时间，请稍后再试",
  27: "缺少播种所在的区块头",
  28: "访客农场不在这笔交易里",
  29: "这一季你已经摘过这块地了",
  30: "这块地不能再被摘了，给主人留点吧",
  31: "看门狗守着这块地",
  32: "今天使坏的次数用完了",
  33: "数值溢出",
  34: "游戏时速超出范围",
};

export class RuleError extends Error {
  constructor(public code: number) {
    super(t(`rule${code}`) === `rule${code}` ? `规则不允许（代码 ${code}）` : t(`rule${code}`));
  }
}

interface Exports {
  memory: WebAssembly.Memory;
  fw_buf(): number;
  fw_buf_len(): number;
  fw_new_farm(len: number): number;
  fw_transition(len: number): number;
  fw_view(len: number): number;
  fw_catalog(): number;
}

let wasm: Exports | undefined;
let catalog: Catalog | undefined;

export async function loadRules(source: BufferSource | Response | Promise<Response>): Promise<Catalog> {
  const module =
    source instanceof ArrayBuffer || ArrayBuffer.isView(source)
      ? await WebAssembly.instantiate(source as BufferSource, {})
      : await WebAssembly.instantiate(await (await source).arrayBuffer(), {});
  wasm = module.instance.exports as unknown as Exports;
  catalog = JSON.parse(text(answer(wasm.fw_catalog()))) as Catalog;
  return catalog;
}

export function rules(): Catalog {
  if (!catalog) throw new Error("rules are not loaded yet");
  return catalog;
}

function buffer(): Uint8Array {
  return new Uint8Array(wasm!.memory.buffer, wasm!.fw_buf(), wasm!.fw_buf_len());
}

function answer(len: number): Uint8Array {
  if (len < 0) throw new RuleError(-len);
  return buffer().slice(0, len);
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

class Writer {
  private parts: number[] = [];
  u8(v: number) {
    this.parts.push(v & 0xff);
    return this;
  }
  u16(v: number) {
    this.parts.push(v & 0xff, (v >> 8) & 0xff);
    return this;
  }
  u32(v: number) {
    this.parts.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
    return this;
  }
  bytes(b: Uint8Array) {
    for (const v of b) this.parts.push(v);
    return this;
  }
  block(block?: BlockRef) {
    this.u8(block ? 1 : 0).u32(block?.timestamp ?? 0);
    return this.bytes(block?.hash ?? new Uint8Array(32));
  }
  send(): number {
    buffer().set(this.parts);
    return this.parts.length;
  }
}

/** The state every farm starts in. */
export function newFarm(owner: Uint8Array, name: string): Uint8Array {
  const len = new Writer().bytes(owner).bytes(encodeName(name)).send();
  return answer(wasm!.fw_new_farm(len));
}

export interface Outcome {
  state: Uint8Array;
  needsOwner: boolean;
}

/** The state farm number `me` must have after a transaction with these farms. */
export function transition(farms: FarmInput[], me: number, now: number, unit: number): Outcome {
  const w = new Writer().u32(now).u32(unit).u8(me).u8(farms.length);
  for (const farm of farms) {
    w.u8(farm.index).bytes(farm.id).block(farm.block);
    w.u16(farm.state.length).bytes(farm.state);
    w.u16(farm.actions.length).bytes(farm.actions);
  }
  const out = answer(wasm!.fw_transition(w.send()));
  return { needsOwner: out[0] !== 0, state: out.slice(1) };
}

/** A farm as the rules see it at `now`. `viewer` is the would-be thief's owner lock hash. */
export function view(
  farm: { idBytes: Uint8Array; state: Uint8Array; block?: BlockRef },
  now: number,
  unit: number,
  viewer?: Uint8Array,
): FarmView {
  const w = new Writer().u32(now).u32(unit).u8(viewer ? 1 : 0).bytes(viewer ?? new Uint8Array(32));
  w.bytes(farm.idBytes).block(farm.block).bytes(farm.state);
  const raw = JSON.parse(text(answer(wasm!.fw_view(w.send())))) as FarmView;
  return { ...raw, name: decodeName(raw.name) };
}

export function encodeName(name: string): Uint8Array {
  const out = new Uint8Array(rules().nameLen);
  // Cut on a character boundary.
  let used = 0;
  for (const ch of name) {
    const bytes = new TextEncoder().encode(ch);
    if (used + bytes.length > out.length) break;
    out.set(bytes, used);
    used += bytes.length;
  }
  return out;
}

function decodeName(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  // Names are whatever bytes their owners chose: show the printable part.
  return new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, end))
    .replace(/[\u0000-\u001f\u007f�]/g, "")
    .trim();
}

// Action list encoding, see farm_core's OP_* constants.
export type Action =
  | { op: "buy"; crop: number; count: number }
  | { op: "plant"; plot: number; crop: number }
  | { op: "harvest"; plot: number }
  | { op: "shovel"; plot: number }
  | { op: "sell"; crop: number; count: number }
  | { op: "expand" }
  | { op: "feedDog" }
  | { op: "clear"; plot: number; kind: number }
  | { op: "rename"; name: string }
  | { op: "help"; plot: number; kind: number }
  | { op: "mischief"; plot: number; kind: number }
  | { op: "steal"; plot: number };

export function isVisit(action: Action): boolean {
  return action.op === "help" || action.op === "mischief" || action.op === "steal";
}

/** `actor` is the input index of the visiting farm, for visitor actions. */
export function encodeActions(actions: Action[], actor = 0): Uint8Array {
  const out: number[] = [];
  for (const a of actions) {
    switch (a.op) {
      case "buy":
        out.push(1, a.crop, a.count & 0xff, a.count >> 8);
        break;
      case "plant":
        out.push(2, a.plot, a.crop);
        break;
      case "harvest":
        out.push(3, a.plot);
        break;
      case "shovel":
        out.push(4, a.plot);
        break;
      case "sell":
        out.push(5, a.crop, a.count & 0xff, a.count >> 8);
        break;
      case "expand":
        out.push(6);
        break;
      case "feedDog":
        out.push(7);
        break;
      case "clear":
        out.push(8, a.plot, a.kind);
        break;
      case "rename":
        out.push(9, ...encodeName(a.name));
        break;
      case "help":
        out.push(16, actor, a.plot, a.kind);
        break;
      case "mischief":
        out.push(17, actor, a.plot, a.kind);
        break;
      case "steal":
        out.push(18, actor, a.plot);
        break;
    }
  }
  return new Uint8Array(out);
}
