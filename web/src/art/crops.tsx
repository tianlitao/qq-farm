// Original storybook artwork: 16 hand-crafted crops with cel-shaded depth,
// botanical plant families (root, stalk, vine, trellis, bush, tropical, orchard),
// expressive pests, coin, and guard dog.

import type { ReactNode } from "react";

const INK = "#35261a";
const LEAF = "#5fa33c";
const LEAF_LITE = "#89cb56";
const LEAF_DARK = "#3d7827";
const STEM = "#487c2b";

const o = {
  stroke: INK,
  strokeWidth: 2.3,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};

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

/** Detailed 48x48 illustrated fruits with shading, highlights & crisp ink lines. */
const FRUIT: Record<number, ReactNode> = {
  // 1 radish
  1: (
    <>
      {leaf("M24 16c-6-2-10-8-8-13 5 1 9 5 8 13z", LEAF_LITE)}
      {leaf("M24 16c6-2 10-8 8-13-5 1-9 5-8 13z", LEAF_DARK)}
      {leaf("M24 16c-2-5-1-10 0-14 2 4 2 9 0 14z", LEAF)}
      <path d="M13 22c0-6 5-8 11-8s11 2 11 8c0 9-6 16-11 23-5-7-11-14-11-23z" fill="#fbf5e6" {...o} />
      {/* Pale sage shoulder blush */}
      <path d="M14.5 21c1-4 5-5.5 9.5-5.5s8.5 1.5 9.5 5.5c-4 1.8-15 1.8-19 0z" fill="#cde3a4" opacity="0.7" />
      {/* Warm shadow right side */}
      <path d="M29 17c4 2 4.5 8 1.5 14-2 4-4.5 7-6.5 10.5 3.5-5.5 8.5-12.5 8.5-19.5 0-2.5-1.5-4-3.5-5z" fill="#dfd2b8" />
      <path d="M13 22c0-6 5-8 11-8s11 2 11 8c0 9-6 16-11 23-5-7-11-14-11-23z" fill="none" {...o} />
      <path d="M17.5 23.5c0 4 1.5 7 3 9.5" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" opacity={0.85} />
      <path d="M21 26h5M25 32h4" fill="none" stroke="#b5a489" strokeWidth={1.5} strokeLinecap="round" />
    </>
  ),
  // 2 carrot
  2: (
    <>
      {leaf("M24 15c-6-3-8-9-5-13 5 2 7 7 5 13z", LEAF_LITE)}
      {leaf("M24 15c6-3 8-9 5-13-5 2-7 7-5 13z", LEAF_DARK)}
      {leaf("M24 15c-1.5-5-1-10 0-13 1.5 3 1.5 8 0 13z", LEAF)}
      <path d="M15 19c2-4.5 16-4.5 18 0 1.2 8.5-5.5 18.5-9 26.5-3.5-8-10.2-18-9-26.5z" fill="#f28426" {...o} />
      <path d="M26 16.5c4 1 6 3 5.5 6.5-.8 6-4.5 13-7.5 19.5 3-7 6-14 5.5-20.5-.2-2.5-1.5-4.5-3.5-5.5z" fill="#d16014" opacity="0.7" />
      <path d="M15 19c2-4.5 16-4.5 18 0 1.2 8.5-5.5 18.5-9 26.5-3.5-8-10.2-18-9-26.5z" fill="none" {...o} />
      <path d="M18.5 21c0 5 1.5 10 3 14" fill="none" stroke="#ffc170" strokeWidth={2.2} strokeLinecap="round" opacity={0.8} />
      <path d="M19 24h5.5M23.5 31h5M21 36.5h4" fill="none" stroke="#a6460c" strokeWidth={1.5} strokeLinecap="round" />
    </>
  ),
  // 3 corn
  3: (
    <>
      <path d="M24 4.5c6.5 4.5 8.5 13.5 8.5 21.5s-3 14.5-8.5 17.5c-5.5-3-8.5-9.5-8.5-17.5s2-17 8.5-21.5z" fill="#f7c83e" {...o} />
      <path d="M26 7c3.5 4.5 5 11.5 5 18.5s-2 12-5.5 15c3-3 4.5-8.5 4.5-15S28.5 11.5 26 7z" fill="#e09c19" opacity="0.7" />
      <path d="M19.5 13h9M17.5 19h13M17 25h14M18 31h12M24 6.5v35" fill="none" stroke="#b87611" strokeWidth={1.4} />
      <path d="M20 11c-1 4-1.5 9-1.5 14" fill="none" stroke="#fff3b0" strokeWidth={2} strokeLinecap="round" opacity={0.85} />
      <path d="M24 4.5c6.5 4.5 8.5 13.5 8.5 21.5s-3 14.5-8.5 17.5c-5.5-3-8.5-9.5-8.5-17.5s2-17 8.5-21.5z" fill="none" {...o} />
      {leaf("M24 45c-9.5-1-14.5-9.5-13.5-20.5 6.5 3 10.5 9.5 13.5 20.5z", LEAF_LITE)}
      {leaf("M24 45c9.5-1 14.5-9.5 13.5-20.5-6.5 3-10.5 9.5-13.5 20.5z", LEAF_DARK)}
    </>
  ),
  // 4 potato
  4: (
    <>
      <path d="M9.5 27c-1-9.5 7.5-15.5 16.5-14.5 9 1 14.5 7.5 12.5 15.5-2 9-11.5 12.5-18.5 11.5-6.5-1-9.5-5.5-10.5-12.5z" fill="#d4a76a" {...o} />
      <path d="M35 21c2 4 1.5 9-2.5 13-4 4-10.5 5-16 3.5 5.5 2.5 14.5 2 19-3 3-3.5 3-9.5-.5-13.5z" fill="#ad7c43" opacity="0.65" />
      <path d="M14 23c1-4 4.5-7 9-7.5" fill="none" stroke="#f0d3a1" strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
      <path d="M9.5 27c-1-9.5 7.5-15.5 16.5-14.5 9 1 14.5 7.5 12.5 15.5-2 9-11.5 12.5-18.5 11.5-6.5-1-9.5-5.5-10.5-12.5z" fill="none" {...o} />
      <ellipse cx="19" cy="24" rx="1.6" ry="1.1" fill="#7c5328" />
      <ellipse cx="29.5" cy="21" rx="1.5" ry="1.1" fill="#7c5328" />
      <ellipse cx="26.5" cy="32" rx="1.6" ry="1.1" fill="#7c5328" />
      <circle cx="15.5" cy="31.5" r="1" fill="#7c5328" />
    </>
  ),
  // 5 eggplant
  5: (
    <>
      <path d="M27 14c8.5 3 12.5 12.5 9.5 21.5-3 8.5-12.5 11.5-19.5 7.5-6.5-4-6.5-12.5-1-18.5 4-5 6-8 11-10.5z" fill="#7140a3" {...o} />
      <path d="M31 18c4 5 4 12 0 17-3.5 4.5-9.5 6-14 4 5.5 3 13 2 16.5-4 3.5-6 2-13.5-2.5-17z" fill="#4c2378" opacity="0.7" />
      <path d="M27 14c8.5 3 12.5 12.5 9.5 21.5-3 8.5-12.5 11.5-19.5 7.5-6.5-4-6.5-12.5-1-18.5 4-5 6-8 11-10.5z" fill="none" {...o} />
      <path d="M16.5 31c1-4.5 3.5-8 7-10.5" fill="none" stroke="#d5b8f5" strokeWidth={2.6} strokeLinecap="round" opacity={0.8} />
      <path d="M20.5 13.5c4-4.5 10.5-3.5 13 1-3 3.5-7.5 4.5-11 3-2-1-3-2-2-4z" fill={LEAF} {...o} />
      <path d="M28 10l4-6" fill="none" stroke={STEM} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M28 10l4-6" fill="none" {...o} strokeWidth={2} />
    </>
  ),
  // 6 tomato
  6: (
    <>
      <path d="M24 13.5c9.5-3 17.5 3 17.5 13 0 9.5-7.5 16.5-17.5 16.5S6.5 36 6.5 26.5c0-10 8-16 17.5-13z" fill="#e64e3b" {...o} />
      <path d="M35 18c4 4 4.5 11 0 16.5-3.5 4.5-10 6.5-15.5 5 6 2.5 14 1 18-4.5 3.5-5 3-12.5-2.5-17z" fill="#bd2f20" opacity="0.65" />
      <path d="M24 13.5c9.5-3 17.5 3 17.5 13 0 9.5-7.5 16.5-17.5 16.5S6.5 36 6.5 26.5c0-10 8-16 17.5-13z" fill="none" {...o} />
      <path d="M12.5 25c1-3.5 3.5-6 7-7" fill="none" stroke="#ffbfb3" strokeWidth={2.8} strokeLinecap="round" opacity={0.85} />
      <circle cx="11.5" cy="30" r="1.4" fill="#ffbfb3" opacity={0.8} />
      <path d="M24 14.5c-4.5-1-7.5-3-8.5-6 3.5 0 5.5 1 8.5 3 0-3 1-5 3-7 1 3 0 5-1 7 3-2 6-3 9.5-2-2.5 3-6.5 5-11.5 5z" fill={LEAF} {...o} />
    </>
  ),
  // 7 pea
  7: (
    <>
      <path d="M5 21c9.5 14.5 26.5 17.5 38.5 3-2 15.5-28.5 19.5-38.5-3z" fill={LEAF_DARK} {...o} />
      <path d="M5 21c10 8.5 27.5 9.5 38.5 3-9.5 9.5-27.5 9.5-38.5-3z" fill="#9fd662" {...o} />
      {[16, 25, 34].map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy={i === 1 ? 29 : 27} r="4.3" fill="#c2eb81" {...o} />
          <circle cx={cx - 1.2} cy={(i === 1 ? 29 : 27) - 1.2} r="1.3" fill="#f1ffd1" />
        </g>
      ))}
      <path d="M43 24c2.5-3 2.5-6.5 0-8.5" fill="none" {...o} />
    </>
  ),
  // 8 chili
  8: (
    <>
      <path d="M30 13c7.5 3 9.5 11.5 5.5 19.5-4 8-13.5 12-26 11 9.5-3 13.5-8 13.5-16.5 0-7 2-12 7-14z" fill="#e03728" {...o} />
      <path d="M34 19c1.5 4.5.5 9.5-2.5 13.5-3 4-8 7-14 8.5 7 0 13.5-3.5 16.5-9.5 2.5-4.5 2.5-9 0-12.5z" fill="#a81d13" opacity="0.6" />
      <path d="M30 13c7.5 3 9.5 11.5 5.5 19.5-4 8-13.5 12-26 11 9.5-3 13.5-8 13.5-16.5 0-7 2-12 7-14z" fill="none" {...o} />
      <path d="M27.5 21c-.5 4.5-2 8.5-5 11.5" fill="none" stroke="#ffad9e" strokeWidth={2.2} strokeLinecap="round" opacity={0.85} />
      <path d="M26 15.5c1-4.5 6-5.5 10.5-2-2 3-6.5 4-10.5 2z" fill={LEAF} {...o} />
      <path d="M32 11c0-3 1-5 3.5-7" fill="none" stroke={STEM} strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  // 9 pumpkin
  9: (
    <>
      <path d="M24 16c12.5-4 20.5 3 20.5 12.5s-8 15-20.5 15S3.5 38 3.5 28.5 11.5 12 24 16z" fill="#f28927" {...o} />
      <path d="M36 17c6 3 7.5 11 4.5 17-3 5.5-9 8-16.5 8.5 8.5 1 17-3 19.5-11 2-6-1-12-7.5-14.5z" fill="#cc5d12" opacity="0.55" />
      <path d="M24 16c-6 4-6 23.5 0 27.5M24 16c6 4 6 23.5 0 27.5M12.5 18c-5 6.5-4 18.5 2 23.5M35.5 18c5 6.5 4 18.5-2 23.5" fill="none" stroke="#a6480c" strokeWidth={1.6} />
      <path d="M12 22c-2 3.5-2 8 0 11.5M21 20c-1 3.5-1 7.5 0 11" fill="none" stroke="#ffcb7a" strokeWidth={2.2} strokeLinecap="round" opacity={0.75} />
      <path d="M24 16c12.5-4 20.5 3 20.5 12.5s-8 15-20.5 15S3.5 38 3.5 28.5 11.5 12 24 16z" fill="none" {...o} />
      <path d="M22 16.5c0-4.5 1.5-7.5 5.5-9.5l2 3.2c-2.2 1-3.2 3-3.2 6.3z" fill={LEAF_DARK} {...o} />
    </>
  ),
  // 10 strawberry
  10: (
    <>
      <path d="M24 14.5c10.5-4 17.5 2 15.5 11-2 9.5-9.5 16.5-15.5 20.5-6-4-13.5-11-15.5-20.5-2-9 5-15 15.5-11z" fill="#eb3b4e" {...o} />
      <path d="M35 19c2 5-1 13-6 19-2 2.5-4 4-5 5.5 4.5-3 10.5-9 13-16.5 1-3.5.5-6.5-2-8z" fill="#b81e30" opacity="0.55" />
      <path d="M13 21c-.5 3.5 1 7 3 9.5" fill="none" stroke="#ff9ea8" strokeWidth={2.2} strokeLinecap="round" opacity={0.75} />
      <path d="M24 14.5c10.5-4 17.5 2 15.5 11-2 9.5-9.5 16.5-15.5 20.5-6-4-13.5-11-15.5-20.5-2-9 5-15 15.5-11z" fill="none" {...o} />
      <g fill="#ffe89e">
        <ellipse cx="17" cy="23.5" rx="1.2" ry="1.6" />
        <ellipse cx="25" cy="22.5" rx="1.2" ry="1.6" />
        <ellipse cx="32" cy="25.5" rx="1.2" ry="1.6" />
        <ellipse cx="20" cy="31" rx="1.2" ry="1.6" />
        <ellipse cx="28" cy="31.5" rx="1.2" ry="1.6" />
        <ellipse cx="24" cy="38" rx="1.2" ry="1.6" />
      </g>
      <path d="M24 15.5c-5 1-9.5-1-11.5-4 4-1 7.5 0 11.5 2-1-3 0-6 2-8 2 2 2 5 1 8 3-2 7-3 10.5-2-2.5 3-7 5-13.5 4z" fill={LEAF} {...o} />
    </>
  ),
  // 11 watermelon
  11: (
    <>
      <ellipse cx="24" cy="27.5" rx="20" ry="16" fill="#4f9e3e" {...o} />
      <path d="M36 16c6 4 7 13 2 19-5 6-14 8-22 6 8 3.5 18 2 23.5-4.5 5-6 4-15.5-3.5-20.5z" fill="#316d26" opacity="0.55" />
      <path d="M12 15.5c-3 7-3 17 0 24M20 11.5c-3 9-3 23 0 32M28 11.5c3 9 3 23 0 32M36 15.5c3 7 3 17 0 24" fill="none" stroke="#1e5420" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M13 19.5c3-3 7-4.5 11-4.5" fill="none" stroke="#a6e38a" strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />
      <ellipse cx="24" cy="27.5" rx="20" ry="16" fill="none" {...o} />
      <path d="M24 11.5c0-3 2-5.5 5.5-6.5" fill="none" stroke={STEM} strokeWidth={2.8} strokeLinecap="round" />
    </>
  ),
  // 12 grape
  12: (
    <>
      <path d="M24 12V5" fill="none" stroke={STEM} strokeWidth={2.8} strokeLinecap="round" />
      {leaf("M25 11c4.5-5 10.5-5 13.5-1-3 4-8.5 5-13.5 1z", LEAF_LITE)}
      {[
        [16, 17.5, 5.5],
        [27, 17.5, 5.5],
        [11.5, 26, 5.5],
        [21.5, 26, 5.6],
        [32, 25.5, 5.5],
        [16.5, 35, 5.5],
        [27, 35, 5.5],
        [22, 41.5, 4.7],
      ].map(([cx, cy, r], idx) => (
        <g key={idx}>
          <circle cx={cx} cy={cy} r={r} fill={idx % 2 === 0 ? "#8252bd" : "#6b3da6"} {...o} />
          <circle cx={cx - 1.8} cy={cy - 1.8} r={1.6} fill="#dfc5ff" opacity="0.8" />
        </g>
      ))}
    </>
  ),
  // 13 banana
  13: (
    <>
      <path d="M9.5 12c3 14.5 13 24.5 30 24.5-6 8-19 9-27.5 1-6-6-8-16.5-2.5-25.5z" fill="#f7ca44" {...o} />
      <path d="M11 22c3 8 11 15 24 16-6.5 4.5-15.5 4-21.5-1.5-4.5-4.5-5-9.5-2.5-14.5z" fill="#de9c1b" opacity="0.55" />
      <path d="M9.5 12c6.5 12 16 19.5 30 24.5" fill="none" stroke="#c48212" strokeWidth={1.6} />
      <path d="M12.5 19c2.5 5.5 7 10 13 13" fill="none" stroke="#fff4b8" strokeWidth={2.2} strokeLinecap="round" opacity={0.85} />
      <path d="M9.5 12c3 14.5 13 24.5 30 24.5-6 8-19 9-27.5 1-6-6-8-16.5-2.5-25.5z" fill="none" {...o} />
      <path d="M7 13l3-5 4 2-2 4z" fill="#7c502b" {...o} />
      <path d="M38 34.5l4 1-1 4-3-1z" fill="#7c502b" {...o} />
    </>
  ),
  // 14 pineapple
  14: (
    <>
      {leaf("M24 20c-7.5-4-8.5-10.5-6.5-15.5 4.5 3 6.5 8 6.5 15.5z", LEAF_DARK)}
      {leaf("M24 20c7.5-4 8.5-10.5 6.5-15.5-4.5 3-6.5 8-6.5 15.5z", LEAF_DARK)}
      {leaf("M24 20c-3-6.5-2-13.5 0-17.5 2 4 3 11 0 17.5z", LEAF_LITE)}
      <rect x="12" y="18" width="24" height="27" rx="11" fill="#f0b230" {...o} />
      <path d="M28 19c5 1 7 5 7 12.5S32 43 26 44c5-.5 8-5.5 8-12.5S31.5 20 28 19z" fill="#c97d14" opacity="0.6" />
      <path d="M14 26l18 16M18 20l17 15M34 26L16 42M30 20L13 35" fill="none" stroke="#a66410" strokeWidth={1.4} />
      <path d="M16 25v11" fill="none" stroke="#ffea9c" strokeWidth={2.2} strokeLinecap="round" opacity={0.75} />
      <rect x="12" y="18" width="24" height="27" rx="11" fill="none" {...o} />
    </>
  ),
  // 15 peach
  15: (
    <>
      <path d="M24 12.5c10.5-5 19.5 2 18.5 12-1 10-9.5 17-18.5 20.5-9-3.5-17.5-10.5-18.5-20.5-1-10 8-17 18.5-12z" fill="#ffb09c" {...o} />
      <path d="M34 15.5c5.5 4.5 6.5 13 1.5 20-3.5 5-8 7.5-11.5 8.5 6-2 13-7.5 15.5-15.5 1.5-5 0-10-5.5-13z" fill="#f0687d" opacity="0.65" />
      <path d="M24 12.5c-4 8-4 22 0 32.5" fill="none" stroke="#c95967" strokeWidth={1.6} />
      <path d="M12.5 22c1-4 4-6.5 7.5-7" fill="none" stroke="#fff0e8" strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
      <path d="M24 12.5c10.5-5 19.5 2 18.5 12-1 10-9.5 17-18.5 20.5-9-3.5-17.5-10.5-18.5-20.5-1-10 8-17 18.5-12z" fill="none" {...o} />
      {leaf("M24 12.5c2-6 8.5-8 13.5-6-2 5-7.5 7-13.5 6z", LEAF_LITE)}
    </>
  ),
  // 16 cherry
  16: (
    <>
      <path d="M15 30c0-11 5-19 15-24M33 30c1-9 0-17-3-24" fill="none" stroke={STEM} strokeWidth={2.5} strokeLinecap="round" />
      {leaf("M30 6.5c4.5-4 10.5-3 12.5 1-4 3-9.5 3-12.5-1z", LEAF_LITE)}
      <circle cx="15" cy="34.5" r="9.2" fill="#d1223e" {...o} />
      <path d="M19 28c3 2.5 3.5 7.5 1 11-2 2.5-5.5 3.5-8.5 2.5 3.5 2 8.5 1 10.5-2.5 2-3.5 1-8.5-3-11z" fill="#8f0f25" opacity="0.6" />
      <circle cx="15" cy="34.5" r="9.2" fill="none" {...o} />
      <circle cx="33" cy="35.5" r="9.2" fill="#d1223e" {...o} />
      <path d="M37 29c3 2.5 3.5 7.5 1 11-2 2.5-5.5 3.5-8.5 2.5 3.5 2 8.5 1 10.5-2.5 2-3.5 1-8.5-3-11z" fill="#8f0f25" opacity="0.6" />
      <circle cx="33" cy="35.5" r="9.2" fill="none" {...o} />
      <path d="M10 31.5c1-2 3-3.2 5-3.2M28 32.5c1-2 3-3.2 5-3.2" fill="none" stroke="#ffc2cb" strokeWidth={2.4} strokeLinecap="round" opacity={0.9} />
    </>
  ),
};

