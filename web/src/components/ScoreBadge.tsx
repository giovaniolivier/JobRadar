import type { CSSProperties } from "react";

type ScoreTone = "low" | "mid" | "high";

function toneFor(score: number): ScoreTone {
  if (score >= 70) return "high";
  if (score >= 45) return "mid";
  return "low";
}

const TONE_COLOR: Record<ScoreTone, string> = {
  low: "var(--brick)",
  mid: "var(--amber)",
  high: "var(--match)",
};

/** Animated dial while analysis runs — arc fills in a continuous loop. */
export function ScoreDialLoading({ size = 88 }: { size?: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--hairline)" strokeWidth="1.25" opacity="0.9" />
        <circle
          className="score-dial-loading"
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="var(--amber)"
          strokeWidth="2"
          strokeLinecap="butt"
          strokeDasharray={`${c * 0.35} ${c}`}
          transform="rotate(-90 20 20)"
        />
      </svg>
      <span className="mono absolute text-[0.65rem] tracking-wider text-[var(--ink-soft)]">…</span>
    </span>
  );
}

/** Instrument dial — empty state is a light N/A mark, not a hollow gauge. */
export function ScoreBadge({ score, size = 44 }: { score: number | null | undefined; size?: number }) {
  if (score == null) {
    return (
      <span
        className="inline-flex shrink-0 flex-col items-center justify-center"
        style={{ width: size, height: size }}
        title="Non analysé"
      >
        <span
          className="block w-[70%] border-t border-[var(--hairline)]"
          style={{ opacity: 0.7 }}
          aria-hidden
        />
        <span className="mono mt-1 text-[0.58rem] tracking-wider text-[var(--ink-soft)]">N/A</span>
      </span>
    );
  }

  const tone = toneFor(score);
  const color = TONE_COLOR[tone];
  const r = 14;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(100, score));
  const offset = c - (value / 100) * c;

  const dialStyle = {
    "--dial-offset": offset,
    animation: "sweep 500ms ease both",
  } as CSSProperties;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      title={`Pertinence ${score}/100`}
    >
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--hairline)" strokeWidth="1.25" opacity="0.9" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="butt"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 20 20)"
          style={dialStyle}
        />
      </svg>
      <span className="mono absolute text-[0.7rem] font-medium leading-none" style={{ color }}>
        {score}
      </span>
    </span>
  );
}

export function RedFlagList({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {flags.map((flag) => (
        <li key={flag} className="label" style={{ color: "var(--brick)", letterSpacing: "0.06em" }}>
          ▸ {flag}
        </li>
      ))}
    </ul>
  );
}
