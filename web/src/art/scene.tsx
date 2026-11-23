// The sunlit pastoral world around the farm: a layered Ghibli-inspired storybook diorama.
// Sky, distant misty peaks, rolling terraced hills, red timber barn with gentle chimney puffs,
// a softly spinning wooden windmill, sunlit meadow, trees, fences, flowers, and butterflies.

const INK = "#35261a";

function Sun() {
  return (
    <svg viewBox="0 0 200 200" className="sun-svg" aria-hidden="true">
      <circle className="sun-halo-outer" cx="100" cy="100" r="88" fill="#ffe58f" />
      <circle className="sun-halo" cx="100" cy="100" r="64" fill="#ffd666" />
      <g className="sun-rays" stroke="#ffe58f" strokeWidth="4" strokeLinecap="round" opacity="0.55">
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
          <line key={deg} x1="100" y1="22" x2="100" y2="36" transform={`rotate(${deg} 100 100)`} />
        ))}
      </g>
      <circle cx="100" cy="100" r="42" fill="#ffd04f" />
      <circle cx="100" cy="100" r="42" fill="none" stroke="#f2a922" strokeWidth="2.5" opacity="0.45" />
      <circle cx="86" cy="86" r="14" fill="#fff3b8" opacity="0.85" />
    </svg>
  );
}

