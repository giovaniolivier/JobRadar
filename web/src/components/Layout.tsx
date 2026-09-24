import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useLocale } from "../lib/i18n";
import { AnalyzeOfferProvider, useAnalyzeOffer } from "./AnalyzeOfferPanel";
import { BrandLogo } from "./BrandLogo";
import { NotificationsMenu } from "./NotificationsMenu";

function initials(name: string | undefined, email: string | undefined) {
  const source = (name?.trim() || email?.trim() || "?").split(/\s+/);
  if (source.length >= 2) {
    return `${source[0]![0] ?? ""}${source[1]![0] ?? ""}`.toUpperCase();
  }
  return (source[0] ?? "?").slice(0, 2).toUpperCase();
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `label whitespace-nowrap py-1 transition-colors ${
    isActive ? "text-[var(--ink)] border-b border-[var(--amber)]" : "hover:text-[var(--ink)]"
  }`;

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.65rem] font-medium tracking-wide transition-colors ${
    isActive ? "!text-[var(--amber)]" : "!text-[var(--ink-soft)]"
  }`;

const TABS = [
  { to: "/dashboard", end: true, labelKey: "nav.dashboardShort" as const, icon: DashboardIcon },
  { to: "/offers", end: false, labelKey: "nav.offersShort" as const, icon: OffersIcon },
  { to: "/pipeline", end: false, labelKey: "nav.pipelineShort" as const, icon: PipelineIcon },
  { to: "/profile", end: false, labelKey: "nav.profileShort" as const, icon: ProfileIcon },
];

export function Layout() {
  return (
    <AnalyzeOfferProvider>
      <LayoutShell />
    </AnalyzeOfferProvider>
  );
}

function LayoutShell() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const { openAnalyze } = useAnalyzeOffer();
  const hideFab =
    location.pathname.startsWith("/profile") || location.pathname.startsWith("/settings");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-[var(--ink)] bg-[var(--paper)]/95 backdrop-blur-[2px]">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-2 sm:gap-x-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-x-8 lg:py-2">
          {/* Left — wordmark compact on mobile, full on desktop */}
          <div className="flex min-w-0 items-center">
            <span className="inline-flex items-center lg:hidden">
              <BrandLogo to="/dashboard" size="sm" lockup="wordmark" />
            </span>
            <span className="hidden items-center lg:inline-flex">
              <BrandLogo to="/dashboard" size="lg" lockup="wordmark" />
            </span>
          </div>

          {/* Center — main nav (desktop) */}
          <nav className="hidden items-center justify-center gap-x-7 lg:flex" aria-label={t("nav.primary")}>
            <NavLink to="/dashboard" end className={linkClass}>
              {t("nav.dashboard")}
            </NavLink>
            <NavLink to="/offers" className={linkClass}>
              {t("nav.offers")}
            </NavLink>
            <NavLink to="/pipeline" className={linkClass}>
              {t("nav.pipeline")}
            </NavLink>
            <NavLink to="/profile" className={linkClass}>
              {t("nav.profile")}
            </NavLink>
          </nav>

          {/* Right — actions */}
          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <button
              type="button"
              className="btn btn-amber !hidden !py-2 !text-xs lg:!inline-flex lg:!text-sm"
              onClick={() => openAnalyze()}
            >
              {t("nav.newOffer")}
            </button>

            <NotificationsMenu />

            <UserMenu
              name={user?.name}
              email={user?.email}
              onAccount={() => navigate("/profile")}
              onSettings={() => navigate("/settings")}
              onLogout={() => void logout()}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-8 lg:py-10 lg:pb-10">
        <Outlet />
      </main>

      {/* FAB — nouvelle offre (mobile) ; masqué sur profil/réglages et pendant bottom sheet */}
      {!hideFab && (
        <button
          type="button"
          className="mobile-fab fixed z-40 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--ink)] bg-[var(--amber)] text-[var(--amber-fg)] shadow-lg transition-transform active:scale-95 lg:hidden"
          style={{
            right: "max(1rem, env(safe-area-inset-right, 0px))",
            bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))",
          }}
          aria-label={t("nav.newOfferShort")}
          onClick={() => openAnalyze()}
        >
          <PlusIcon />
        </button>
      )}

      {/* Tab bar (mobile) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--ink)] bg-[var(--paper)]/95 backdrop-blur-[2px] lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label={t("nav.primary")}
      >
        <div className="mx-auto flex max-w-6xl items-stretch">
          {TABS.map(({ to, end, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                tabClass({
                  isActive:
                    isActive ||
                    (to === "/profile" && location.pathname.startsWith("/settings")),
                })
              }
            >
              {({ isActive }) => {
                const active =
                  isActive ||
                  (to === "/profile" && location.pathname.startsWith("/settings"));
                return (
                  <>
                    <Icon active={active} />
                    <span className="max-w-full truncate">{t(labelKey)}</span>
                  </>
                );
              }}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function UserMenu({
  name,
  email,
  onAccount,
  onSettings,
  onLogout,
}: {
  name?: string;
  email?: string;
  onAccount: () => void;
  onSettings: () => void;
  onLogout: () => void;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if ((e.target as Element | null)?.closest?.("[data-account-panel]")) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    const mq = window.matchMedia("(max-width: 1023px)");
    if (mq.matches) {
      document.body.style.overflow = "hidden";
      document.body.dataset.mobileSheet = "1";
    }
    return () => {
      document.body.style.overflow = prev;
      delete document.body.dataset.mobileSheet;
    };
  }, [open]);

  function closeAnd(action: () => void) {
    setOpen(false);
    action();
    triggerRef.current?.focus();
  }

  const identity = (
    <div className="border-b border-[var(--hairline)] px-4 py-3 lg:px-3 lg:py-2.5">
      <p className="truncate text-sm font-medium" title={name}>
        {name}
      </p>
      <p className="truncate text-xs text-[var(--ink-soft)]" title={email}>
        {email}
      </p>
    </div>
  );

  const items = (
    <>
      <div className="py-1">
        <MenuItem onClick={() => closeAnd(onAccount)}>{t("nav.myAccount")}</MenuItem>
        <MenuItem onClick={() => closeAnd(onSettings)}>{t("nav.settings")}</MenuItem>
      </div>
      <div className="border-t border-[var(--hairline)] py-1">
        <MenuItem onClick={() => closeAnd(onLogout)} tone="danger">
          {t("nav.logout")}
        </MenuItem>
      </div>
    </>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--paper-lift)] text-xs font-semibold tracking-wide text-[var(--ink)] transition-colors hover:border-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)] lg:h-9 lg:w-9"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="menu"
        aria-label={t("nav.accountMenu")}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span aria-hidden="true">{initials(name, email)}</span>
      </button>

      {open &&
        createPortal(
          <>
            {/* Mobile — bottom sheet */}
            <div className="fixed inset-0 z-[60] lg:hidden" role="presentation" data-account-panel>
              <button
                type="button"
                className="absolute inset-0 bg-[var(--paper-deep)]/70"
                aria-label={t("nav.closeMenu")}
                onClick={() => setOpen(false)}
              />
              <div
                id={panelId}
                role="menu"
                aria-label={t("nav.accountMenu")}
                className="absolute inset-x-0 bottom-0 border-t border-[var(--ink)] bg-[var(--paper-lift)] shadow-lg"
                style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
              >
                <div className="mx-auto mb-1 mt-2 h-1 w-10 rounded-full bg-[var(--hairline)]" aria-hidden />
                {identity}
                {items}
              </div>
            </div>

            {/* Desktop — anchored dropdown */}
            <div
              data-account-panel
              role="menu"
              aria-label={t("nav.accountMenu")}
              className="fixed z-[60] hidden w-56 border border-[var(--ink)] bg-[var(--paper-lift)] shadow-lg lg:block"
              style={(() => {
                const rect = triggerRef.current?.getBoundingClientRect();
                if (!rect) return { top: 0, right: 16 };
                const width = 224;
                let left = rect.right - width;
                left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
                return { top: rect.bottom + 8, left };
              })()}
            >
              {identity}
              {items}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  tone = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`block w-full px-4 py-3.5 text-left text-sm transition-colors hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)] focus-visible:outline-none lg:px-3 lg:py-2.5 ${
        tone === "danger" ? "text-[var(--brick)]" : ""
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5Z"
        stroke="currentColor"
        strokeWidth={active ? "1.8" : "1.5"}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OffersIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7"
        stroke="currentColor"
        strokeWidth={active ? "1.8" : "1.5"}
        strokeLinecap="round"
      />
      <rect
        x="4"
        y="7"
        width="16"
        height="14"
        rx="1.5"
        stroke="currentColor"
        strokeWidth={active ? "1.8" : "1.5"}
      />
      <path d="M4 12h16" stroke="currentColor" strokeWidth={active ? "1.8" : "1.5"} />
    </svg>
  );
}

function PipelineIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"
        stroke="currentColor"
        strokeWidth={active ? "1.8" : "1.5"}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="12"
        cy="8"
        r="3.5"
        stroke="currentColor"
        strokeWidth={active ? "1.8" : "1.5"}
      />
      <path
        d="M5 19.5c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8"
        stroke="currentColor"
        strokeWidth={active ? "1.8" : "1.5"}
        strokeLinecap="round"
      />
    </svg>
  );
}
