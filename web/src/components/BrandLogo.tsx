import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logoClair from "../assets/logo/logo-clair.png";
import logoSombre from "../assets/logo/logo-sombre.png";
import { isResolvedDark, subscribeResolvedTheme } from "../lib/theme";

type BrandLogoProps = {
  to?: string;
  /** Hauteur visuelle du lockup (le fichier inclut déjà le wordmark). */
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * `full` — logo entier (landing publique).
   * `wordmark` — même asset, taille header / auth.
   * `mark` — icône JR seule (crop de la partie gauche).
   */
  lockup?: "full" | "wordmark" | "mark";
  className?: string;
  onClick?: () => void;
};

const HEIGHT: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-8",
  md: "h-10",
  lg: "h-12",
  xl: "h-16",
};

/** Cadre carré pour le monogramme (partie gauche du PNG). */
const MARK_CLIP: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
  xl: "h-14 w-14",
};

function useThemeLogoUrl() {
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" ? isResolvedDark() : false
  );

  useEffect(() => {
    const sync = () => setDark(isResolvedDark());
    sync();
    return subscribeResolvedTheme(sync);
  }, []);

  // Mode sombre → logo-sombre ; mode clair → logo-clair
  return dark ? logoSombre : logoClair;
}

export function BrandLogo({
  to = "/",
  size = "md",
  lockup = "wordmark",
  className = "",
  onClick,
}: BrandLogoProps) {
  const logoUrl = useThemeLogoUrl();

  const img =
    lockup === "mark" ? (
      <span
        className={`inline-flex shrink-0 items-center justify-start overflow-hidden ${MARK_CLIP[size]} ${className}`}
      >
        <img
          src={logoUrl}
          alt="JobRadar"
          className="block h-full w-auto max-w-none object-cover object-left"
          decoding="async"
        />
      </span>
    ) : (
      <img
        src={logoUrl}
        alt="JobRadar"
        className={`block ${HEIGHT[size]} w-auto max-w-[min(100%,16rem)] object-contain object-left ${className}`}
        decoding="async"
      />
    );

  if (!to) return img;

  return (
    <Link
      to={to}
      onClick={onClick}
      className="inline-flex items-center leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)]"
      aria-label="JobRadar — accueil"
    >
      {img}
    </Link>
  );
}
