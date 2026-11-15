import type { CSSProperties } from "react";

/** Bloc de chargement animé (placeholder). Purement décoratif (aria-hidden). */
export function Skeleton({
  className = "",
  w,
  h,
  rounded = "4px",
  style,
}: {
  className?: string;
  w?: string | number;
  h?: string | number;
  rounded?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      aria-hidden="true"
      style={{ width: w, height: h, borderRadius: rounded, ...style }}
    />
  );
}

/** Lignes de texte simulées (la dernière plus courte). */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} h={12} w={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}

/**
 * Région de chargement accessible : annonce « en cours de chargement » aux
 * lecteurs d'écran, tout en montrant les squelettes visuels.
 */
export function SkeletonRegion({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Squelette de la liste d'offres (reflète la carte : pastille score + titre + lignes). */
export function OffersSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="mt-6 divide-y divide-(--hairline) border-y border-(--hairline)">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 py-5">
          <Skeleton w={44} h={44} rounded="999px" className="shrink-0" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton h={14} w="55%" />
            <Skeleton h={11} w="32%" />
            <Skeleton h={11} w="24%" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Squelette du tableau de bord : 3 cartes de stats + liste d'offres prioritaires. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton h={12} w={120} className="mb-3" />
        <Skeleton h={30} w="45%" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-(--hairline) p-4">
            <Skeleton h={11} w="60%" className="mb-3" />
            <Skeleton h={26} w={64} />
          </div>
        ))}
      </div>
      <OffersSkeleton rows={3} />
    </div>
  );
}

/** Squelette du pipeline : 4 colonnes avec quelques cartes. */
export function PipelineSkeleton() {
  return (
    <div className="mt-8 grid gap-0 border-t border-(--ink) lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, col) => (
        <div
          key={col}
          className="border-b border-(--hairline) py-4 lg:border-b-0 lg:px-3 lg:[&:not(:first-child)]:border-l lg:[&:not(:first-child)]:border-(--hairline)"
        >
          <div className="mb-3 flex items-baseline justify-between border-b border-(--hairline) pb-2">
            <Skeleton h={11} w={80} />
            <Skeleton h={11} w={16} />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="border border-(--hairline) p-3 space-y-2">
                <Skeleton h={12} w="70%" />
                <Skeleton h={10} w="45%" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Squelette générique de page/formulaire : en-tête + quelques champs. */
export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-3 border-b border-(--hairline) pb-4">
        <Skeleton h={12} w={110} />
        <Skeleton h={30} w="40%" />
        <Skeleton h={12} w="70%" />
      </div>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton h={11} w={130} />
          <Skeleton h={38} w="100%" rounded="2px" />
        </div>
      ))}
    </div>
  );
}