export function CropIcon({ id, size = 40 }: { id: number; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={CROP_NAMES[id]}>
      <circle cx="24" cy="24" r="22" fill="#fcf5e3" stroke={INK} strokeWidth="2" />
      <circle cx="24" cy="24" r="19" fill="none" stroke="#e8d8b5" strokeWidth="1.2" strokeDasharray="3 3" />
      <ellipse cx="25" cy="41.5" rx="13" ry="2.8" fill={INK} opacity="0.14" />
      <g transform="translate(3.5 2.5) scale(0.86)">{FRUIT[id]}</g>
    </svg>
  );
}

export type Stage = "seed" | "sprout" | "leafy" | "ripe" | "withered";

type PlantFamily = "root" | "stalk" | "vine" | "trellis" | "bush" | "tropical" | "orchard";

function familyOf(crop: number): PlantFamily {
  if (crop === 1 || crop === 2 || crop === 4) return "root";
  if (crop === 3) return "stalk";
  if (crop === 9 || crop === 11) return "vine";
  if (crop === 7 || crop === 12) return "trellis";
  if (crop === 13 || crop === 14) return "tropical";
  if (crop === 15 || crop === 16) return "orchard";
  return "bush";
}

function SoilMound() {
  return (
    <g>
      <path d="M22 106c6-10 46-10 52 0z" fill="#633c1e" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <path d="M31 103c7-3 26-3 34 0" fill="none" stroke="#8b5a34" strokeWidth={2.2} strokeLinecap="round" />
    </g>
  );
}

