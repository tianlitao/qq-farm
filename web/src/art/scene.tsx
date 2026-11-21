// The world around the farm: a layered storybook backdrop.
// Sky, sun and clouds are HTML layers (they never get cropped away);
// hills, trees, fence and meadow are one SVG pinned to the bottom.

const INK = "#22331f";

function Sun() {
  return (
    <svg viewBox="0 0 160 160" className="sun-svg" aria-hidden="true">
      <circle className="sun-halo" cx="80" cy="80" r="66" fill="#f6c445" />
      <circle cx="80" cy="80" r="44" fill="#f6c445" />
      <circle cx="80" cy="80" r="44" fill="none" stroke="#e9a51f" strokeWidth="3" opacity="0.5" />
      <circle cx="66" cy="66" r="12" fill="#fbe28a" opacity="0.8" />
    </svg>
  );
}

function Cloud({ tone }: { tone: "a" | "b" | "c" | "d" }) {
  return (
    <svg viewBox="0 0 120 56" className={`cloud-svg cloud-${tone}`} aria-hidden="true">
      <ellipse cx="60" cy="42" rx="42" ry="9" fill="#d7e8ef" />
      <g fill="#ffffff">
        <ellipse cx="42" cy="33" rx="32" ry="15" />
        <ellipse cx="72" cy="27" rx="28" ry="16" />
        <ellipse cx="92" cy="36" rx="20" ry="11" />
        <ellipse cx="54" cy="19" rx="22" ry="13" />
      </g>
    </svg>
  );
}

function Tree({ x, y, s = 1, tone = "light" }: { x: number; y: number; s?: number; tone?: "light" | "dark" }) {
  const canopy = tone === "dark" ? "#4e8a34" : "#63a441";
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-4" y="-8" width="8" height="28" rx="3.5" fill="#8a5a33" stroke={INK} strokeWidth="2.5" />
      <circle cx="-12" cy="-12" r="13" fill={canopy} stroke={INK} strokeWidth="2.5" />
      <circle cx="13" cy="-13" r="14" fill="#79b950" stroke={INK} strokeWidth="2.5" />
      <circle cx="0" cy="-26" r="19" fill={canopy} stroke={INK} strokeWidth="2.5" />
      <path d="M-6 -30c3-3 8-4 12-2" fill="none" stroke="#a8d977" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
    </g>
  );
}

