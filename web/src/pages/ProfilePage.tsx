import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { TagInput } from "../components/TagInput";
import { DeleteAccountPanel } from "../components/DeleteAccountPanel";
import { api, apiForm, type ProfileData, type ProfileResponse } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLocale, type MessageKey } from "../lib/i18n";
import {
  dedupeNormalize,
  formatSalaryDisplay,
  isWorkModeLocationTag,
  parseSalaryDigits,
  workModeFromTag,
} from "../lib/skills";
import { passwordStrength } from "../lib/validation";

type WorkMode = "remote" | "hybrid" | "onsite";

const WORK_MODE_KEYS: { id: WorkMode; key: MessageKey }[] = [
  { id: "remote", key: "profile.workRemote" },
  { id: "hybrid", key: "profile.workHybrid" },
  { id: "onsite", key: "profile.workOnsite" },
];

const SENIORITY_KEYS = [
  { id: "junior", key: "profile.seniorityJunior" },
  { id: "confirme", key: "profile.seniorityConfirme" },
  { id: "senior", key: "profile.senioritySenior" },
  { id: "lead", key: "profile.seniorityLead" },
] as const;

const PROFILE_TAB_IDS = ["cv", "skills", "prefs", "account"] as const;
type ProfileTab = (typeof PROFILE_TAB_IDS)[number];

function formatDate(iso: string | null | undefined, locale: "fr" | "en") {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(+d)) return null;
    return d.toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function SalaryField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const display = focused ? value : formatSalaryDisplay(value);

  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      <input
        className="field mono"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(parseSalaryDigits(e.target.value))}
      />
    </label>
  );
}