function Cloud({ tone }: { tone: "a" | "b" | "c" | "d" }) {
  return (
    <svg viewBox="0 0 140 64" className={`cloud-svg cloud-${tone}`} aria-hidden="true">
      {/* Soft warm-cool cloud underside */}
      <ellipse cx="70" cy="48" rx="48" ry="10" fill="#d4e6ed" opacity="0.85" />
      <g fill="#fffdf7">
        <ellipse cx="46" cy="37" rx="34" ry="16" />
        <ellipse cx="80" cy="30" rx="31" ry="18" />
        <ellipse cx="104" cy="40" rx="22" ry="12" />
        <ellipse cx="58" cy="22" rx="24" ry="14" />
      </g>
      {/* Golden sunlight rim */}
      <path d="M40 16c8-5 20-5 28 0M72 17c8-4 18-3 24 3" fill="none" stroke="#fff8de" strokeWidth="3.5" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

function DistantBarn() {
  return (
    <svg viewBox="0 0 110 88" className="barn-landmark" aria-hidden="true">
      {/* Chimney smoke puffs */}
      <g className="smoke-puffs" fill="#fffdf7" opacity="0.72">
        <circle cx="77" cy="22" r="5" className="smoke-1" />
        <circle cx="83" cy="13" r="6.5" className="smoke-2" />
        <circle cx="91" cy="6" r="4.5" className="smoke-3" />
      </g>
      {/* Silo behind barn */}
      <rect x="74" y="28" width="18" height="48" rx="3" fill="#e8ddc5" stroke={INK} strokeWidth="2.2" />
      <path d="M74 30c0-7 18-7 18 0z" fill="#b86b43" stroke={INK} strokeWidth="2.2" />
      <path d="M75 44h16M75 56h16M75 68h16" stroke="#c7b79a" strokeWidth="1.4" />
      {/* Chimney */}
      <rect x="64" y="24" width="8" height="16" fill="#9c543c" stroke={INK} strokeWidth="2" />
      {/* Main red barn */}
      <path d="M16 48l26-22 26 22v28H16V48z" fill="#d95843" stroke={INK} strokeWidth="2.3" strokeLinejoin="round" />
      <path d="M56 48v28h12V48z" fill="#b83f2c" opacity="0.45" />
      {/* Roof */}
      <path d="M10 49L24 31l18-10 18 10 14 18" fill="none" stroke={INK} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 49L24 31l18-10 18 10 14 18" fill="none" stroke="#f7ead2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Barn door & loft */}
      <circle cx="42" cy="39" r="4" fill="#ffe184" stroke={INK} strokeWidth="1.8" />
      <rect x="31" y="52" width="22" height="24" rx="1.5" fill="#fdf6e4" stroke={INK} strokeWidth="2.1" />
      <path d="M31 52l22 24M53 52L31 76M42 52v24" stroke="#c79558" strokeWidth="1.8" />
    </svg>
  );
}

function Windmill() {
  return (
    <svg viewBox="0 0 110 128" className="windmill-landmark" aria-hidden="true">
      {/* Tapered stone/timber tower */}
      <path d="M40 122L47 46h16l7 76z" fill="#efe3ca" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M57 46l6 76h7l-7-76z" fill="#d6c5a3" opacity="0.65" />
      {/* Timber bands & tiny window */}
      <path d="M45 68h20M43 92h24" stroke="#b38450" strokeWidth="2.2" />
      <rect x="51" y="75" width="8" height="11" rx="4" fill="#704a2b" stroke={INK} strokeWidth="1.8" />
      <path d="M49 122v-15a6 6 0 0 1 12 0v15z" fill="#704a2b" stroke={INK} strokeWidth="2" />
      {/* Cap roof */}
      <path d="M42 47c2-11 24-11 26 0z" fill="#c95640" stroke={INK} strokeWidth="2.3" strokeLinejoin="round" />
      {/* Slowly rotating wooden sails */}
      <g className="windmill-blades">
        {[0, 90, 180, 270].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 55 46)`}>
            <line x1="55" y1="46" x2="55" y2="8" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
            <rect x="55" y="10" width="12" height="26" rx="2" fill="#fffaf0" fillOpacity="0.88" stroke={INK} strokeWidth="1.8" />
            <path d="M55 17h12M55 24h12M55 31h12M61 10v26" stroke="#c49456" strokeWidth="1.2" />
          </g>
        ))}
        <circle cx="55" cy="46" r="5" fill="#e6b05c" stroke={INK} strokeWidth="2.2" />
      </g>
    </svg>
  );
}

function Tree({ tone = "light", shape = "oak" }: { tone?: "light" | "dark"; shape?: "oak" | "cypress" }) {
  if (shape === "cypress") {
    const fill = tone === "dark" ? "#457d34" : "#599842";
    return (
      <svg viewBox="0 0 46 84" className="tree" aria-hidden="true">
        <rect x="20" y="58" width="6" height="22" rx="3" fill="#82532e" stroke={INK} strokeWidth="2.2" />
        <path d="M23 6c10 14 14 34 11 48-2 8-20 8-22 0C9 40 13 20 23 6z" fill={fill} stroke={INK} strokeWidth="2.3" strokeLinejoin="round" />
        <path d="M18 22c-2 10-2 20 0 28" fill="none" stroke="#8dcf63" strokeWidth="2.6" strokeLinecap="round" opacity="0.65" />
      </svg>
    );
  }
  const canopy = tone === "dark" ? "#4d8a37" : "#67ab44";
  const highlight = tone === "dark" ? "#77ba52" : "#9bd463";
  return (
    <svg viewBox="0 0 70 78" className="tree" aria-hidden="true">
      <ellipse cx="35" cy="72" rx="18" ry="3.5" fill={INK} opacity="0.14" />
      <rect x="30" y="39" width="10" height="32" rx="4.5" fill="#8c5a33" stroke={INK} strokeWidth="2.4" />
      <circle cx="21" cy="36" r="15" fill={canopy} stroke={INK} strokeWidth="2.4" />
      <circle cx="49" cy="35" r="16" fill="#79be4f" stroke={INK} strokeWidth="2.4" />
      <circle cx="35" cy="20" r="20" fill={canopy} stroke={INK} strokeWidth="2.4" />
      <path d="M25 14c4-4 11-5 16-2" fill="none" stroke={highlight} strokeWidth="3.2" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

function Fence() {
  return (
    <svg viewBox="0 0 280 64" className="fence" aria-hidden="true">
      <rect x="2" y="16" width="276" height="8" rx="4" fill="#d9ad70" stroke={INK} strokeWidth="2.3" />
      <rect x="2" y="36" width="276" height="8" rx="4" fill="#c79557" stroke={INK} strokeWidth="2.3" />
      {[8, 72, 136, 200, 264].map((x) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <rect x="0" y="5" width="12" height="54" rx="4.5" fill="#e2b97e" stroke={INK} strokeWidth="2.4" />
          <rect x="3" y="13" width="6" height="16" rx="3" fill="#be8b4d" opacity="0.55" />
          <circle cx="6" cy="20" r="1.4" fill={INK} />
          <circle cx="6" cy="40" r="1.4" fill={INK} />
        </g>
      ))}
    </svg>
  );
}

function Tuft({ tone = "a" }: { tone?: "a" | "b" }) {
  const dark = tone === "b" ? "#4e8a34" : "#65a440";
  const lite = tone === "b" ? "#77ba52" : "#95cf5e";
  return (
    <svg viewBox="0 0 28 22" className="tuft" aria-hidden="true">
      <g transform="translate(14 20)" fill="none" strokeLinecap="round">
        <path d="M0 0C-1 -8 -5 -12 -10 -14M0 0C0 -10 1 -14 0 -18M0 0C1 -8 5 -12 10 -13" stroke={dark} strokeWidth="2.8" />
        <path d="M0 0C-1 -5 -3 -9 -6 -10M0 0C1 -5 4 -9 6 -9" stroke={lite} strokeWidth="2.2" />
      </g>
    </svg>
  );
}

function Bloom({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 20 20" className="bloom" aria-hidden="true">
      <g transform="translate(10 10)">
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="0" cy="-4.8" rx="3" ry="4.8" fill={c} transform={`rotate(${a})`} />
        ))}
        <circle r="2.6" fill="#f7c83e" stroke={INK} strokeWidth="1.3" />
      </g>
    </svg>
  );
}

function Butterfly({ tone }: { tone: "a" | "b" }) {
  const wing = tone === "a" ? "#f493aa" : "#f7c83e";
  const wingLite = tone === "a" ? "#fbc2cf" : "#ffe799";
  return (
    <svg viewBox="0 0 32 32" className={`butterfly butterfly-${tone}`} aria-hidden="true">
      <g className="flutter">
        <ellipse cx="10" cy="13" rx="7" ry="5" fill={wing} stroke={INK} strokeWidth="1.2" transform="rotate(-28 10 13)" />
        <ellipse cx="22" cy="13" rx="7" ry="5" fill={wingLite} stroke={INK} strokeWidth="1.2" transform="rotate(28 22 13)" />
        <ellipse cx="10" cy="21" rx="5" ry="3.6" fill={wingLite} stroke={INK} strokeWidth="1.2" transform="rotate(-18 10 21)" />
        <ellipse cx="22" cy="21" rx="5" ry="3.6" fill={wing} stroke={INK} strokeWidth="1.2" transform="rotate(18 22 21)" />
        <rect x="14.7" y="8" width="2.6" height="16" rx="1.3" fill={INK} />
        <circle cx="16" cy="7.5" r="2.4" fill={INK} />
      </g>
    </svg>
  );
}

const GRASS_TILE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='46'%3E%3Cpath d='M10 30c2-4 5-7 8-8M48 14c2-4 5-7 8-8M28 40c1-3 3-5 5-6' fill='none' stroke='%23569236' stroke-width='2.4' stroke-linecap='round' opacity='.38'/%3E%3C/svg%3E\")";

export function SceneBackdrop() {
  return (
    <div className="backdrop" aria-hidden="true" style={{ "--grass-tile": GRASS_TILE } as React.CSSProperties}>
      <Sun />
      <Cloud tone="a" />
      <Cloud tone="b" />
      <Cloud tone="c" />
      <Cloud tone="d" />

      {/* Three layers of atmospheric peaks and sunlit terraced hills */}
      <svg className="hills-svg" viewBox="0 0 1440 320" preserveAspectRatio="none">
        {/* Distant misty ridge */}
        <path
          d="M0 320V115C180 45 340 55 510 105C690 158 840 42 1040 62C1200 78 1330 35 1440 75V320Z"
          fill="#b8d9c2"
          opacity="0.72"
        />
        {/* Mid-ground sunlit hill */}
        <path
          d="M0 320V160C210 92 410 102 600 162C790 220 960 112 1150 130C1280 142 1370 172 1440 162V320Z"
          fill="#98c873"
        />
        {/* Foreground warm pasture swell */}
        <path
          d="M0 320V220C280 176 540 232 820 202C1080 174 1280 208 1440 198V320Z"
          fill="#85bc57"
        />
      </svg>

      {/* The sunlit meadow the farm rests on */}
      <div className="meadow" />

      {/* Horizon landmarks: cozy barn & spinning windmill */}
      <div className="prop landmark-barn"><DistantBarn /></div>
      <div className="prop landmark-windmill"><Windmill /></div>

      {/* Layered trees along the horizon */}
      <div className="prop tree-a"><Tree /></div>
      <div className="prop tree-b"><Tree tone="dark" shape="cypress" /></div>
      <div className="prop tree-c"><Tree tone="dark" /></div>
      <div className="prop tree-d"><Tree shape="cypress" /></div>
      <div className="prop tree-e"><Tree /></div>
      <div className="prop tree-f"><Tree tone="dark" /></div>
      <div className="prop tree-g"><Tree shape="cypress" /></div>

      {/* Wooden fence rows flanking the horizon */}
      <div className="prop fence-a"><Fence /></div>
      <div className="prop fence-b"><Fence /></div>

      {/* Meadow grass tufts and wildflowers */}
      <div className="prop tuft-a"><Tuft /></div>
      <div className="prop tuft-b"><Tuft tone="b" /></div>
      <div className="prop tuft-c"><Tuft /></div>
      <div className="prop tuft-d"><Tuft tone="b" /></div>
      <div className="prop tuft-e"><Tuft /></div>
      <div className="prop tuft-f"><Tuft tone="b" /></div>
      <div className="prop bloom-a"><Bloom c="#fffdf4" /></div>
      <div className="prop bloom-b"><Bloom c="#f493aa" /></div>
      <div className="prop bloom-c"><Bloom c="#ffd24d" /></div>
      <div className="prop bloom-d"><Bloom c="#f493aa" /></div>
      <div className="prop bloom-e"><Bloom c="#fffdf4" /></div>
      <div className="prop bloom-f"><Bloom c="#b7a4f0" /></div>

      <Butterfly tone="a" />
      <Butterfly tone="b" />
    </div>
  );
}