function BushFoliage({ blossoms }: { blossoms?: boolean }) {
  return (
    <g>
      <SoilMound />
      <path d="M48 102V60" fill="none" stroke={STEM} strokeWidth={5.5} strokeLinecap="round" />
      {leaf("M48 96c-23 5-39-4-42-22 19-5 35 6 42 22z", LEAF_DARK)}
      {leaf("M48 96c23 5 39-4 42-22-19-5-35 6-42 22z", LEAF)}
      {leaf("M48 80c-20 1-33-11-32-29 18-1 30 11 32 29z", LEAF)}
      {leaf("M48 80c20 1 33-11 32-29-18-1-30 11-32 29z", LEAF_DARK)}
      {leaf("M48 56c-11-11-11-26 0-38 11 12 11 27 0 38z", LEAF_LITE)}
      <path d="M28 70c6-3 12-3 17 1M53 56c5-4 11-4 16-1M44 42c2-4 3-8 4-13" fill="none" stroke="#d5f29c" strokeWidth={2.2} strokeLinecap="round" opacity={0.75} />
      {blossoms && (
        <g>
          <circle cx="30" cy="60" r="4.5" fill="#fffaf0" stroke={INK} strokeWidth="1.6" />
          <circle cx="30" cy="60" r="1.7" fill="#f7c83e" />
          <circle cx="66" cy="54" r="4.2" fill="#fffaf0" stroke={INK} strokeWidth="1.6" />
          <circle cx="66" cy="54" r="1.6" fill="#f7c83e" />
        </g>
      )}
    </g>
  );
}