export function ProfilePage() {
  const { token, setSession, refreshSession } = useAuth();
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const onboarding = params.get("onboarding") === "1";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [prefsSaved, setPrefsSaved] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const [skills, setSkills] = useState<string[]>([]);
  const [softSkills, setSoftSkills] = useState<string[]>([]);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [experienceYears, setExperienceYears] = useState("");
  const [preferredLocations, setPreferredLocations] = useState<string[]>([]);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [workModes, setWorkModes] = useState<WorkMode[]>([]);
  const [targetSeniority, setTargetSeniority] = useState<string>("");
  const [preferredSectors, setPreferredSectors] = useState<string[]>([]);
  const [avoidedSectors, setAvoidedSectors] = useState<string[]>([]);

  const [cvPreview, setCvPreview] = useState(false);
  const [replacingCv, setReplacingCv] = useState(false);
  const [cvPaste, setCvPaste] = useState("");
  const [cvBusy, setCvBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [accountBusy, setAccountBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const tabFromUrl = params.get("tab");
  const initialTab: ProfileTab =
    tabFromUrl === "account" ||
    tabFromUrl === "cv" ||
    tabFromUrl === "skills" ||
    tabFromUrl === "prefs"
      ? tabFromUrl
      : "cv";
  const [profileTab, setProfileTab] = useState<ProfileTab>(initialTab);

  const prefsTimer = useRef<number | null>(null);
  const prefsReady = useRef(false);
  const accountTimer = useRef<number | null>(null);
  const accountReady = useRef(false);

  const tabMeta: Record<ProfileTab, { short: MessageKey; full?: MessageKey }> = {
    cv: { short: "profile.tabCv" },
    skills: { short: "profile.tabSkills", full: "profile.tabSkillsFull" },
    prefs: { short: "profile.tabPrefs", full: "profile.tabPrefsFull" },
    account: { short: "profile.tabAccount" },
  };

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  }

  function applyProfile(data: ProfileResponse) {
    setName(data.name);
    setEmail(data.email);
    setHasPassword(data.hasPassword);
    setProfile(data.profile);
    const p = data.profile;
    setSkills(dedupeNormalize(p?.skills ?? []));
    setSoftSkills(dedupeNormalize(p?.softSkills ?? []));
    setTargetRoles(dedupeNormalize(p?.targetRoles ?? []));
    setExperienceYears(p?.experienceYears != null ? String(p.experienceYears) : "");
    const geoLocs = (p?.preferredLocations ?? []).filter((l) => !isWorkModeLocationTag(l));
    const modeFromLocs = (p?.preferredLocations ?? [])
      .map(workModeFromTag)
      .filter((m): m is WorkMode => m != null);
    setPreferredLocations(dedupeNormalize(geoLocs));
    setSalaryMin(p?.salaryMin != null ? String(p.salaryMin) : "");
    setSalaryMax(p?.salaryMax != null ? String(p.salaryMax) : "");
    const modes = new Set<WorkMode>([
      ...(p?.workModes ?? []).filter((m): m is WorkMode =>
        ["remote", "hybrid", "onsite"].includes(m)
      ),
      ...modeFromLocs,
    ]);
    setWorkModes([...modes]);
    setTargetSeniority(p?.targetSeniority ?? "");
    setPreferredSectors(dedupeNormalize(p?.preferredSectors ?? []));
    setAvoidedSectors(dedupeNormalize(p?.avoidedSectors ?? []));
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<ProfileResponse>("/profile");
        if (cancelled) return;
        applyProfile(data);
        prefsReady.current = false;
        accountReady.current = false;
        window.setTimeout(() => {
          prefsReady.current = true;
          accountReady.current = true;
        }, 0);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("common.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function savePrefs() {
    if (!prefsReady.current) return;
    setError(null);
    try {
      const data = await api<ProfileResponse>("/profile", {
        method: "PUT",
        body: JSON.stringify({
          skills,
          softSkills,
          targetRoles,
          experienceYears: experienceYears === "" ? null : Number(experienceYears),
          preferredLocations,
          salaryMin: salaryMin === "" ? null : Number(salaryMin),
          salaryMax: salaryMax === "" ? null : Number(salaryMax),
          workModes,
          targetSeniority: targetSeniority || null,
          preferredSectors,
          avoidedSectors,
        }),
      });
      setProfile(data.profile);
      setPrefsSaved(t("profile.prefsSaved"));
      window.setTimeout(() => setPrefsSaved(null), 2500);
      if (onboarding && data.profile?.hasCv) {
        // stay until user finishes
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.errorSave"));
    }
  }

  useEffect(() => {
    if (!prefsReady.current) return;
    if (prefsTimer.current) window.clearTimeout(prefsTimer.current);
    prefsTimer.current = window.setTimeout(() => {
      void savePrefs();
    }, 900);
    return () => {
      if (prefsTimer.current) window.clearTimeout(prefsTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    skills,
    softSkills,
    targetRoles,
    experienceYears,
    preferredLocations,
    salaryMin,
    salaryMax,
    workModes,
    targetSeniority,
    preferredSectors,
    avoidedSectors,
  ]);

  async function saveAccountIdentity() {
    if (!accountReady.current) return;
    setError(null);
    setAccountBusy(true);
    try {
      const data = await api<ProfileResponse>("/profile", {
        method: "PUT",
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      setSession({ id: data.id, email: data.email, name: data.name });
      showToast(t("profile.toastAccount"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.errorUpdate"));
    } finally {
      setAccountBusy(false);
    }
  }

  useEffect(() => {
    if (!accountReady.current) return;
    if (accountTimer.current) window.clearTimeout(accountTimer.current);
    accountTimer.current = window.setTimeout(() => {
      void saveAccountIdentity();
    }, 1000);
    return () => {
      if (accountTimer.current) window.clearTimeout(accountTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, email]);

  async function uploadCvText(text: string, fileName: string) {
    setCvBusy(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; message: string; profile: ProfileData }>(
        "/auth/upload-cv",
        {
          method: "POST",
          body: JSON.stringify({ cvText: text, cvFileName: fileName }),
        }
      );
      setProfile((prev) => ({ ...(prev ?? ({} as ProfileData)), ...res.profile, hasCv: true }));
      setSkills(res.profile.skills);
      setSoftSkills(res.profile.softSkills);
      setReplacingCv(false);
      setCvPaste("");
      showToast(res.message || t("profile.toastCv"));
      if (onboarding) {
        // keep on page so user can review skills
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.errorImport"));
    } finally {
      setCvBusy(false);
    }
  }

  async function uploadCvFile(file: File) {
    setCvBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("cv", file);
      const res = await apiForm<{ ok: boolean; message: string; profile: ProfileData }>(
        "/auth/upload-cv",
        form
      );
      setProfile((prev) => ({ ...(prev ?? ({} as ProfileData)), ...res.profile, hasCv: true }));
      setSkills(res.profile.skills);
      setSoftSkills(res.profile.softSkills);
      setReplacingCv(false);
      setCvPaste("");
      showToast(res.message || t("profile.toastCv"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.errorImport"));
    } finally {
      setCvBusy(false);
    }
  }

  async function onFileSelected(file: File | null) {
    if (!file) return;
    const nameLower = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || nameLower.endsWith(".pdf");
    const isDocx =
      nameLower.endsWith(".docx") || file.type.includes("wordprocessingml");
    const isDoc = nameLower.endsWith(".doc") || file.type === "application/msword";

    if (isDoc && !isDocx) {
      setError(t("profile.errorDoc"));
      return;
    }

    if (isPdf || isDocx) {
      if (file.size > 5 * 1024 * 1024) {
        setError(t("profile.errorFileSize"));
        return;
      }
      await uploadCvFile(file);
      return;
    }

    const text = (await file.text()).trim();
    if (text.length < 40) {
      setError(t("profile.errorCvShort"));
      return;
    }
    await uploadCvText(text, file.name);
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError(t("profile.errorPasswordLen"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("profile.errorPasswordMismatch"));
      return;
    }
    setAccountBusy(true);
    setError(null);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast(t("profile.toastPassword"));
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.errorPasswordChange"));
    } finally {
      setAccountBusy(false);
    }
  }

  function toggleWorkMode(mode: WorkMode) {
    setWorkModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  }

  const hasCv = Boolean(profile?.cvText?.trim() || profile?.hasCv);
  const importDate =
    formatDate(profile?.cvImportedAt, locale) ??
    (hasCv ? formatDate(profile?.updatedAt, locale) : null);
  const canPreviewCv = Boolean(profile?.cvText?.trim());
  const strength = passwordStrength(newPassword);

  function tabPanelClass(id: ProfileTab) {
    return profileTab === id ? "block" : "hidden lg:block";
  }

  if (loading) return <p className="label">{t("profile.loading")}</p>;

  return (
    <div className="fade-in max-w-3xl pb-16">
      <header className="border-b border-[var(--hairline)] pb-4">
        <p className="label">
          {onboarding ? t("profile.eyebrowOnboarding") : t("profile.eyebrow")}
        </p>
        <h1 className="mt-1 text-3xl sm:text-4xl">
          {onboarding ? t("profile.titleOnboarding") : t("profile.title")}
        </h1>
        <p className="mt-2 max-w-xl text-[var(--ink)]/75">
          {onboarding ? t("profile.subtitleOnboarding") : t("profile.subtitle")}
        </p>
        {toast && (
          <p className="mono mt-3 text-sm" style={{ color: "var(--match)" }} role="status">
            {toast}
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm" style={{ color: "var(--brick)" }} role="alert">
            {error}
          </p>
        )}
      </header>

      <div
        className="sticky top-[3.25rem] z-20 -mx-4 grid grid-cols-4 gap-1 border-b border-[var(--hairline)] bg-[var(--paper)]/95 px-4 py-2 backdrop-blur-[2px] lg:hidden"
        role="tablist"
        aria-label={t("profile.tabsAria")}
      >
        {PROFILE_TAB_IDS.map((id) => {
          const active = profileTab === id;
          const meta = tabMeta[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              title={meta.full ? t(meta.full) : t(meta.short)}
              className={`min-h-10 px-1 py-2 text-center text-[0.7rem] font-medium tracking-wide transition-colors ${
                active
                  ? "border border-[var(--amber)] text-[var(--amber)]"
                  : "border border-[var(--hairline)] text-[var(--ink)]/70"
              }`}
              onClick={() => setProfileTab(id)}
            >
              {t(meta.short)}
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-8 lg:mt-8 lg:space-y-10">
        <section
          role="tabpanel"
          className={`${tabPanelClass("cv")} space-y-4 border-b border-[var(--hairline)] pb-8 lg:pb-10`}
        >
          <div>
            <h2 className="text-xl">{t("profile.cvTitle")}</h2>
          </div>

          {!hasCv && !replacingCv ? (
            <div className="border border-dashed border-[var(--ink)] px-5 py-8">
              <p className="text-lg text-[var(--ink)]">{t("profile.cvEmptyTitle")}</p>
              <p className="mt-2 text-sm text-[var(--ink)]/75">{t("profile.cvEmptyBody")}</p>
              <p className="mt-2 text-xs text-[var(--ink)]/70">{t("profile.cvEmptyFormats")}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-amber"
                  onClick={() => fileRef.current?.click()}
                >
                  {t("profile.cvImportFile")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setReplacingCv(true)}
                >
                  {t("profile.cvPasteText")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {hasCv && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {profile?.cvFileName || t("profile.cvImported")}
                    </p>
                    <p className="mono mt-1 text-xs text-[var(--ink)]/70">
                      {importDate
                        ? t("profile.cvImportedOn", { date: importDate })
                        : t("profile.cvImportDateUnknown")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost !py-1.5 !text-sm"
                      disabled={!canPreviewCv}
                      onClick={() => setCvPreview((v) => !v)}
                    >
                      {cvPreview ? t("profile.cvHide") : t("profile.cvShow")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-amber !py-1.5 !text-sm"
                      onClick={() => {
                        setReplacingCv(true);
                        setCvPreview(false);
                      }}
                    >
                      {t("profile.cvReplace")}
                    </button>
                  </div>
                </div>
              )}

              {cvPreview && profile?.cvText && (
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap border border-[var(--hairline)] bg-[var(--field-bg)] p-3 font-[var(--font-body)] text-sm leading-relaxed">
                  {profile.cvText}
                </pre>
              )}

              {replacingCv && (
                <div className="space-y-3 border border-[var(--ink)] p-4">
                  <p className="text-sm text-[var(--ink)]/75">{t("profile.cvReplaceHint")}</p>
                  <p className="text-xs text-[var(--ink)]/70">{t("profile.cvReplaceFormats")}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-amber"
                      disabled={cvBusy}
                      onClick={() => fileRef.current?.click()}
                    >
                      {t("profile.cvChooseFile")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={cvBusy}
                      onClick={() => {
                        setReplacingCv(false);
                        setCvPaste("");
                      }}
                    >
                      {t("profile.cancel")}
                    </button>
                  </div>
                  <label className="block">
                    <span className="label mb-1.5 block">{t("profile.cvOrPaste")}</span>
                    <textarea
                      className="field min-h-36"
                      rows={7}
                      value={cvPaste}
                      onChange={(e) => setCvPaste(e.target.value)}
                      placeholder={t("profile.cvPastePlaceholder")}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-amber"
                    disabled={cvBusy || cvPaste.trim().length < 40}
                    onClick={() => void uploadCvText(cvPaste.trim(), "cv-colle.txt")}
                  >
                    {cvBusy ? t("profile.cvImporting") : t("profile.cvReplaceWithText")}
                  </button>
                </div>
              )}
            </>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              void onFileSelected(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </section>

        <section
          role="tabpanel"
          className={`${tabPanelClass("skills")} space-y-5 border-b border-[var(--hairline)] pb-10`}
        >
          <div>
            <h2 className="text-xl">{t("profile.skillsTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--ink)]/75">{t("profile.skillsSubtitle")}</p>
            {!hasCv && (
              <p className="mt-2 text-xs text-[var(--amber)]">{t("profile.skillsNoCvHint")}</p>
            )}
          </div>
          <TagInput
            label={t("profile.skillsTech")}
            tags={skills}
            onChange={setSkills}
            placeholder={t("profile.skillsTechPh")}
            hint={t("profile.skillsHint")}
          />
          <TagInput
            label={t("profile.skillsSoft")}
            tags={softSkills}
            onChange={setSoftSkills}
            placeholder={t("profile.skillsSoftPh")}
          />
          <TagInput
            label={t("profile.skillsRoles")}
            tags={targetRoles}
            onChange={setTargetRoles}
            placeholder={t("profile.skillsRolesPh")}
          />
        </section>

        <section
          role="tabpanel"
          className={`${tabPanelClass("prefs")} space-y-5 border-b border-[var(--hairline)] pb-10`}
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl">{t("profile.prefsTitle")}</h2>
              <p className="mt-1 text-sm text-[var(--ink)]/75">{t("profile.prefsSubtitle")}</p>
            </div>
            {prefsSaved && (
              <p className="mono text-xs" style={{ color: "var(--match)" }}>
                {prefsSaved}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SalaryField
              label={t("profile.salaryMin")}
              value={salaryMin}
              onChange={setSalaryMin}
              placeholder="50 000"
            />
            <SalaryField
              label={t("profile.salaryMax")}
              value={salaryMax}
              onChange={setSalaryMax}
              placeholder="70 000"
            />
          </div>

          <div>
            <span className="label mb-1.5 block">{t("profile.workType")}</span>
            <p className="mb-2 text-xs text-[var(--ink)]/70">{t("profile.workTypeHint")}</p>
            <div className="flex flex-wrap gap-2">
              {WORK_MODE_KEYS.map((m) => {
                const on = workModes.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={
                      on
                        ? "inline-flex items-center border border-[var(--amber)] bg-[var(--amber)] px-3 py-1.5 text-sm font-medium text-[var(--amber-fg)]"
                        : "inline-flex items-center border border-[var(--hairline)] bg-transparent px-3 py-1.5 text-sm text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
                    }
                    aria-pressed={on}
                    onClick={() => toggleWorkMode(m.id)}
                  >
                    {t(m.key)}
                  </button>
                );
              })}
            </div>
          </div>

          <TagInput
            label={t("profile.locations")}
            tags={preferredLocations}
            onChange={setPreferredLocations}
            placeholder={t("profile.locationsPh")}
            hint={t("profile.locationsHint")}
            onIntercept={(value) => {
              if (!isWorkModeLocationTag(value)) return false;
              const mode = workModeFromTag(value);
              if (mode) {
                setWorkModes((prev) => (prev.includes(mode) ? prev : [...prev, mode]));
                showToast(
                  mode === "remote" ? t("profile.toastRemote") : t("profile.toastWorkMode")
                );
              }
              return true;
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label mb-1.5 block">{t("profile.seniority")}</span>
              <select
                className="field"
                value={targetSeniority}
                onChange={(e) => setTargetSeniority(e.target.value)}
              >
                <option value="">{t("profile.seniorityNone")}</option>
                {SENIORITY_KEYS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.key)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label mb-1.5 block">{t("profile.experienceYears")}</span>
              <input
                className="field mono"
                type="number"
                min={0}
                max={60}
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
              />
            </label>
          </div>

          <TagInput
            label={t("profile.sectorsPrefer")}
            tags={preferredSectors}
            onChange={setPreferredSectors}
            placeholder={t("profile.sectorsPreferPh")}
          />
          <TagInput
            label={t("profile.sectorsAvoid")}
            tags={avoidedSectors}
            onChange={setAvoidedSectors}
            placeholder={t("profile.sectorsAvoidPh")}
          />
        </section>

        <section
          role="tabpanel"
          className={`${tabPanelClass("account")} space-y-8 border-b border-[var(--hairline)] pb-10 lg:border-b-0`}
        >
          <div>
            <h2 className="text-xl">{t("profile.accountTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--ink)]/75">{t("profile.accountSubtitle")}</p>
          </div>

          <Link
            to="/settings?tab=privacy"
            className="flex items-center justify-between gap-3 border border-[var(--ink)] px-4 py-3.5 transition-colors hover:bg-[var(--row-hover)]"
          >
            <span>
              <span className="block text-sm font-medium">{t("profile.settingsLink")}</span>
              <span className="mt-0.5 block text-xs text-[var(--ink)]/70">
                {t("profile.settingsLinkHint")}
              </span>
            </span>
            <span className="text-[var(--amber)]" aria-hidden>
              →
            </span>
          </Link>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label mb-1.5 block">{t("profile.name")}</span>
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className="label mb-1.5 block">{t("profile.email")}</span>
              <input
                className="field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
          </div>

          {hasPassword ? (
            <form onSubmit={onChangePassword} className="space-y-3 border-t border-[var(--hairline)] pt-5">
              <p className="label">{t("profile.changePassword")}</p>
              <label className="block">
                <span className="label mb-1.5 block">{t("profile.currentPassword")}</span>
                <input
                  className="field"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label mb-1.5 block">{t("profile.newPassword")}</span>
                  <input
                    className="field"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                  {newPassword.length > 0 && (
                    <p className="mono mt-1 text-xs text-[var(--ink-soft)]">
                      {t("auth.passwordStrength", { label: strength.label })}
                    </p>
                  )}
                </label>
                <label className="block">
                  <span className="label mb-1.5 block">{t("profile.confirmPassword")}</span>
                  <input
                    className="field"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </label>
              </div>
              <button type="submit" className="btn btn-ghost" disabled={accountBusy}>
                {accountBusy ? "…" : t("profile.updatePassword")}
              </button>
            </form>
          ) : (
            <p className="text-sm text-[var(--ink)]/75">{t("profile.socialAccount")}</p>
          )}

          <DeleteAccountPanel hasPassword={hasPassword} onError={setError} />
        </section>

        {onboarding && hasCv && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-amber"
              onClick={() => navigate("/", { replace: true })}
            >
              {t("profile.continueDashboard")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
