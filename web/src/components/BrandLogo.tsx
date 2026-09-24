import { Link } from "react-router-dom";
import logoUrl from "../assets/logo/logo.png";

type BrandLogoProps = {
  to?: string;
  /** Hauteur visuelle du lockup (le fichier inclut déjà le wordmark). */
  size?: "sm" | "md" | "lg";
  /**
   * `full` — logo + tagline (landing publique).
   * `wordmark` — marque seule, tagline rognée (parcours produit / auth).
   * `mark` — icône JR seule (header mobile).
   */
  lockup?: "full" | "wordmark" | "mark";
  className?: string;
  onClick?: () => void;
};

const HEIGHT: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-9",
  md: "h-11",
  lg: "h-16",
};

/** Hauteur visible sans la ligne de tagline du PNG. */
const WORDMARK_CLIP: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-7",
  md: "h-8",
  lg: "h-11",
};

/** Cadre carré pour le monogramme (partie gauche du PNG). */
const MARK_CLIP: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

export function BrandLogo({
  to = "/",
  size = "md",
  lockup = "wordmark",
  className = "",
  onClick,
}: BrandLogoProps) {
  const img =
    lockup === "full" ? (
      <img
        src={logoUrl}
        alt="JobRadar"
        className={`${HEIGHT[size]} w-auto max-w-[min(100%,16rem)] object-contain object-left ${className}`}
        decoding="async"
      />
    ) : lockup === "mark" ? (
      <span className={`inline-flex shrink-0 overflow-hidden ${MARK_CLIP[size]} ${className}`}>
        <img
          src={logoUrl}
          alt="JobRadar"
          className={`${WORDMARK_CLIP[size]} w-auto max-w-none object-contain object-left object-top`}
          decoding="async"
        />
      </span>
    ) : (
      <span
        className={`inline-flex ${WORDMARK_CLIP[size]} max-w-[min(100%,14rem)] overflow-hidden ${className}`}
      >
        <img
          src={logoUrl}
          alt="JobRadar"
          className={`${HEIGHT[size]} w-auto max-w-none object-contain object-left object-top`}
          decoding="async"
        />
      </span>
    );

  if (!to) return img;

  return (
    <Link
      to={to}
      onClick={onClick}
      className="inline-flex items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)]"
      aria-label="JobRadar — accueil"
    >
      {img}
    </Link>
  );
}
