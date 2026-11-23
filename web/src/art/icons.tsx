// Cohesive illustrated UI & farmyard icons in the warm storybook ink style.

const INK = "#35261a";

const strokeProps = {
  stroke: INK,
  strokeWidth: 2.1,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};

export function BrandLogo({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      {/* Sunlit wooden-rimmed emblem */}
      <rect x="2.5" y="2.5" width="43" height="43" rx="13" fill="#6aa845" stroke={INK} strokeWidth="2.6" />
      <rect x="5.5" y="5.5" width="37" height="19" rx="9" fill="#8bc95a" opacity="0.55" />
      {/* Warm tilled ridge arc at bottom */}
      <path d="M5 35c7-5 31-5 38 0v6a7 7 0 0 1-7 7H12a7 7 0 0 1-7-7v-6z" fill="#8d5b34" />
      <path d="M5 35c7-5 31-5 38 0" fill="none" stroke={INK} strokeWidth="2.2" />
      <path d="M12 40c8-2.5 16-2.5 24 0" fill="none" stroke="#6d4323" strokeWidth="2" strokeLinecap="round" />
      {/* Sun glow behind sprout */}
      <circle cx="24" cy="21" r="10" fill="#fde386" opacity="0.35" />
      {/* Sprout */}
      <path d="M24 34V19" fill="none" stroke={INK} strokeWidth="3.6" strokeLinecap="round" />
      <path d="M24 34V19" fill="none" stroke="#fdf8ea" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M24 23c-9.5 1.2-14.5-4-15-11.5 8.5-.8 14 3.5 15 11.5z"
        fill="#fffaf0"
        stroke={INK}
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
      <path
        d="M24 23c9.5 1.2 14.5-4 15-11.5-8.5-.8-14 3.5-15 11.5z"
        fill="#e7f5c4"
        stroke={INK}
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
      <path d="M22 20c-4-2-7-4-9-6M26 20c4-2 7-4 9-6" fill="none" stroke="#6aa845" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function BarnIcon({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <ellipse cx="20" cy="36" rx="14" ry="2.5" fill={INK} opacity="0.14" />
      {/* Roof overhang shadow */}
      <path d="M6 19l14-11 14 11v16H6V19z" fill="#d9533f" {...strokeProps} />
      {/* Wall shading */}
      <path d="M28 19v16h6V19z" fill="#b83e2d" opacity="0.55" />
      {/* Gambrel roof */}
      <path d="M3.5 19.5L10 11l10-6 10 6 6.5 8.5" fill="none" stroke={INK} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 19.5L10 11l10-6 10 6 6.5 8.5" fill="none" stroke="#f7e8cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Loft window */}
      <circle cx="20" cy="14" r="3" fill="#ffe184" stroke={INK} strokeWidth="1.8" />
      {/* Barn door */}
      <rect x="13" y="21" width="14" height="14" rx="1.5" fill="#fdf6e4" {...strokeProps} />
      <path d="M13 21l14 14M27 21L13 35M20 21v14" fill="none" stroke="#c79558" strokeWidth="1.7" />
      <rect x="13" y="21" width="14" height="14" rx="1.5" fill="none" {...strokeProps} />
    </svg>
  );
}

export function FenceIcon({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <ellipse cx="20" cy="36" rx="15" ry="2.4" fill={INK} opacity="0.14" />
      {/* Horizontal rails */}
      <rect x="3" y="16" width="34" height="5" rx="2" fill="#cfa063" {...strokeProps} />
      <rect x="3" y="25.5" width="34" height="5" rx="2" fill="#be8b4d" {...strokeProps} />
      {/* Posts */}
      <path d="M8 35V12l3.5-5 3.5 5v23z" fill="#e6be82" {...strokeProps} />
      <path d="M25 35V12l3.5-5 3.5 5v23z" fill="#e6be82" {...strokeProps} />
      {/* Little signpost arrow & flower */}
      <circle cx="11.5" cy="18.5" r="1.2" fill={INK} />
      <circle cx="28.5" cy="18.5" r="1.2" fill={INK} />
      <circle cx="11.5" cy="28" r="1.2" fill={INK} />
      <circle cx="28.5" cy="28" r="1.2" fill={INK} />
      {/* Cute little bloom tucked by the fence */}
      <circle cx="20" cy="33" r="3.4" fill="#f58aa0" stroke={INK} strokeWidth="1.5" />
      <circle cx="20" cy="33" r="1.3" fill="#ffd966" />
    </svg>
  );
}

export function BookIcon({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <ellipse cx="20" cy="36" rx="14" ry="2.4" fill={INK} opacity="0.14" />
      {/* Leather cover back */}
      <path d="M5 11c5-2.5 11-2 15 1.5C24 9 30 8.5 35 11v22c-5-2.5-11-2-15 1.5-4-3.5-10-4-15-1.5V11z" fill="#8b5a34" {...strokeProps} />
      {/* Open cream pages */}
      <path d="M7.5 9.5c4.5-2 9.5-1.5 12.5 1.5 3-3 8-3.5 12.5-1.5v20.5c-4.5-2-9.5-1.5-12.5 1.5-3-3-8-3.5-12.5-1.5V9.5z" fill="#fffaf0" {...strokeProps} />
      <path d="M20 11v20.5" fill="none" {...strokeProps} />
      {/* Page text lines & leaf stamp */}
      <path d="M11 15h5M11 19.5h5.5M11 24h4.5M23.5 15h5.5M23.5 19.5h5M23.5 24h4" fill="none" stroke="#b9a68a" strokeWidth="1.8" strokeLinecap="round" />
      {/* Red ribbon bookmark */}
      <path d="M25 29v7.5l2-1.8 2 1.8V29z" fill="#d9533f" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function HarvestIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M4 11h16l-2 9H6l-2-9z" fill="#d49e5c" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 11c0-4 2-7 4-7s4 3 4 7" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <circle cx="9.5" cy="10" r="2.6" fill="#e2533f" stroke={INK} strokeWidth="1.6" />
      <circle cx="14.5" cy="10" r="2.6" fill="#f4bf42" stroke={INK} strokeWidth="1.6" />
    </svg>
  );
}

export function TendIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M12 3c4.5 6 7 9.5 7 13a7 7 0 0 1-14 0c0-3.5 2.5-7 7-13z" fill="#63bce3" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 16c0 2 1.5 3.5 3.5 3.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ShovelIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M14 10l6-6M18 2l4 4" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 9l4 4-4.5 5.5a3.5 3.5 0 0 1-5-5L11 9z" fill="#b4bec4" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function HandIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M8 12V6a1.5 1.5 0 0 1 3 0v5V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v6.5c0 4.5-2.8 7.5-7 7.5-3.6 0-6-2.2-6-6v-3a1.5 1.5 0 0 1 3 0v1z"
        fill="#f7d3a8"
        stroke={INK}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BoneIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M6.5 9.5a2.6 2.6 0 1 1 2.2-3.8l6.6 0a2.6 2.6 0 1 1 2.2 3.8 2.6 2.6 0 1 1-2.2 3.8l-6.6 0a2.6 2.6 0 1 1-2.2-3.8z"
        transform="translate(0 2.5)"
        fill="#fff8e8"
        stroke={INK}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HomeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M3 11.5L12 4l9 7.5" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10.5V20h12v-9.5" fill="#f7e8cc" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <rect x="10" y="14" width="4" height="6" fill="#c78b4b" stroke={INK} strokeWidth="1.7" />
    </svg>
  );
}

