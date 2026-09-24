import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Job } from "../lib/api";
import { useLocale, type AppLocale } from "../lib/i18n";
import { useAnalyzeOffer } from "./AnalyzeOfferPanel";

type NotificationType = "high_score" | "followup" | "interview" | "digest";

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  jobId?: string;
  applicationId?: string;
  createdAt: string;
};

const SEEN_KEY = "jobradar_notif_seen";
const PREVIEW_LIMIT = 12;

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

function relativeTime(iso: string, locale: AppLocale): string {
  const then = +new Date(iso);
  if (Number.isNaN(then)) return "";
  const deltaMs = then - Date.now(); // negative = past
  const abs = Math.abs(deltaMs);
  const rtf = new Intl.RelativeTimeFormat(locale === "en" ? "en" : "fr", { numeric: "auto" });
  const sign = deltaMs < 0 ? -1 : 1;

  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return locale === "en" ? "Just now" : "À l’instant";
  if (minutes < 60) return rtf.format(sign * minutes, "minute");

  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(sign * hours, "hour");

  const days = Math.round(hours / 24);
  if (days < 7) return rtf.format(sign * days, "day");

  const weeks = Math.round(days / 7);
  if (weeks < 5) return rtf.format(sign * weeks, "week");

  return new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", {
    day: "numeric",
    month: "short",
  });
}

const TYPE_DOT: Record<NotificationType, string> = {
  high_score: "var(--amber)",
  followup: "var(--brick)",
  interview: "var(--match)",
  digest: "var(--ink-soft)",
};

export function NotificationsMenu() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const { openOfferDetail } = useAnalyzeOffer();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => readSeen());
  const [busyId, setBusyId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
  }, [open]);

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

  const unread = items.filter((i) => !seen.has(i.id)).length;
  const preview = items.slice(0, PREVIEW_LIMIT);

  function markSeen(ids: string[]) {
    const next = new Set(seen);
    for (const id of ids) next.add(id);
    setSeen(next);
    writeSeen(next);
  }

  function markAllSeen() {
    markSeen(items.map((i) => i.id));
  }

  async function handleItemClick(item: NotificationItem) {
    markSeen([item.id]);
    setOpen(false);

    if (item.type === "high_score" && item.jobId) {
      setBusyId(item.id);
      try {
        const job = await api<Job>(`/offers/${item.jobId}`);
        openOfferDetail(job);
      } catch {
        navigate(item.href);
      } finally {
        setBusyId(null);
      }
      return;
    }

    if ((item.type === "followup" || item.type === "interview") && item.applicationId) {
      navigate(`/pipeline?app=${item.applicationId}`);
      return;
    }

    navigate(item.href || "/dashboard");
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="relative inline-flex h-11 w-11 items-center justify-center border border-[var(--ink)] bg-transparent text-[var(--ink)] transition-colors hover:bg-[var(--ghost-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)] lg:h-9 lg:w-9"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="menu"
        aria-label={
          unread ? t("nav.notificationsUnread", { n: unread }) : t("nav.notifications")
        }
        onClick={() => setOpen((v) => !v)}
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
          aria-label={t("nav.notifications")}
          className="absolute right-0 z-40 mt-2 w-[min(100vw-2rem,22rem)] border border-[var(--ink)] bg-[var(--paper-lift)] shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
            <p className="label">{t("nav.notifications")}</p>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"
                onClick={markAllSeen}
              >
                {t("nav.notificationsMarkAll")}
              </button>
            )}
          </div>

          {preview.length === 0 ? (
            <p className="px-3 py-5 text-sm text-[var(--ink-soft)]">
              {t("nav.notificationsEmpty")}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto overscroll-contain">
              {preview.map((item) => {
                const isUnread = !seen.has(item.id);
                return (
                  <li key={item.id} className="border-b border-[var(--hairline)] last:border-0">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={busyId === item.id}
                      className={`flex w-full gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--row-hover)] ${
                        isUnread ? "bg-[var(--row-hover)]/60" : ""
                      }`}
                      onClick={() => void handleItemClick(item)}
                    >
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: TYPE_DOT[item.type] }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span
                            className={`text-sm leading-snug ${
                              isUnread ? "font-medium text-[var(--ink)]" : "text-[var(--ink)]/90"
                            }`}
                          >
                            {item.title}
                          </span>
                          {isUnread && (
                            <span
                              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--amber)]"
                              aria-label={t("nav.notificationsUnreadDot")}
                            />
                          )}
                        </span>
                        {item.body && (
                          <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                            {item.body}
                          </span>
                        )}
                        <span className="mono mt-1.5 block text-[0.65rem] text-[var(--ink-soft)]">
                          {relativeTime(item.createdAt, locale)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-[var(--hairline)] px-3 py-2">
            <Link
              to="/settings#notifications"
              role="menuitem"
              className="text-xs text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"
              onClick={() => setOpen(false)}
            >
              {t("nav.notificationsSettings")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9a6 6 0 1 1 12 0c0 3.2.8 4.8 1.5 5.8.3.4 0 1.2-.6 1.2H5.1c-.6 0-.9-.8-.6-1.2C5.2 13.8 6 12.2 6 9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M10 18a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
