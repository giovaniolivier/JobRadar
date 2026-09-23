import { Link } from "react-router-dom";
import logoUrl from "../assets/logo/logo.png";

type BrandLogoProps = {
  to?: string;
  /** Hauteur visuelle du lockup (le fichier inclut déjà le wordmark). */
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
};

const HEIGHT: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-9",
  md: "h-11",
  lg: "h-16",
};

export function BrandLogo({
  to = "/",
  size = "md",
  className = "",
  onClick,
}: BrandLogoProps) {
  const img = (
    <img
      src={logoUrl}
      alt="JobRadar — Intelligent ATS & Job Scanner"
      className={`${HEIGHT[size]} w-auto max-w-[min(100%,16rem)] object-contain object-left ${className}`}
      decoding="async"
    />
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