function StalkFoliage() {
  return (
    <g>
      <SoilMound />
      {/* Tall segmented stalk */}
      <path d="M48 103V20" fill="none" stroke={INK} strokeWidth={9.5} strokeLinecap="round" />
      <path d="M48 103V20" fill="none" stroke="#7cb848" strokeWidth={5.2} strokeLinecap="round" />
      {/* Arching ribbon leaves */}
      {leaf("M46 84c-18-4-32 2-36 12 10-18 24-22 36-12z", LEAF_DARK)}
      {leaf("M50 78c18-4 32 2 36 12-10-18-24-22-36-12z", LEAF)}
      {leaf("M46 58c-16-8-29-5-34 4 10-15 23-16 34-4z", LEAF_LITE)}
      {leaf("M50 50c16-8 29-5 34 4-10-15-23-16-34-4z", LEAF)}
      {/* Tassel at top */}
      <path d="M48 20c-4-7-8-10-12-11M48 20V8M48 20c4-7 8-10 12-11" fill="none" stroke="#e6b647" strokeWidth={2.6} strokeLinecap="round" />
    </g>
  );
}

function VineFoliage({ blossoms }: { blossoms?: boolean }) {
  return (
    <g>
      <SoilMound />
      {/* Trailing curling vine stems */}
      <path d="M14 94c14-14 54-14 68 0" fill="none" stroke={STEM} strokeWidth={4.2} strokeLinecap="round" />
      <path d="M16 84c-4-6 2-10 6-6M80 84c4-6-2-10-6-6" fill="none" stroke={LEAF} strokeWidth={2.4} strokeLinecap="round" />
      {/* Broad scalloped vine leaves */}
      {leaf("M24 88c-12-2-18-13-11-22 8-4 18 4 16 15z", LEAF_DARK)}
      {leaf("M72 88c12-2 18-13 11-22-8-4-18 4-16 15z", LEAF)}
      {leaf("M48 78c-14-3-19-16-8-25 8-5 19-1 16 14z", LEAF_LITE)}
      {leaf("M52 78c14-3 19-16 8-25-8-5-19-1-16 14z", LEAF)}
      {blossoms && (
        <g>
          <circle cx="32" cy="70" r="5" fill="#ffd859" stroke={INK} strokeWidth="1.6" />
          <circle cx="66" cy="72" r="4.5" fill="#ffd859" stroke={INK} strokeWidth="1.6" />
        </g>
      )}
    </g>
  );
}

