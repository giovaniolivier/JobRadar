import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppLocale = "fr" | "en";

const STORAGE_KEY = "jobradar.locale";

const messages = {
  fr: {
    "nav.dashboard": "Tableau de bord",
    "nav.dashboardShort": "Accueil",
    "nav.offers": "Offres",
    "nav.offersShort": "Offres",
    "nav.pipeline": "Candidatures",
    "nav.pipelineShort": "Suivi",
    "nav.profile": "Mon profil",
    "nav.profileShort": "Profil",
    "nav.newOffer": "+ Nouvelle offre",
    "nav.newOfferShort": "Nouvelle offre",
    "nav.openMenu": "Ouvrir le menu",
    "nav.closeMenu": "Fermer",
    "nav.primary": "Navigation principale",
    "nav.notifications": "Notifications",
    "nav.notificationsUnread": "Notifications ({n} non lues)",
    "nav.notificationsEmpty": "Rien de nouveau pour l’instant",
    "nav.notificationsMarkAll": "Tout marquer comme lu",
    "nav.notificationsSettings": "Voir les paramètres de notifications",
    "nav.notificationsUnreadDot": "Non lue",
    "nav.accountMenu": "Menu du compte",
    "nav.myAccount": "Mon compte",
    "nav.settings": "Paramètres",
    "nav.logout": "Se déconnecter",

    "settings.loading": "Chargement des paramètres…",
    "settings.eyebrow": "Paramètres",
    "settings.title": "Paramètres",
    "settings.subtitle": "Personnalisez votre usage de JobRadar",
    "settings.saved": "Enregistré",
    "settings.exported": "Export téléchargé",
    "settings.saveError": "Enregistrement impossible",
    "settings.exportError": "Export impossible",
    "settings.loadError": "Erreur",

    "settings.notifications": "Notifications",
    "settings.notificationsHint": "Canaux et types d’événements — sauvegarde automatique.",
    "settings.email": "Email",
    "settings.emailHint": "Recevoir les alertes sur votre adresse de connexion",
    "settings.emailToggle": "Notifications email",
    "settings.inApp": "Dans l’app",
    "settings.inAppHint": "Badge et centre de notifications JobRadar",
    "settings.inAppToggle": "Notifications dans l’app",
    "settings.events": "Événements",
    "settings.highScore": "Offre à fort score",
    "settings.highScoreHint": "Nouvelle analyse au-dessus de votre seuil de pertinence",
    "settings.highScoreToggle": "Notifier offre à fort score",
    "settings.followUp": "Rappel de relance",
    "settings.followUpHint": "Candidature sans réponse depuis plusieurs jours",
    "settings.followUpToggle": "Notifier rappel de relance",
    "settings.interview": "Entretien à venir",
    "settings.interviewHint": "Rappel avant une date d’entretien enregistrée",
    "settings.interviewToggle": "Notifier entretien",
    "settings.digest": "Résumé d’activité",
    "settings.digestHint": "Digest périodique de votre pipeline et analyses",
    "settings.digestToggle": "Notifier résumé",
    "settings.digestFrequency": "Fréquence du résumé",
    "settings.daily": "Quotidien",
    "settings.weekly": "Hebdomadaire",

    "settings.appearance": "Apparence",
    "settings.appearanceHint": "Thème de l’interface — clair, sombre, ou selon le système.",
    "settings.theme": "Thème",
    "settings.themeLight": "Clair",
    "settings.themeDark": "Sombre",
    "settings.themeSystem": "Système",

    "settings.localeRegion": "Langue et région",
    "settings.localeRegionHint":
      "Formats d’affichage — utile aussi pour les offres à l’international.",
    "settings.uiLanguage": "Langue de l’interface",
    "settings.language": "Langue",
    "settings.dateFormat": "Format de date",
    "settings.currency": "Devise par défaut (salaires)",
    "settings.currencyLabel": "Devise",

    "settings.privacy": "Confidentialité et données",
    "settings.privacyBody":
      "Votre CV et les offres analysées servent uniquement à personnaliser scores, alertes et brouillons dans votre compte — ils ne sont pas vendus ni partagés avec des recruteurs.",
    "settings.export": "Exporter mes données",
    "settings.exporting": "Export…",
    "settings.privacyPolicy": "Politique de confidentialité",
    "settings.exportHintBefore":
      "L’export JSON contient profil, CV, analyses et candidatures. Le compte et le CV se gèrent dans",
    "settings.exportHintLink": "Mon profil",
    "settings.exportHintAfter": ".",

    "settings.integrations": "Intégrations",
    "settings.integrationsHint":
      "Bientôt — ces connexions arriveront sans changer l’emplacement de vos réglages.",
    "settings.browserExt": "Extension navigateur",
    "settings.browserExtHint":
      "Sauvegarder une offre en un clic depuis LinkedIn ou Indeed.",
    "settings.calendar": "Calendrier",
    "settings.calendarHint": "Synchroniser les entretiens avec Google ou Outlook.",
    "settings.soon": "Bientôt",

    "toggle.on": "activé",
    "toggle.off": "désactivé",
    "toggle.onTitle": "Activé",
    "toggle.offTitle": "Désactivé",
  },
  en: {
    "nav.dashboard": "Dashboard",
    "nav.dashboardShort": "Home",
    "nav.offers": "Jobs",
    "nav.offersShort": "Jobs",
    "nav.pipeline": "Applications",
    "nav.pipelineShort": "Pipeline",
    "nav.profile": "My profile",
    "nav.profileShort": "Profile",
    "nav.newOffer": "+ New job",
    "nav.newOfferShort": "New job",
    "nav.openMenu": "Open menu",
    "nav.closeMenu": "Close",
    "nav.primary": "Primary navigation",
    "nav.notifications": "Notifications",
    "nav.notificationsUnread": "Notifications ({n} unread)",
    "nav.notificationsEmpty": "Nothing new for now",
    "nav.notificationsMarkAll": "Mark all as read",
    "nav.notificationsSettings": "Notification settings",
    "nav.notificationsUnreadDot": "Unread",
    "nav.accountMenu": "Account menu",
    "nav.myAccount": "My account",
    "nav.settings": "Settings",
    "nav.logout": "Log out",

    "settings.loading": "Loading settings…",
    "settings.eyebrow": "Settings",
    "settings.title": "Settings",
    "settings.subtitle": "Personalize how you use JobRadar",
    "settings.saved": "Saved",
    "settings.exported": "Export downloaded",
    "settings.saveError": "Could not save",
    "settings.exportError": "Could not export",
    "settings.loadError": "Error",

    "settings.notifications": "Notifications",
    "settings.notificationsHint": "Channels and event types — saved automatically.",
    "settings.email": "Email",
    "settings.emailHint": "Receive alerts at your sign-in address",
    "settings.emailToggle": "Email notifications",
    "settings.inApp": "In-app",
    "settings.inAppHint": "Badge and JobRadar notification center",
    "settings.inAppToggle": "In-app notifications",
    "settings.events": "Events",
    "settings.highScore": "High-score job",
    "settings.highScoreHint": "New analysis above your relevance threshold",
    "settings.highScoreToggle": "Notify on high-score job",
    "settings.followUp": "Follow-up reminder",
    "settings.followUpHint": "Application with no reply for several days",
    "settings.followUpToggle": "Notify follow-up reminder",
    "settings.interview": "Upcoming interview",
    "settings.interviewHint": "Reminder before a saved interview date",
    "settings.interviewToggle": "Notify interview",
    "settings.digest": "Activity digest",
    "settings.digestHint": "Periodic digest of your pipeline and analyses",
    "settings.digestToggle": "Notify digest",
    "settings.digestFrequency": "Digest frequency",
    "settings.daily": "Daily",
    "settings.weekly": "Weekly",

    "settings.appearance": "Appearance",
    "settings.appearanceHint": "Interface theme — light, dark, or match the system.",
    "settings.theme": "Theme",
    "settings.themeLight": "Light",
    "settings.themeDark": "Dark",
    "settings.themeSystem": "System",

    "settings.localeRegion": "Language & region",
    "settings.localeRegionHint": "Display formats — also useful for international roles.",
    "settings.uiLanguage": "Interface language",
    "settings.language": "Language",
    "settings.dateFormat": "Date format",
    "settings.currency": "Default currency (salaries)",
    "settings.currencyLabel": "Currency",

    "settings.privacy": "Privacy & data",
    "settings.privacyBody":
      "Your CV and analyzed jobs are only used to personalize scores, alerts, and drafts in your account — they are not sold or shared with recruiters.",
    "settings.export": "Export my data",
    "settings.exporting": "Exporting…",
    "settings.privacyPolicy": "Privacy policy",
    "settings.exportHintBefore":
      "The JSON export includes profile, CV, analyses, and applications. Account and CV are managed in",
    "settings.exportHintLink": "My profile",
    "settings.exportHintAfter": ".",

    "settings.integrations": "Integrations",
    "settings.integrationsHint":
      "Coming soon — these connections will land here without moving your other settings.",
    "settings.browserExt": "Browser extension",
    "settings.browserExtHint": "Save a job in one click from LinkedIn or Indeed.",
    "settings.calendar": "Calendar",
    "settings.calendarHint": "Sync interviews with Google or Outlook.",
    "settings.soon": "Soon",

    "toggle.on": "on",
    "toggle.off": "off",
    "toggle.onTitle": "On",
    "toggle.offTitle": "Off",
  },
} as const;

export type MessageKey = keyof (typeof messages)["fr"];

export function readStoredLocale(): AppLocale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "fr" || raw === "en") return raw;
  } catch {
    // ignore
  }
  return "fr";
}

export function persistLocale(locale: AppLocale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
  document.documentElement.lang = locale;
}

export function bootLocale() {
  persistLocale(readStoredLocale());
}

function translate(locale: AppLocale, key: MessageKey, vars?: Record<string, string | number>) {
  let text: string = messages[locale][key] ?? messages.fr[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => readStoredLocale());

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
