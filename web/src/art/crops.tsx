// Original artwork: every crop drawn as a flat, ink-outlined print.
// Each drawing fits a 48x48 box, with the fruit centred.

import type { ReactNode } from "react";

const INK = "#22331f";
const LEAF = "#5da13a";
const LEAF_DARK = "#3f7d2a";

const o = {
  stroke: INK,
  strokeWidth: 2.6,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};

/** A soft printed shadow, the same on every fruit and every plant. */
const cast = <ellipse cx="26" cy="43" rx="15" ry="3.2" fill="#22331f" opacity="0.14" />;

const leaf = (d: string, fill = LEAF) => <path d={d} fill={fill} {...o} />;

/** Crop ids are 1-based, as on chain. */
export const CROP_NAMES = [
  "",
  "白萝卜",
  "胡萝卜",
  "玉米",
  "土豆",
  "茄子",
  "番茄",
  "豌豆",
  "辣椒",
  "南瓜",
  "草莓",
  "西瓜",
  "葡萄",
  "香蕉",
  "菠萝",
  "水蜜桃",
  "樱桃",
];

const FRUIT: Record<number, ReactNode> = {
  // 1 radish
  1: (
    <>
      {leaf("M24 16c-6-2-9-8-7-12 5 1 8 5 7 12z")}
      {leaf("M24 16c6-2 9-8 7-12-5 1-8 5-7 12z", LEAF_DARK)}
      <path d="M14 22c0-5 5-7 10-7s10 2 10 7c0 9-6 15-10 22-4-7-10-13-10-22z" fill="#fbf7ee" {...o} />
      <path d="M19 24h5M26 30h4" fill="none" {...o} strokeWidth={1.6} />
    </>
  ),
  // 2 carrot
  2: (
    <>
      {leaf("M24 15c-5-3-6-8-4-12 4 2 6 6 4 12z")}
      {leaf("M24 15c5-3 6-8 4-12-4 2-6 6-4 12z", LEAF_DARK)}
      <path d="M16 19c2-4 14-4 16 0 1 8-5 18-8 26-3-8-9-18-8-26z" fill="#f08a2c" {...o} />
      <path d="M19 24h6M24 31h5M21 36h4" fill="none" {...o} strokeWidth={1.6} />
    </>
  ),
  // 3 corn
  3: (
    <>
      <path d="M24 4c6 5 8 14 8 22s-3 15-8 18c-5-3-8-10-8-18s2-17 8-22z" fill="#f6c445" {...o} />
      <path d="M20 12h8M18 18h12M17 24h14M18 30h12M24 6v36" fill="none" {...o} strokeWidth={1.4} />
      {leaf("M24 45c-9-1-14-9-13-20 6 3 10 9 13 20z")}
      {leaf("M24 45c9-1 14-9 13-20-6 3-10 9-13 20z", LEAF_DARK)}
    </>
  ),
  // 4 potato
  4: (
    <>
      <path d="M10 27c-1-9 7-15 16-14 9 1 14 7 12 15-2 9-11 12-18 11-6-1-9-5-10-12z" fill="#c9a06a" {...o} />
      <circle cx="19" cy="24" r="1.4" fill={INK} />
      <circle cx="29" cy="21" r="1.4" fill={INK} />
      <circle cx="27" cy="32" r="1.4" fill={INK} />
    </>
  ),
  // 5 eggplant
  5: (
    <>
      <path d="M27 14c8 3 12 12 9 21-3 8-12 11-19 7-6-4-6-12-1-18 4-5 6-8 11-10z" fill="#6a3d9a" {...o} />
      <path d="M21 13c4-4 10-3 12 1-3 3-7 4-10 3-2-1-3-2-2-4z" fill={LEAF} {...o} />
      <path d="M28 10l4-6" fill="none" {...o} strokeWidth={3} />
      <path d="M17 30c1-4 3-7 6-9" fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={2.4} strokeLinecap="round" />
    </>
  ),
  // 6 tomato
  6: (
    <>
      <path d="M24 13c9-3 17 3 17 13 0 9-7 16-17 16S7 35 7 26c0-10 8-16 17-13z" fill="#e2533f" {...o} />
      <path d="M24 14c-4-1-7-3-8-6 3 0 5 1 8 3 0-3 1-5 3-7 1 3 0 5-1 7 3-2 6-3 9-2-2 3-6 5-11 5z" fill={LEAF} {...o} />
      <path d="M13 24c1-3 3-5 6-6" fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={2.4} strokeLinecap="round" />
    </>
  ),
  // 7 pea
  7: (
    <>
      <path d="M5 21c9 14 26 17 38 3-2 15-28 19-38-3z" fill={LEAF_DARK} {...o} />
      <path d="M5 21c10 8 27 9 38 3-9 9-27 9-38-3z" fill="#a7d86b" {...o} />
      <circle cx="16" cy="27" r="4" fill="#c8ee8e" {...o} />
      <circle cx="25" cy="29" r="4" fill="#c8ee8e" {...o} />
      <circle cx="34" cy="27" r="4" fill="#c8ee8e" {...o} />
      <path d="M43 24c2-3 2-6 0-8" fill="none" {...o} />
    </>
  ),
  // 8 chili
  8: (
    <>
      <path d="M30 13c7 3 9 11 5 19-4 8-13 12-25 11 9-3 13-8 13-16 0-7 2-12 7-14z" fill="#d93a2b" {...o} />
      <path d="M26 15c1-4 6-5 10-2-2 3-6 4-10 2z" fill={LEAF} {...o} />
      <path d="M32 11c0-3 1-5 3-7" fill="none" {...o} strokeWidth={3} />
    </>
  ),
  // 9 pumpkin
  9: (
    <>
      <path d="M24 16c12-4 20 3 20 12s-8 15-20 15S4 37 4 28s8-16 20-12z" fill="#f08a2c" {...o} />
      <path d="M24 16c-6 4-6 23 0 27M24 16c6 4 6 23 0 27M13 18c-5 6-4 18 2 23M35 18c5 6 4 18-2 23" fill="none" {...o} strokeWidth={1.5} />
      <path d="M22 16c0-4 1-7 5-9l2 3c-2 1-3 3-3 6z" fill={LEAF_DARK} {...o} />
    </>
  ),
  // 10 strawberry
  10: (
    <>
      <path d="M24 14c10-4 17 2 15 11-2 9-9 16-15 20-6-4-13-11-15-20-2-9 5-15 15-11z" fill="#e63b4c" {...o} />
      <path d="M24 15c-5 1-9-1-11-4 4-1 7 0 11 2-1-3 0-6 2-8 2 2 2 5 1 8 3-2 7-3 10-2-2 3-7 5-13 4z" fill={LEAF} {...o} />
      <g fill="#ffe9a8">
        <circle cx="17" cy="23" r="1.3" />
        <circle cx="25" cy="22" r="1.3" />
        <circle cx="32" cy="25" r="1.3" />
        <circle cx="20" cy="30" r="1.3" />
        <circle cx="28" cy="31" r="1.3" />
        <circle cx="24" cy="37" r="1.3" />
      </g>
    </>
  ),
  // 11 watermelon
  11: (
    <>
      <ellipse cx="24" cy="27" rx="20" ry="16" fill="#4c9a3c" {...o} />
      <path d="M12 15c-3 7-3 17 0 24M20 11c-3 9-3 23 0 32M28 11c3 9 3 23 0 32M36 15c3 7 3 17 0 24" fill="none" stroke="#1f5a22" strokeWidth={2.6} strokeLinecap="round" />
      <path d="M24 11c0-3 2-5 5-6" fill="none" {...o} strokeWidth={2.6} />
    </>
  ),
  // 12 grape
  12: (
    <>
      <path d="M24 12V5" fill="none" {...o} strokeWidth={2.6} />
      {leaf("M25 11c4-5 10-5 13-1-3 4-8 5-13 1z")}
      <g fill="#7b4bb5" {...o}>
        <circle cx="16" cy="17" r="5.5" />
        <circle cx="27" cy="17" r="5.5" />
        <circle cx="21.5" cy="26" r="5.5" />
        <circle cx="32" cy="25" r="5.5" />
        <circle cx="11" cy="26" r="5.5" />
        <circle cx="16.5" cy="35" r="5.5" />
        <circle cx="27" cy="35" r="5.5" />
        <circle cx="22" cy="42" r="4.5" />
      </g>
    </>
  ),
  // 13 banana
  13: (
    <>
      <path d="M9 12c3 14 13 24 30 24-6 8-19 9-27 1-6-6-8-16-3-25z" fill="#f6c445" {...o} />
      <path d="M9 12c6 12 16 19 30 24" fill="none" {...o} strokeWidth={1.5} />
      <path d="M7 13l3-5 4 2-2 4z" fill="#8a5a33" {...o} />
      <path d="M38 34l4 1-1 4-3-1z" fill="#8a5a33" {...o} />
    </>
  ),
  // 14 pineapple
  14: (
    <>
      {leaf("M24 20c-7-4-8-10-6-15 4 3 6 8 6 15z", LEAF_DARK)}
      {leaf("M24 20c7-4 8-10 6-15-4 3-6 8-6 15z", LEAF_DARK)}
      {leaf("M24 20c-3-6-2-13 0-17 2 4 3 11 0 17z")}
      <rect x="12" y="18" width="24" height="27" rx="11" fill="#eeb02f" {...o} />
      <path d="M14 26l18 16M18 20l17 15M34 26L16 42M30 20L13 35" fill="none" {...o} strokeWidth={1.4} />
    </>
  ),
  // 15 peach
  15: (
    <>
      <path d="M24 12c10-5 19 2 18 12-1 10-9 17-18 20-9-3-17-10-18-20-1-10 8-17 18-12z" fill="#ffab9a" {...o} />
      <path d="M24 12c-4 8-4 22 0 32" fill="none" {...o} strokeWidth={1.6} />
      <path d="M34 16c5 4 6 12 2 19" fill="none" stroke="#f0607a" strokeOpacity={0.6} strokeWidth={5} strokeLinecap="round" />
      {leaf("M24 12c2-6 8-8 13-6-2 5-7 7-13 6z")}
    </>
  ),
  // 16 cherry
  16: (
    <>
      <path d="M15 30c0-11 5-19 15-24M33 30c1-9 0-17-3-24" fill="none" {...o} />
      {leaf("M30 6c4-4 10-3 12 1-4 3-9 3-12-1z")}
      <circle cx="15" cy="34" r="9" fill="#c9213d" {...o} />
      <circle cx="33" cy="35" r="9" fill="#c9213d" {...o} />
      <path d="M10 31c1-2 3-3 5-3M28 32c1-2 3-3 5-3" fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={2.2} strokeLinecap="round" />
    </>
  ),
};