function TrellisFoliage() {
  return (
    <g>
      <SoilMound />
      {/* Bamboo A-frame trellis */}
      <path d="M24 102L48 16L72 102" fill="none" stroke={INK} strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 102L48 16L72 102" fill="none" stroke="#c79557" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 74h36M37 48h22" fill="none" stroke={INK} strokeWidth={5.2} strokeLinecap="round" />
      <path d="M30 74h36M37 48h22" fill="none" stroke="#d8aa6e" strokeWidth={2.2} strokeLinecap="round" />
      {/* Climbing vine & leaves */}
      <path d="M48 102c-16-14 18-32-8-52 16-12 10-22 8-30" fill="none" stroke={STEM} strokeWidth={3.4} strokeLinecap="round" />
      {leaf("M34 74c-11-3-16-11-11-18 8-1 14 7 11 18z", LEAF)}
      {leaf("M62 70c11-3 16-11 11-18-8-1-14 7-11 18z", LEAF_DARK)}
      {leaf("M38 48c-10-4-13-12-8-18 7 0 11 8 8 18z", LEAF_LITE)}
      {leaf("M58 46c10-4 13-12 8-18-7 0-11 8-8 18z", LEAF)}
    </g>
  );
}

function TropicalFoliage() {
  return (
    <g>
      <SoilMound />
      {/* Dramatic arching tropical fronds */}
      {leaf("M48 98c-22-4-38-18-40-36 16 2 32 14 40 36z", LEAF_DARK)}
      {leaf("M48 98c22-4 38-18 40-36-16 2-32 14-40 36z", LEAF_DARK)}
      {leaf("M48 94c-18-16-30-34-26-54 14 10 24 28 26 54z", LEAF)}
      {leaf("M48 94c18-16 30-34 26-54-14 10-24 28-26 54z", LEAF)}
      {leaf("M48 92c-8-22-8-46 0-66 8 20 8 44 0 66z", LEAF_LITE)}
    </g>
  );
}

