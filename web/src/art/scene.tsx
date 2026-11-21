// The world around the farm: a layered storybook backdrop.
// Sky and horizon are pinned by CSS percentages, so the scene holds
// together on any aspect ratio; only the hill band may crop inward
// on very wide screens, which just softens the hills.

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

function Tree({ tone = "light" }: { tone?: "light" | "dark" }) {
  const canopy = tone === "dark" ? "#4e8a34" : "#63a441";
  return (
    <svg viewBox="0 0 64 72" className={`tree`} aria-hidden="true">
      <rect x="28" y="36" width="8" height="30" rx="4" fill="#8a5a33" stroke={INK} strokeWidth="2.6" />
      <circle cx="20" cy="34" r="14" fill={canopy} stroke={INK} strokeWidth="2.6" />
      <circle cx="44" cy="33" r="15" fill="#79b950" stroke={INK} strokeWidth="2.6" />
      <circle cx="32" cy="18" r="19" fill={canopy} stroke={INK} strokeWidth="2.6" />
      <path d="M25 14c3-3 8-4 12-2" fill="none" stroke="#a8d977" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

function Fence() {
  return (
    <svg viewBox="0 0 280 62" className="fence" aria-hidden="true">
      {[5, 67, 129, 191, 253].map((x) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <rect x="0" y="4" width="11" height="54" rx="4.5" fill="#c79a5e" stroke={INK} strokeWidth="2.5" />
          <rect x="2.5" y="12" width="6" height="14" rx="3" fill="#a87649" opacity="0.55" />
        </g>
      ))}
      <rect x="0" y="14" width="264" height="8" rx="4" fill="#d8ab6f" stroke={INK} strokeWidth="2.4" />
      <rect x="0" y="34" width="264" height="8" rx="4" fill="#d8ab6f" stroke={INK} strokeWidth="2.4" />
    </svg>
  );
}

function Tuft({ tone = "a" }: { tone?: "a" | "b" }) {
  const dark = tone === "b" ? "#5f9636" : "#79b950";
  const lite = tone === "b" ? "#79b950" : "#94cc60";
  return (
    <svg viewBox="0 0 24 20" className="tuft" aria-hidden="true">
      <g transform="translate(12 19)" fill="none" strokeLinecap="round">
        <path d="M0 0C-1 -7 -5 -11 -9 -13M0 0C0 -9 1 -13 0 -17M0 0C1 -7 5 -11 9 -12" stroke={dark} strokeWidth="2.8" />
        <path d="M0 0C-1 -5 -3 -8 -6 -9M0 0C1 -5 4 -8 6 -8" stroke={lite} strokeWidth="2.2" />
      </g>
    </svg>
  );
}

function Bloom({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 18 18" className="bloom" aria-hidden="true">
      <g transform="translate(9 9)">
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="0" cy="-4.6" rx="2.9" ry="4.6" fill={c} transform={`rotate(${a})`} />
        ))}
        <circle r="2.6" fill="#f6c445" stroke={INK} strokeWidth="1.4" />
      </g>
    </svg>
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

const GRASS_TILE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='52' height='38'%3E%3Cpath d='M8 26c2-4 5-6 8-7M44 12c2-4 5-6 8-7' fill='none' stroke='%236a9c41' stroke-width='2.6' stroke-linecap='round' opacity='.5'/%3E%3C/svg%3E\")";

export function SceneBackdrop() {
  return (
    <div className="backdrop" aria-hidden="true" style={{ "--grass-tile": GRASS_TILE } as React.CSSProperties}>
      <Sun />
      <Cloud tone="a" />
      <Cloud tone="b" />
      <Cloud tone="c" />
      <Cloud tone="d" />

      {/* rolling hills: stretched, never cropped, on every aspect ratio */}
      <svg className="hills-svg" viewBox="0 0 1440 300" preserveAspectRatio="none">
        <path
          d="M0 300L0 100C150 40 300 46 450 90C600 136 700 50 860 58C1020 66 1120 20 1260 50C1350 66 1400 80 1440 90L1440 300Z"
          fill="#b6d8b6"
        />
        <path
          d="M0 300L0 170C200 110 380 116 560 168C740 218 900 126 1080 138C1220 148 1340 180 1440 172L1440 300Z"
          fill="#96c26e"
        />
      </svg>

      {/* the meadow the farm stands on */}
      <div className="meadow" />

      {/* trees planted on the horizon */}
      <div className="prop tree-a"><Tree /></div>
      <div className="prop tree-b"><Tree tone="dark" /></div>
      <div className="prop tree-c"><Tree /></div>
      <div className="prop tree-d"><Tree tone="dark" /></div>
      <div className="prop tree-e"><Tree /></div>
      <div className="prop tree-f"><Tree tone="dark" /></div>
      <div className="prop tree-g"><Tree /></div>

      {/* fence rows along the field's flanks */}
      <div className="prop fence-a"><Fence /></div>
      <div className="prop fence-b"><Fence /></div>

      {/* grass tufts and wild flowers */}
      <div className="prop tuft-a"><Tuft /></div>
      <div className="prop tuft-b"><Tuft tone="b" /></div>
      <div className="prop tuft-c"><Tuft /></div>
      <div className="prop tuft-d"><Tuft tone="b" /></div>
      <div className="prop tuft-e"><Tuft /></div>
      <div className="prop tuft-f"><Tuft tone="b" /></div>
      <div className="prop bloom-a"><Bloom c="#fffdf4" /></div>
      <div className="prop bloom-b"><Bloom c="#f090a8" /></div>
      <div className="prop bloom-c"><Bloom c="#f6c445" /></div>
      <div className="prop bloom-d"><Bloom c="#f090a8" /></div>
      <div className="prop bloom-e"><Bloom c="#fffdf4" /></div>

      <Butterfly tone="a" />
      <Butterfly tone="b" />
    </div>
  );
}