export function CropIcon({ id, size = 40 }: { id: number; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={CROP_NAMES[id]}>
      <circle cx="24" cy="24" r="21" fill="#fffaf0" stroke={INK} strokeWidth="2" opacity="0.85" />
      {cast}
      {FRUIT[id]}
    </svg>
  );
}

export type Stage = "seed" | "sprout" | "leafy" | "ripe" | "withered";

/** Crops whose fruit grows in the ground: the ripe plant shows a crown, not a bush. */
const ROOTS = new Set([1, 2, 4]);

/** A plant standing on its bed. The drawing is 96 wide and 110 tall, rooted at the bottom centre. */
export function Plant({ crop, stage }: { crop: number; stage: Stage }) {
  return (
    <svg viewBox="0 0 96 110" preserveAspectRatio="xMidYMax meet" className={`plant plant-${stage}`} aria-hidden="true">
      {stage === "seed" && (
        <>
          <ellipse cx="48" cy="100" rx="17" ry="7" fill="#6e4424" {...o} />
          <path d="M48 96c0-5 2-8 6-9" fill="none" stroke={LEAF} strokeWidth={3} strokeLinecap="round" />
        </>
      )}
      {stage === "sprout" && (
        <>
          <path d="M28 104q20-8 40 0" fill="#6e4424" stroke={INK} strokeWidth={2.6} />
          <path d="M48 104V80" fill="none" {...o} stroke={LEAF_DARK} strokeWidth={4} />
          {leaf("M48 84c-13 1-21-6-22-17 12-1 20 6 22 17z")}
          {leaf("M48 84c13 1 21-6 22-17-12-1-20 6-22 17z", LEAF_DARK)}
          <path d="M44 100h8M38 100h4M54 100h4" stroke="#472a16" strokeWidth={2} strokeLinecap="round" />
        </>
      )}
      {stage === "leafy" && <Bush />}
      {stage === "ripe" &&
        (ROOTS.has(crop) ? (
          <>
            <g transform="translate(14 44) scale(1.42)">{FRUIT[crop]}</g>
            <path d="M22 104c8-5 44-5 52 0" fill="none" stroke="#6e4424" strokeWidth={7} strokeLinecap="round" />
          </>
        ) : (
          <>
            <Bush />
            <g transform="translate(9 30) scale(0.78)">{FRUIT[crop]}</g>
            <g transform="translate(50 22) scale(0.82)">{FRUIT[crop]}</g>
            <g transform="translate(29 52) scale(0.86)">{FRUIT[crop]}</g>
          </>
        ))}
      {stage === "withered" && (
        <>
          <path d="M48 104c0-14-3-22-12-30M47 86c5-6 11-9 19-9" fill="none" {...o} stroke="#7a5a36" strokeWidth={3.4} />
          <path d="M36 74c-8 0-13 5-13 12 7 1 12-4 13-12z" fill="#b08a55" {...o} />
          <path d="M66 77c8 1 12 6 11 13-7 0-11-5-11-13z" fill="#9c7745" {...o} />
        </>
      )}
    </svg>
  );
}