export function EditIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M4 20l4.5-1 10-10-3.5-3.5-10 10L4 20z" fill="#f6c445" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 7l3.5 3.5" stroke={INK} strokeWidth="2" />
    </svg>
  );
}

export function DoghouseArt({ awake }: { awake: boolean }) {
  return (
    <svg viewBox="0 0 96 86" width="84" height="76" aria-hidden="true">
      {/* Ground shadow */}
      <ellipse cx="48" cy="79" rx="38" ry="5.5" fill={INK} opacity="0.16" />
      {/* Timber walls */}
      <rect x="16" y="34" width="64" height="44" rx="5" fill="#e5bc82" stroke={INK} strokeWidth="2.6" />
      {/* Wood plank lines */}
      <path d="M17 45h62M17 56h62M17 67h62" stroke="#c49456" strokeWidth="1.6" />
      {/* Shaded right side */}
      <rect x="66" y="35" width="13" height="42" rx="2" fill="#c99a5d" opacity="0.45" />
      {/* Dark cozy doorway */}
      <path d="M32 78V54c0-9 7-15 16-15s16 6 16 15v24z" fill="#4f301a" stroke={INK} strokeWidth="2.6" />
      {/* Warm straw peeking inside */}
      <path d="M35 76l5-4 4 4 6-3 5 3 5-3" fill="none" stroke="#f2c95d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* Red shingled roof */}
      <path d="M6 38L48 6l42 32-5 6L48 15 11 44z" fill="#d9533f" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M14 33l34-25 34 25" fill="none" stroke="#f2836b" strokeWidth="2.2" strokeLinecap="round" opacity="0.65" />
      {/* Bone nameplate over door */}
      <rect x="37" y="25" width="22" height="9" rx="4.5" fill="#fff7e2" stroke={INK} strokeWidth="2" />
      <circle cx="48" cy="29.5" r="1.8" fill={awake ? "#6aa845" : "#c79a5e"} />
    </svg>
  );
}