function OrchardFoliage() {
  return (
    <g>
      <SoilMound />
      {/* Mini sapling trunk */}
      <path d="M48 103V56M48 74l-14-14M48 70l14-14" fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round" />
      <path d="M48 103V56M48 74l-14-14M48 70l14-14" fill="none" stroke="#996439" strokeWidth={4.8} strokeLinecap="round" />
      {/* Lush rounded storybook canopy */}
      <circle cx="28" cy="52" r="18" fill={LEAF_DARK} {...o} />
      <circle cx="68" cy="52" r="18" fill={LEAF} {...o} />
      <circle cx="48" cy="36" r="23" fill={LEAF} {...o} />
      <path d="M35 26c5-5 15-7 23-3" fill="none" stroke={LEAF_LITE} strokeWidth={4.2} strokeLinecap="round" opacity={0.85} />
    </g>
  );
}

function RootFoliage() {
  return (
    <g>
      <SoilMound />
      <g transform="translate(48 98)">
        {leaf("M0 0C-22 -8 -34 -24 -32 -48 -14 -42 -2 -24 0 0z", LEAF)}
        {leaf("M0 0C22 -8 34 -24 32 -48 14 -42 2 -24 0 0z", LEAF_DARK)}
        {leaf("M0 0C-12 -18 -14 -38 -6 -54 4 -38 4 -18 0 0z", LEAF_LITE)}
        {leaf("M0 0C10 -18 14 -36 8 -52 -2 -36 -2 -18 0 0z", LEAF)}
      </g>
    </g>
  );
}