function Bush() {
  return (
    <>
      <path d="M28 104q20-9 40 0" fill="#6e4424" stroke={INK} strokeWidth={2.6} />
      <path d="M48 104V62" fill="none" {...o} stroke={LEAF_DARK} strokeWidth={5} />
      {leaf("M48 96c-19 4-33-4-36-20 16-4 30 5 36 20z")}
      {leaf("M48 96c19 4 33-4 36-20-16-4-30 5-36 20z", LEAF_DARK)}
      {leaf("M48 80c-17 0-28-12-28-27 15 0 26 11 28 27z", LEAF_DARK)}
      {leaf("M48 80c17 0 28-12 28-27-15 0-26 11-28 27z")}
      {leaf("M48 58c-9-9-10-22 0-33 10 11 9 24 0 33z", "#82c957")}
      <path d="M32 74c6-3 11-3 16 1M52 62c5-4 10-4 15-1" fill="none" stroke="#d8f0a7" strokeWidth={2.4} strokeLinecap="round" opacity="0.7" />
    </>
  );
}

export function Weed({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M16 30c-1-9-5-15-12-19M16 30c0-11 1-19 2-27M16 30c1-9 5-14 12-17M16 30c-3-6-8-8-13-8M16 30c3-5 7-7 12-7" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <path d="M16 30c-1-9-5-15-12-19M16 30c0-11 1-19 2-27M16 30c1-9 5-14 12-17M16 30c-3-6-8-8-13-8M16 30c3-5 7-7 12-7" fill="none" stroke="#b7d94a" strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}

export function Bug({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M9 9l-4-4M23 9l4-4M6 17H2M30 17h-4M8 24l-4 3M24 24l4 3" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      <ellipse cx="16" cy="18" rx="9" ry="10" fill="#e2533f" stroke={INK} strokeWidth={2.2} />
      <path d="M16 8v20" stroke={INK} strokeWidth={2} />
      <circle cx="16" cy="8" r="4.5" fill={INK} />
      <circle cx="12" cy="16" r="1.8" fill={INK} />
      <circle cx="20" cy="16" r="1.8" fill={INK} />
      <circle cx="12.5" cy="23" r="1.6" fill={INK} />
      <circle cx="19.5" cy="23" r="1.6" fill={INK} />
    </svg>
  );
}

export function Drop({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M16 3c6 8 10 13 10 18a10 10 0 01-20 0c0-5 4-10 10-18z" fill="#5db7e0" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M11 20c0 3 2 5 5 5" fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}

export function Coin({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#f6c445" stroke={INK} strokeWidth={2} />
      <circle cx="12" cy="12" r="6" fill="none" stroke="#c7922a" strokeWidth={1.6} />
    </svg>
  );
}

export function Dog({ size = 64, awake }: { size?: number; awake: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={awake ? "看门狗在站岗" : "看门狗饿了"}>
      <ellipse cx="32" cy="59" rx="19" ry="4" fill={INK} opacity="0.16" />
      <path d="M12 38C5 33 4 25 9 22c4 3 6 8 7 13z" fill="#8a5a33" {...o} />
      <path d="M13 22c-5-8-3-15 1-17 5 2 8 7 8 14z" fill="#8a5a33" {...o} />
      <path d="M51 22c5-8 3-15-1-17-5 2-8 7-8 14z" fill="#8a5a33" {...o} />
      <path d="M12 30c0-12 9-18 20-18s20 6 20 18c0 14-8 26-20 26S12 44 12 30z" fill="#e8c38d" {...o} />
      <path d="M12 26c4-7 10-10 15-10-4 5-5 9-5 13-5-1-8-2-10-3z" fill="#b9824c" opacity="0.7" />
      <path d="M22 40c0-6 4-10 10-10s10 4 10 10c0 7-4 12-10 12s-10-5-10-12z" fill="#fbf2df" {...o} />
      <path d="M14 41c4 4 9 6 12 6M50 41c-4 4-9 6-12 6" fill="none" stroke="#d14b3a" strokeWidth={4} strokeLinecap="round" />
      <circle cx="32" cy="48" r="3.2" fill="#f6c445" {...o} />
      <path d="M28 37h8l-4 5z" fill={INK} {...o} />
      <path d="M32 42v4c-3 3-6 2-7 0M32 46c3 3 6 2 7 0" fill="none" {...o} strokeWidth={1.8} />
      {awake ? (
        <>
          <circle cx="23" cy="28" r="2.8" fill={INK} />
          <circle cx="41" cy="28" r="2.8" fill={INK} />
          <path d="M18 17l-4-4M46 17l4-4" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M19 29c2 2 5 2 7 0M38 29c2 2 5 2 7 0" fill="none" {...o} strokeWidth={2} />
          <text x="45" y="12" fontSize="12" fill="#22331f">z</text>
          <text x="52" y="7" fontSize="9" fill="#22331f">z</text>
        </>
      )}
    </svg>
  );
}
