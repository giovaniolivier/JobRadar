import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, downloadDataExport, type UserSettings } from "../lib/api";
import { useLocale, type AppLocale } from "../lib/i18n";
import { applyTheme, type ThemePreference } from "../lib/theme";

type Choice<T extends string> = { id: T; label: string };

const DATE_FORMATS: Choice<string>[] = [
  { id: "fr-FR", label: "23 sept. 2026" },
  { id: "en-GB", label: "23 Sep 2026" },
  { id: "en-US", label: "Sep 23, 2026" },
];

const CURRENCIES: Choice<string>[] = [
  { id: "EUR", label: "EUR (€)" },
  { id: "USD", label: "USD ($)" },
  { id: "GBP", label: "GBP (£)" },
  { id: "CHF", label: "CHF" },
];

const DEFAULTS: UserSettings = {
  emailNotifications: true,
  inAppNotifications: true,
  notifyHighScore: true,
  notifyFollowUp: true,
  notifyInterview: true,
  notifyWeeklyDigest: false,
  digestFrequency: "weekly",
  theme: "system",
  locale: "fr",
  dateFormat: "fr-FR",
  currency: "EUR",
};

const SETTINGS_TABS = [
  { id: "notifications", labelKey: "settings.notifications" as const },
  { id: "appearance", labelKey: "settings.appearance" as const },
  { id: "locale", labelKey: "settings.tabLocale" as const },
  { id: "privacy", labelKey: "settings.tabPrivacy" as const },
  { id: "integrations", labelKey: "settings.integrations" as const },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} — ${checked ? t("toggle.on") : t("toggle.off")}`}
      title={checked ? t("toggle.onTitle") : t("toggle.offTitle")}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex h-11 min-w-14 shrink-0 items-center justify-center disabled:opacity-50"
    >
      <span
        aria-hidden
        className={
          checked
            ? "flex h-7 w-12 items-center justify-end border-2 border-[var(--amber-ui)] bg-[var(--amber-ui)] px-0.5"
            : "flex h-7 w-12 items-center justify-start border-2 border-[var(--hairline)] bg-[var(--paper-deep)] px-0.5"
        }
      >
        <span
          className={
            checked
              ? "block h-[1.15rem] w-[1.15rem] bg-[var(--paper-lift)]"
              : "block h-[1.15rem] w-[1.15rem] bg-[var(--ink)]/55"
          }
        />
      </span>
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: Choice<T>[];
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const on = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(opt.id)}
            className={
              on
                ? "inline-flex min-h-11 items-center border border-[var(--amber)] bg-[var(--amber)] px-3 py-2 text-sm font-medium text-[var(--amber-fg)]"
                : "inline-flex min-h-11 items-center border border-[var(--hairline)] bg-transparent px-3 py-2 text-sm text-[var(--ink)]/75 hover:border-[var(--ink)] hover:text-[var(--ink)]"
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingRow({
  title,
  description,
  control,
}: {
  title: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-[var(--ink)]">{title}</p>
        {description && (
          <p className="mt-0.5 text-sm text-[var(--ink)]/75">{description}</p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingsPage() {
  const { t, setLocale } = useLocale();
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("notifications");
  const ready = useRef(false);
  const saveTimer = useRef<number | null>(null);
  /** Uniquement les champs modifiés — un changement de thème n’écrase jamais les notifs. */
  const pendingPatch = useRef<Partial<UserSettings>>({});

  const themes: Choice<ThemePreference>[] = [
    { id: "light", label: t("settings.themeLight") },
    { id: "dark", label: t("settings.themeDark") },
    { id: "system", label: t("settings.themeSystem") },
  ];
  const locales: Choice<AppLocale>[] = [
    { id: "fr", label: "Français" },
    { id: "en", label: "English" },
  ];

  function coerceSettings(data: Partial<UserSettings>): UserSettings {
    return {
      emailNotifications: Boolean(data.emailNotifications ?? DEFAULTS.emailNotifications),
      inAppNotifications: Boolean(data.inAppNotifications ?? DEFAULTS.inAppNotifications),
      notifyHighScore: Boolean(data.notifyHighScore ?? DEFAULTS.notifyHighScore),
      notifyFollowUp: Boolean(data.notifyFollowUp ?? DEFAULTS.notifyFollowUp),
      notifyInterview: Boolean(data.notifyInterview ?? DEFAULTS.notifyInterview),
      notifyWeeklyDigest: Boolean(data.notifyWeeklyDigest ?? DEFAULTS.notifyWeeklyDigest),
      digestFrequency: data.digestFrequency ?? DEFAULTS.digestFrequency,
      theme: data.theme ?? DEFAULTS.theme,
      locale: data.locale ?? DEFAULTS.locale,
      dateFormat: data.dateFormat ?? DEFAULTS.dateFormat,
      currency: data.currency ?? DEFAULTS.currency,
      updatedAt: data.updatedAt,
    };
  }

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "notifications") setSettingsTab("notifications");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<UserSettings>("/settings");
        if (cancelled) return;
        const next = coerceSettings(data);
        setSettings(next);
        if (next.theme === "light" || next.theme === "dark" || next.theme === "system") {
          applyTheme(next.theme);
        }
        if (next.locale === "fr" || next.locale === "en") {
          setLocale(next.locale);
        }
        pendingPatch.current = {};
        window.setTimeout(() => {
          ready.current = true;
        }, 0);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("settings.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function scheduleSave() {
    if (!ready.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void (async () => {
        const body = { ...pendingPatch.current };
        pendingPatch.current = {};
        if (Object.keys(body).length === 0) return;
        setError(null);
        try {
          await api<UserSettings>("/settings", {
            method: "PUT",
            body: JSON.stringify(body),
          });
          setSavedHint(t("settings.saved"));
          window.setTimeout(() => setSavedHint(null), 2000);
        } catch (err) {
          pendingPatch.current = { ...body, ...pendingPatch.current };
          setError(err instanceof Error ? err.message : t("settings.saveError"));
        }
      })();
    }, 700);
  }

  function patch(partial: Partial<UserSettings>) {
    if (partial.theme === "light" || partial.theme === "dark" || partial.theme === "system") {
      applyTheme(partial.theme);
    }
    if (partial.locale === "fr" || partial.locale === "en") {
      setLocale(partial.locale);
    }
    pendingPatch.current = { ...pendingPatch.current, ...partial };
    setSettings((prev) => ({ ...prev, ...partial }));
    scheduleSave();
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  async function onExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadDataExport();
      setSavedHint(t("settings.exported"));
      window.setTimeout(() => setSavedHint(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.exportError"));
    } finally {
      setExporting(false);
    }
  }

  function tabPanelClass(id: SettingsTab) {
    return settingsTab === id ? "block" : "hidden lg:block";
  }

  if (loading) return <p className="label">{t("settings.loading")}</p>;

  return (
    <div className="fade-in max-w-2xl pb-16">
      <header className="border-b border-[var(--hairline)] pb-4">
        <p className="label">{t("settings.eyebrow")}</p>
        <h1 className="mt-1 text-3xl sm:text-4xl">{t("settings.title")}</h1>
        <p className="mt-2 max-w-xl text-[var(--ink)]/75">{t("settings.subtitle")}</p>
        {savedHint && (
          <p className="mono mt-3 text-sm" style={{ color: "var(--match)" }} role="status">
            {savedHint}
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm" style={{ color: "var(--brick)" }} role="alert">
            {error}
          </p>
        )}
      </header>

      {/* Onglets mobile — une section à la fois */}
      <div
        className="sticky top-[3.25rem] z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-[var(--hairline)] bg-[var(--paper)]/95 px-4 py-2 backdrop-blur-[2px] lg:hidden"
        role="tablist"
        aria-label={t("settings.title")}
      >
        {SETTINGS_TABS.map((s) => {
          const active = settingsTab === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`min-h-10 shrink-0 whitespace-nowrap px-3 py-2 text-center text-[0.7rem] font-medium tracking-wide transition-colors ${
                active
                  ? "border border-[var(--amber)] text-[var(--amber)]"
                  : "border border-[var(--hairline)] text-[var(--ink)]/70"
              }`}
              onClick={() => setSettingsTab(s.id)}
            >
              {t(s.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-8 lg:mt-8 lg:space-y-10">
      <section
        id="notifications"
        role="tabpanel"
        className={`${tabPanelClass("notifications")} space-y-1 border-b border-[var(--hairline)] pb-8 lg:pb-10`}
      >
        <h2 className="text-xl">{t("settings.notifications")}</h2>
        <p className="text-sm text-[var(--ink)]/75">{t("settings.notificationsHint")}</p>

        <div className="mt-4 divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
          <SettingRow
            title={t("settings.email")}
            description={t("settings.emailHint")}
            control={
              <Toggle
                label={t("settings.emailToggle")}
                checked={settings.emailNotifications}
                onChange={(v) => patch({ emailNotifications: v })}
              />
            }
          />
          <SettingRow
            title={t("settings.inApp")}
            description={t("settings.inAppHint")}
            control={
              <Toggle
                label={t("settings.inAppToggle")}
                checked={settings.inAppNotifications}
                onChange={(v) => patch({ inAppNotifications: v })}
              />
            }
          />
        </div>

        <p className="label mt-6">{t("settings.events")}</p>
        <div className="mt-2 divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
          <SettingRow
            title={t("settings.highScore")}
            description={t("settings.highScoreHint")}
            control={
              <Toggle
                label={t("settings.highScoreToggle")}
                checked={settings.notifyHighScore}
                onChange={(v) => patch({ notifyHighScore: v })}
              />
            }
          />
          <SettingRow
            title={t("settings.followUp")}
            description={t("settings.followUpHint")}
            control={
              <Toggle
                label={t("settings.followUpToggle")}
                checked={settings.notifyFollowUp}
                onChange={(v) => patch({ notifyFollowUp: v })}
              />
            }
          />
          <SettingRow
            title={t("settings.interview")}
            description={t("settings.interviewHint")}
            control={
              <Toggle
                label={t("settings.interviewToggle")}
                checked={settings.notifyInterview}
                onChange={(v) => patch({ notifyInterview: v })}
              />
            }
          />
          <SettingRow
            title={t("settings.digest")}
            description={t("settings.digestHint")}
            control={
              <Toggle
                label={t("settings.digestToggle")}
                checked={settings.notifyWeeklyDigest}
                onChange={(v) => patch({ notifyWeeklyDigest: v })}
              />
            }
          />
        </div>

        {settings.notifyWeeklyDigest && (
          <div className="mt-4">
            <span className="label mb-1.5 block">{t("settings.digestFrequency")}</span>
            <Segmented
              ariaLabel={t("settings.digestFrequency")}
              value={settings.digestFrequency}
              options={[
                { id: "daily", label: t("settings.daily") },
                { id: "weekly", label: t("settings.weekly") },
              ]}
              onChange={(id) => patch({ digestFrequency: id })}
            />
          </div>
        )}
      </section>

      <section
        role="tabpanel"
        className={`${tabPanelClass("appearance")} space-y-3 border-b border-[var(--hairline)] pb-10`}
      >
        <h2 className="text-xl">{t("settings.appearance")}</h2>
        <p className="text-sm text-[var(--ink)]/75">{t("settings.appearanceHint")}</p>
        <Segmented
          ariaLabel={t("settings.theme")}
          value={settings.theme}
          options={themes}
          onChange={(id) => patch({ theme: id })}
        />
      </section>

      <section
        role="tabpanel"
        className={`${tabPanelClass("locale")} space-y-5 border-b border-[var(--hairline)] pb-10`}
      >
        <div>
          <h2 className="text-xl">{t("settings.localeRegion")}</h2>
          <p className="mt-1 text-sm text-[var(--ink)]/75">{t("settings.localeRegionHint")}</p>
        </div>
        <div>
          <span className="label mb-1.5 block">{t("settings.uiLanguage")}</span>
          <Segmented
            ariaLabel={t("settings.language")}
            value={settings.locale}
            options={locales}
            onChange={(id) => patch({ locale: id })}
          />
        </div>
        <div>
          <span className="label mb-1.5 block">{t("settings.dateFormat")}</span>
          <Segmented
            ariaLabel={t("settings.dateFormat")}
            value={settings.dateFormat}
            options={DATE_FORMATS}
            onChange={(id) => patch({ dateFormat: id })}
          />
        </div>
        <div>
          <span className="label mb-1.5 block">{t("settings.currency")}</span>
          <Segmented
            ariaLabel={t("settings.currencyLabel")}
            value={settings.currency}
            options={CURRENCIES}
            onChange={(id) => patch({ currency: id })}
          />
        </div>
      </section>

      <section
        role="tabpanel"
        className={`${tabPanelClass("privacy")} space-y-4 border-b border-[var(--hairline)] pb-10`}
      >
        <div>
          <h2 className="text-xl">{t("settings.privacy")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink)]/75">
            {t("settings.privacyBody")}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            className="btn btn-ghost w-full sm:w-auto"
            disabled={exporting}
            onClick={() => void onExport()}
          >
            {exporting ? t("settings.exporting") : t("settings.export")}
          </button>
          <Link
            to="/legal/privacy"
            className="text-sm underline decoration-[var(--amber)] underline-offset-4"
          >
            {t("settings.privacyPolicy")}
          </Link>
        </div>
        <p className="text-xs text-[var(--ink)]/70">
          {t("settings.exportHintBefore")}{" "}
          <Link to="/profile" className="underline underline-offset-2">
            {t("settings.exportHintLink")}
          </Link>
          {t("settings.exportHintAfter")}
        </p>
      </section>

      <section role="tabpanel" className={`${tabPanelClass("integrations")} space-y-4`}>
        <div>
          <h2 className="text-xl">{t("settings.integrations")}</h2>
          <p className="mt-1 text-sm text-[var(--ink)]/75">{t("settings.integrationsHint")}</p>
        </div>
        <div className="space-y-3 opacity-70">
          <div className="flex flex-col gap-2 border border-[var(--hairline)] px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <p className="font-medium">{t("settings.browserExt")}</p>
              <p className="mt-0.5 text-sm text-[var(--ink)]/75">{t("settings.browserExtHint")}</p>
            </div>
            <span className="label shrink-0">{t("settings.soon")}</span>
          </div>
          <div className="flex flex-col gap-2 border border-[var(--hairline)] px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <p className="font-medium">{t("settings.calendar")}</p>
              <p className="mt-0.5 text-sm text-[var(--ink)]/75">{t("settings.calendarHint")}</p>
            </div>
            <span className="label shrink-0">{t("settings.soon")}</span>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
