import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLocale } from "../lib/i18n";
import { AnalyzeOfferProvider, useAnalyzeOffer } from "./AnalyzeOfferPanel";
import { BrandLogo } from "./BrandLogo";

type NotificationItem = {
  id: string;
  type: "followup" | "response" | "high_score";
  title: string;
  body: string;
  href: string;
  createdAt: string;
};

const SEEN_KEY = "jobradar_notif_seen";

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>) {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
}

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
  const { openAnalyze } = useAnalyzeOffer();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--ink)] bg-[var(--paper)]/95 backdrop-blur-[2px]">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-4 px-4 py-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-x-8 lg:py-2">
          {/* Left — logo */}
          <div className="min-w-0">
            <BrandLogo to="/" size="lg" onClick={() => setMobileOpen(false)} />
          </div>

          {/* Center — main nav (desktop) */}
          <nav className="hidden items-center justify-center gap-x-7 lg:flex">
            <NavLink to="/" end className={linkClass}>
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
              className="btn btn-amber !hidden !py-2 !text-xs sm:!inline-flex sm:!text-sm"
              onClick={() => {
                setMobileOpen(false);
                openAnalyze();
              }}
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

            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center border border-[var(--ink)] bg-transparent text-[var(--ink)] lg:hidden"
              aria-expanded={mobileOpen}
              aria-label={t("nav.openMenu")}
              onClick={() => setMobileOpen((v) => !v)}
            >
              <MenuIcon open={mobileOpen} />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="border-t border-[var(--hairline)] px-4 py-3 lg:hidden">
            <div className="flex flex-col gap-3">
              <NavLink to="/" end className={linkClass} onClick={() => setMobileOpen(false)}>
                {t("nav.dashboard")}
              </NavLink>
              <NavLink to="/offers" className={linkClass} onClick={() => setMobileOpen(false)}>
                {t("nav.offers")}
              </NavLink>
              <NavLink to="/pipeline" className={linkClass} onClick={() => setMobileOpen(false)}>
                {t("nav.pipeline")}
              </NavLink>
              <NavLink to="/profile" className={linkClass} onClick={() => setMobileOpen(false)}>
                {t("nav.profile")}
              </NavLink>
              <button
                type="button"
                className="btn btn-amber mt-1 w-full sm:hidden"
                onClick={() => {
                  setMobileOpen(false);
                  openAnalyze();
                }}
              >
                {t("nav.newOffer")}
              </button>
            </div>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}

function NotificationsMenu() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => readSeen());
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    let cancelled = false;
    void api<{ items: NotificationItem[] }>("/notifications")
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unread = items.filter((i) => !seen.has(i.id)).length;

  function markAllSeen() {
    const next = new Set(seen);
    for (const i of items) next.add(i.id);
    setSeen(next);
    writeSeen(next);
  }

  function openPanel() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) markAllSeen();
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="relative inline-flex h-9 w-9 items-center justify-center border border-[var(--ink)] bg-transparent text-[var(--ink)] transition-colors hover:bg-[var(--ghost-hover)]"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          unread ? t("nav.notificationsUnread", { n: unread }) : t("nav.notifications")
        }
        onClick={openPanel}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brick)] px-1 text-[0.65rem] font-semibold text-[var(--paper-lift)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="menu"
          className="absolute right-0 z-40 mt-2 w-[min(100vw-2rem,20rem)] border border-[var(--ink)] bg-[var(--paper-lift)] shadow-lg"
        >
          <div className="border-b border-[var(--hairline)] px-3 py-2">
            <p className="label">{t("nav.notifications")}</p>
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--ink-soft)]">{t("nav.notificationsEmpty")}</p>
          ) : (
            <ul className="max-h-80 overflow-auto">
              {items.map((item) => (
                <li key={item.id} className="border-b border-[var(--hairline)] last:border-0">
                  <Link
                    to={item.href}
                    role="menuitem"
                    className="block px-3 py-3 transition-colors hover:bg-[var(--row-hover)]"
                    onClick={() => setOpen(false)}
                  >
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--ink-soft)]">{item.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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

  function closeAnd(action: () => void) {
    setOpen(false);
    action();
    triggerRef.current?.focus();
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--paper-lift)] text-xs font-semibold tracking-wide text-[var(--ink)] transition-colors hover:border-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)]"
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
      {open && (
        <div
          id={panelId}
          role="menu"
          aria-label={t("nav.accountMenu")}
          className="absolute right-0 z-40 mt-2 w-56 border border-[var(--ink)] bg-[var(--paper-lift)] shadow-lg"
        >
          <div className="border-b border-[var(--hairline)] px-3 py-2.5">
            <p className="truncate text-sm font-medium" title={name}>
              {name}
            </p>
            <p className="truncate text-xs text-[var(--ink-soft)]" title={email}>
              {email}
            </p>
          </div>
          <div className="py-1">
            <MenuItem onClick={() => closeAnd(onAccount)}>{t("nav.myAccount")}</MenuItem>
            <MenuItem onClick={() => closeAnd(onSettings)}>{t("nav.settings")}</MenuItem>
          </div>
          <div className="border-t border-[var(--hairline)] py-1">
            <MenuItem onClick={() => closeAnd(onLogout)} tone="danger">
              {t("nav.logout")}
            </MenuItem>
          </div>
        </div>
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
      className={`block w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)] focus-visible:outline-none ${
        tone === "danger" ? "text-[var(--brick)]" : ""
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9a6 6 0 1 1 12 0c0 3.2 1 4.4 1.7 5.2.3.3.1.8-.3.8H4.6c-.4 0-.6-.5-.3-.8C5 13.4 6 12.2 6 9Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}