/** A plant standing on its bed. The drawing is 96 wide and 110 tall, rooted at the bottom centre. */
export function Plant({ crop, stage }: { crop: number; stage: Stage }) {
  const family = familyOf(crop);
  return (
    <svg viewBox="0 0 96 110" preserveAspectRatio="xMidYMax meet" className={`plant plant-${stage}`} aria-hidden="true">
      {stage === "seed" && (
        <>
          <SoilMound />
          {/* Little planted seed mound & peeking sprout tip */}
          <ellipse cx="48" cy="96" rx="11" ry="5" fill="#4f2f17" />
          <path d="M48 95c0-7 3-11 7-13" fill="none" stroke={LEAF_DARK} strokeWidth={3.4} strokeLinecap="round" />
          {leaf("M54 83c4-5 10-6 13-3-3 5-7 6-13 3z", LEAF_LITE)}
          <circle cx="38" cy="98" r="2.2" fill="#8b5a34" />
          <circle cx="58" cy="99" r="1.8" fill="#8b5a34" />
        </>
      )}

      {stage === "sprout" && (
        <>
          <SoilMound />
          <path d="M48 100V72" fill="none" stroke={INK} strokeWidth={6.5} strokeLinecap="round" />
          <path d="M48 100V72" fill="none" stroke={LEAF_DARK} strokeWidth={3.2} strokeLinecap="round" />
          {leaf("M48 77c-15 1-24-7-25-20 14-1 23 7 25 20z", LEAF_LITE)}
          {leaf("M48 77c15 1 24-7 25-20-14-1-23 7-25 20z", LEAF)}
          <path d="M32 64c4 1 8 3 11 6" fill="none" stroke="#d8f5a2" strokeWidth={2} strokeLinecap="round" />
        </>
      )}

      {stage === "leafy" && (
        <>
          {family === "root" && <RootFoliage />}
          {family === "stalk" && <StalkFoliage />}
          {family === "vine" && <VineFoliage blossoms />}
          {family === "trellis" && <TrellisFoliage />}
          {family === "tropical" && <TropicalFoliage />}
          {family === "orchard" && <OrchardFoliage />}
          {family === "bush" && <BushFoliage blossoms />}
        </>
      )}

      {stage === "ripe" && (
        <>
          {family === "root" && (
            <>
              <RootFoliage />
              <g transform="translate(15 44) scale(1.38)">{FRUIT[crop]}</g>
              {/* Foreground soil rim hugging the root */}
              <path d="M22 104c10-6 42-6 52 0" fill="none" stroke="#5d381b" strokeWidth={8} strokeLinecap="round" />
              <path d="M26 103c10-4 34-4 44 0" fill="none" stroke="#8c5a34" strokeWidth={3.5} strokeLinecap="round" />
            </>
          )}
          {family === "stalk" && (
            <>
              <StalkFoliage />
              <g transform="translate(10 34) scale(0.86) rotate(-14 24 24)">{FRUIT[crop]}</g>
              <g transform="translate(46 28) scale(0.9) rotate(14 24 24)">{FRUIT[crop]}</g>
            </>
          )}
          {family === "vine" && (
            <>
              <VineFoliage />
              <g transform="translate(18 46) scale(1.26)">{FRUIT[crop]}</g>
            </>
          )}
          {family === "trellis" && (
            <>
              <TrellisFoliage />
              <g transform="translate(12 36) scale(0.82)">{FRUIT[crop]}</g>
              <g transform="translate(46 28) scale(0.86)">{FRUIT[crop]}</g>
              <g transform="translate(28 54) scale(0.82)">{FRUIT[crop]}</g>
            </>
          )}
          {family === "tropical" && (
            <>
              <TropicalFoliage />
              {crop === 14 ? (
                <g transform="translate(18 44) scale(1.25)">{FRUIT[crop]}</g>
              ) : (
                <>
                  <g transform="translate(10 38) scale(0.92)">{FRUIT[crop]}</g>
                  <g transform="translate(42 36) scale(0.92)">{FRUIT[crop]}</g>
                </>
              )}
            </>
          )}
          {family === "orchard" && (
            <>
              <OrchardFoliage />
              <g transform="translate(8 26) scale(0.76)">{FRUIT[crop]}</g>
              <g transform="translate(48 22) scale(0.8)">{FRUIT[crop]}</g>
              <g transform="translate(28 40) scale(0.78)">{FRUIT[crop]}</g>
            </>
          )}
          {family === "bush" && (
            <>
              <BushFoliage />
              <g transform="translate(6 26) scale(0.85)">{FRUIT[crop]}</g>
              <g transform="translate(48 18) scale(0.88)">{FRUIT[crop]}</g>
              <g transform="translate(26 48) scale(0.92)">{FRUIT[crop]}</g>
            </>
          )}
        </>
      )}

      {stage === "withered" && (
        <>
          <SoilMound />
          <path d="M48 100c0-15-4-24-13-32M47 84c6-7 12-10 20-10M46 76c-4-7-1-13 4-17" fill="none" stroke="#7d5c37" strokeWidth={4} strokeLinecap="round" />
          <path d="M35 68c-9 0-14 5-14 13 8 1 13-5 14-13z" fill="#b5905a" {...o} />
          <path d="M67 74c9 1 13 6 12 14-8 0-12-6-12-14z" fill="#9c7847" {...o} />
          <path d="M29 98c4-2 8-1 10 2" fill="none" stroke="#9c7847" strokeWidth={2.2} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function Weed({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M16 29c-2-9-6-15-12-18M16 29c0-11 1-19 2-25M16 29c2-9 6-14 12-16M16 29c-4-6-8-8-13-7M16 29c4-5 8-7 13-6" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <path d="M16 29c-2-9-6-15-12-18M16 29c0-11 1-19 2-25M16 29c2-9 6-14 12-16M16 29c-4-6-8-8-13-7M16 29c4-5 8-7 13-6" fill="none" stroke="#a6ce39" strokeWidth={2.3} strokeLinecap="round" />
    </svg>
  );
}

export function Bug({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M9 10L5 6M23 10l4-4M6 18H2.5M29.5 18H26M8 25l-3.5 3M24 25l3.5 3" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      <ellipse cx="16" cy="18.5" rx="9" ry="10" fill="#e64e3b" stroke={INK} strokeWidth={2.2} />
      <path d="M16 8.5v20" stroke={INK} strokeWidth={2} />
      <circle cx="16" cy="8.5" r="4.5" fill={INK} />
      <circle cx="14.5" cy="7.5" r="1" fill="#fff" />
      <circle cx="17.5" cy="7.5" r="1" fill="#fff" />
      <circle cx="12" cy="16.5" r="1.8" fill={INK} />
      <circle cx="20" cy="16.5" r="1.8" fill={INK} />
      <circle cx="12.5" cy="23.5" r="1.6" fill={INK} />
      <circle cx="19.5" cy="23.5" r="1.6" fill={INK} />
      <path d="M11 13c1-1.5 2-2 3.5-2" fill="none" stroke="#ffb8ad" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

export function Drop({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M16 3.5c6 8 10 13 10 18a10 10 0 0 1-20 0c0-5 4-10 10-18z" fill="#52b8e6" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M19 11c3 4 4.5 7 4.5 10.5a7.5 7.5 0 0 1-7.5 7.5c4.5 0 8.5-3.5 8.5-8.5 0-3.5-2-6.5-5.5-9.5z" fill="#2d8ec2" opacity="0.45" />
      <path d="M11 20.5c0 3 2 5 5 5" fill="none" stroke="#fff" strokeOpacity={0.85} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx="11.5" cy="16.5" r="1.2" fill="#fff" opacity={0.85} />
    </svg>
  );
}

export function Coin({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10.2" fill="#f7c43c" stroke={INK} strokeWidth={1.9} />
      <circle cx="12" cy="12" r="7" fill="#ffd966" stroke="#c98916" strokeWidth={1.4} />
      {/* Inner gleaming star/diamond */}
      <path d="M12 7.8l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#c98916" opacity="0.65" />
      <path d="M6.4 9.5C7 7.6 8.5 6.2 10.2 5.6" fill="none" stroke="#fff7cc" strokeWidth={1.9} strokeLinecap="round" />
    </svg>
  );
}

export function Dog({ size = 64, awake }: { size?: number; awake: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={awake ? "看门狗在站岗" : "看门狗饿了"}>
      <ellipse cx="32" cy="59" rx="19" ry="4" fill={INK} opacity="0.18" />
      {/* Tail */}
      <path d="M12 39C5 34 4 25 9.5 22c4 3 6 8.5 7 14z" fill="#c78342" {...o} />
      {/* Pointed Shiba ears */}
      <path d="M13 23c-4.5-8.5-2.5-15.5 2-17.5 5 2.5 8 7.5 8 14.5z" fill="#c78342" {...o} />
      <path d="M15.5 20c-2-4.5-1.5-8.5 1-10 2.5 1.5 4 4.5 4.2 8.5z" fill="#f5c6b0" />
      <path d="M51 23c4.5-8.5 2.5-15.5-2-17.5-5 2.5-8 7.5-8 14.5z" fill="#c78342" {...o} />
      <path d="M48.5 20c2-4.5 1.5-8.5-1-10-2.5 1.5-4 4.5-4.2 8.5z" fill="#f5c6b0" />
      {/* Warm golden body/head */}
      <path d="M11 31c0-12.5 9.5-19 21-19s21 6.5 21 19c0 14-8.5 26-21 26S11 45 11 31z" fill="#e6a85c" {...o} />
      {/* Cream cheeks & chest */}
      <path d="M16 38c0-7 6-11 16-11s16 4 16 11c0 9-6.5 16-16 16s-16-7-16-16z" fill="#fff4df" />
      {/* Brow spots */}
      <ellipse cx="22.5" cy="23.5" rx="3" ry="1.8" fill="#fff4df" opacity="0.85" />
      <ellipse cx="41.5" cy="23.5" rx="3" ry="1.8" fill="#fff4df" opacity="0.85" />
      {/* Red collar & golden bell */}
      <path d="M15 44c5 4 11 6 17 6s12-2 17-6" fill="none" stroke="#d94b38" strokeWidth={4.5} strokeLinecap="round" />
      <circle cx="32" cy="51.5" r="3.6" fill="#f7c83e" stroke={INK} strokeWidth={1.9} />
      <circle cx="31" cy="50.5" r="1" fill="#fff7cc" />
      {/* Nose & muzzle */}
      <path d="M27.5 36.5c0-1.5 9-1.5 9 0l-4.5 4.5z" fill={INK} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M32 41v3.5c-2.8 2.8-5.8 2-6.8 0M32 44.5c2.8 2.8 5.8 2 6.8 0" fill="none" stroke={INK} strokeWidth={1.9} strokeLinecap="round" />
      {awake ? (
        <>
          <circle cx="22.5" cy="30" r="3.1" fill={INK} />
          <circle cx="21.5" cy="28.8" r="1.1" fill="#fff" />
          <circle cx="41.5" cy="30" r="3.1" fill={INK} />
          <circle cx="40.5" cy="28.8" r="1.1" fill="#fff" />
          {/* Rosy cheeks */}
          <ellipse cx="17.5" cy="35" rx="2.6" ry="1.6" fill="#f49393" opacity="0.6" />
          <ellipse cx="46.5" cy="35" rx="2.6" ry="1.6" fill="#f49393" opacity="0.6" />
        </>
      ) : (
        <>
          <path d="M18.5 31c2.2 2 5.2 2 7.5 0M38 31c2.2 2 5.2 2 7.5 0" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
          <text x="45" y="13" fontSize="11" fontWeight="700" fill={INK} opacity="0.75">Z</text>
          <text x="53" y="7.5" fontSize="8.5" fontWeight="700" fill={INK} opacity="0.55">z</text>
        </>
      )}
    </svg>
  );
}
