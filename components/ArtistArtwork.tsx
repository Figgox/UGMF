/**
 * Deterministic generated cover art.
 *
 * Seed artists have no photographs, and a grey placeholder box makes a
 * discovery grid look broken. This derives a stable two-tone motif from the
 * artist id instead — same artist, same artwork, no network request. When a
 * provider supplies a real `imageUrl`, that wins.
 */

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

const MOTIFS = ["bars", "rings", "grid", "wedge"] as const;

export function ArtistArtwork({
  id,
  name,
  imageUrl,
  className = "",
  rounded = true,
}: {
  id: string;
  name: string;
  imageUrl?: string;
  className?: string;
  rounded?: boolean;
}) {
  const radius = rounded ? "rounded-lg" : "";

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`h-full w-full object-cover ${radius} ${className}`}
        loading="lazy"
      />
    );
  }

  const h = hash(id);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 60)) % 360;
  const motif = MOTIFS[h % MOTIFS.length]!;
  const gradientId = `g-${id.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Artwork for ${name}`}
      className={`h-full w-full ${radius} ${className}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue} 62% 22%)`} />
          <stop offset="100%" stopColor={`hsl(${hue2} 55% 9%)`} />
        </linearGradient>
      </defs>

      <rect width="100" height="100" fill={`url(#${gradientId})`} />

      <g opacity="0.5" fill="none" stroke={`hsl(${hue} 90% 68%)`} strokeWidth="1.1">
        {motif === "bars" &&
          [12, 26, 40, 54, 68, 82].map((x, i) => (
            <line key={x} x1={x} y1={90 - (h >> i) % 55} x2={x} y2="92" strokeWidth="4" />
          ))}
        {motif === "rings" &&
          [14, 26, 38, 50].map((r) => <circle key={r} cx="50" cy="50" r={r} />)}
        {motif === "grid" &&
          [20, 40, 60, 80].flatMap((v) => [
            <line key={`h${v}`} x1="6" y1={v} x2="94" y2={v} />,
            <line key={`v${v}`} x1={v} y1="6" x2={v} y2="94" />,
          ])}
        {motif === "wedge" && (
          <>
            <path d="M4 96 L50 12 L96 96" />
            <path d="M20 96 L50 42 L80 96" />
          </>
        )}
      </g>

      <text
        x="50"
        y="56"
        textAnchor="middle"
        fontSize="26"
        fontWeight="800"
        letterSpacing="-1"
        fill="rgba(255,255,255,0.9)"
        fontFamily="Helvetica Neue, Arial Narrow, sans-serif"
      >
        {initials(name)}
      </text>
    </svg>
  );
}