function Fence({ x, y, n }: { x: number; y: number; n: number }) {
  const span = (n - 1) * 62;
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${i * 62} 0)`}>
          <rect x="0" y="-6" width="11" height="52" rx="4.5" fill="#c79a5e" stroke={INK} strokeWidth="2.5" />
          <rect x="2.5" y="2" width="6" height="14" rx="3" fill="#a87649" opacity="0.55" />
        </g>
      ))}
      <rect x="-5" y="6" width={span + 21} height="8" rx="4" fill="#d8ab6f" stroke={INK} strokeWidth="2.4" />
      <rect x="-5" y="24" width={span + 21} height="8" rx="4" fill="#d8ab6f" stroke={INK} strokeWidth="2.4" />
    </g>
  );
}

function Tuft({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="none" strokeLinecap="round">
      <path d="M0 0C-1 -7 -5 -11 -9 -13M0 0C0 -9 1 -13 0 -17M0 0C1 -7 5 -11 9 -12" stroke="#5f9636" strokeWidth="3" />
      <path d="M0 0C-1 -5 -3 -8 -6 -9M0 0C1 -5 4 -8 6 -8" stroke="#79b950" strokeWidth="2.4" />
    </g>
  );
}

function Bloom({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy="-4.8" rx="3" ry="4.8" fill={c} transform={`rotate(${a})`} />
      ))}
      <circle r="2.8" fill="#f6c445" stroke={INK} strokeWidth="1.4" />
    </g>
  );
}

function Butterfly({ tone }: { tone: "a" | "b" }) {
  const wing = tone === "a" ? "#f090a8" : "#f6c445";
  const wingLite = tone === "a" ? "#f7b6c6" : "#fbe28a";
  return (
    <svg viewBox="0 0 32 32" className={`butterfly butterfly-${tone}`} aria-hidden="true">
      <g className="flutter">
        <ellipse cx="10" cy="13" rx="7" ry="5" fill={wing} transform="rotate(-28 10 13)" />
        <ellipse cx="22" cy="13" rx="7" ry="5" fill={wingLite} transform="rotate(28 22 13)" />
        <ellipse cx="10" cy="21" rx="5" ry="3.6" fill={wingLite} transform="rotate(-18 10 21)" />
        <ellipse cx="22" cy="21" rx="5" ry="3.6" fill={wing} transform="rotate(18 22 21)" />
        <rect x="14.6" y="8" width="2.8" height="17" rx="1.4" fill={INK} />
        <circle cx="16" cy="7.5" r="2.6" fill={INK} />
      </g>
    </svg>
  );
}

export function SceneBackdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <Sun />
      <Cloud tone="a" />
      <Cloud tone="b" />
      <Cloud tone="c" />
      <Cloud tone="d" />
      <Butterfly tone="a" />
      <Butterfly tone="b" />

      <svg className="terrain-svg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="lg-meadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8fc75e" />
            <stop offset="0.4" stopColor="#7db249" />
            <stop offset="1" stopColor="#669e3b" />
          </linearGradient>
          <pattern id="grass-marks" width="52" height="38" patternUnits="userSpaceOnUse">
            <path d="M8 26c2-4 5-6 8-7M44 12c2-4 5-6 8-7" fill="none" stroke="#6a9c41" strokeWidth="2.6" strokeLinecap="round" opacity="0.55" />
          </pattern>
        </defs>

        {/* far range */}
        <path
          d="M0 200L0 168C150 140 300 144 450 165C600 185 700 148 860 152C1020 156 1120 136 1260 150C1350 158 1400 164 1440 170L1440 200Z"
          fill="#b6d8b6"
        />
        {/* mid hills */}
        <path
          d="M0 218L0 196C200 168 380 172 560 196C740 218 900 176 1080 184C1220 190 1340 202 1440 198L1440 218Z"
          fill="#96c26e"
        />

        {/* tree lines on the horizon */}
        <Tree x={95} y={185} s={0.9} />
        <Tree x={152} y={192} s={1.05} tone="dark" />
        <Tree x={208} y={184} s={0.72} />
        <Tree x={520} y={187} s={0.68} tone="dark" />
        <Tree x={1002} y={185} s={0.62} />
        <Tree x={1245} y={186} s={0.95} tone="dark" />
        <Tree x={1315} y={192} s={1.1} />
        <Tree x={1382} y={184} s={0.78} />

        {/* the meadow the farm stands on */}
        <path
          d="M0 222C240 204 480 208 720 218C960 228 1200 212 1440 216L1440 900L0 900Z"
          fill="url(#lg-meadow)"
        />
        <rect x="0" y="222" width="1440" height="678" fill="url(#grass-marks)" />

        {/* fence rows along the field's flanks */}
        <Fence x={64} y={232} n={5} />
        <Fence x={1122} y={230} n={5} />

        {/* grass tufts and wild flowers */}
        <Tuft x={46} y={268} s={1.1} />
        <Tuft x={640} y={252} s={0.9} />
        <Tuft x={1394} y={286} s={1.1} />
        <Tuft x={1320} y={352} />
        <Tuft x={210} y={430} s={1.2} />
        <Tuft x={700} y={560} s={1} />
        <Tuft x={120} y={780} s={1.3} />
        <Tuft x={424} y={805} s={1.1} />
        <Tuft x={1002} y={795} s={1.2} />
        <Tuft x={1332} y={782} s={1.1} />
        <Bloom x={300} y={288} c="#fffdf4" />
        <Bloom x={1258} y={330} c="#f6c445" />
        <Bloom x={762} y={310} c="#f090a8" />
        <Bloom x={180} y={762} c="#f090a8" />
        <Bloom x={880} y={798} c="#fffdf4" />
        <Bloom x={520} y={808} c="#f6c445" />
        <Bloom x={1350} y={818} c="#fffdf4" />
      </svg>
    </div>
  );
}
