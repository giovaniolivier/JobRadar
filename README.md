# JobRadar

Assistant de veille et de tri d'offres d'emploi.

```
JobRadar/
├── api/   → backend (Express + Prisma + PostgreSQL + Gemini / Groq / Claude)
└── web/   → frontend (React + Vite + Tailwind + PWA)
```

Un seul repo GitHub ; web et API se déploient séparément (ou via Docker Compose).

## Prérequis

- Node.js 20+
- PostgreSQL
- (Optionnel) clé **Gemini** et/ou **Groq** et/ou **Anthropic** pour l’IA
- (Optionnel en local) e-mail (clé API Brevo ou SMTP) pour OTP, reset password et emails de notification — **obligatoire en production**

## Setup local

### API

```powershell
cd api
cp .env.example .env
# Éditer DATABASE_URL, JWT_SECRET, CORS_ORIGIN, APP_ORIGIN,
# GEMINI_API_KEY / GROQ_API_KEY / ANTHROPIC_API_KEY, AI_PROVIDER, BREVO_API_KEY ou SMTP_*
npm install
npm run db:migrate:deploy   # ou npm run db:push en démo locale
npm run db:seed
npm run mail:test           # vérifie SMTP + envoie un email de test
npm run dev
```

→ http://localhost:4000

Compte démo (**seed local uniquement**, pas pour une instance publique) :  
`demo@jobradar.dev` / `demo1234`

### IA

En `AI_PROVIDER=auto` (défaut) : **Gemini → Groq → Claude**, avec bascule si quota / 503 / réponse vide.

| Valeur | Comportement |
|--------|----------------|
| `auto` | Gemini, puis Groq, puis Claude |
| `gemini` / `groq` / `anthropic` | Force un seul fournisseur |
| `none` | Heuristique seule (pas d’appel LLM) |

Voir `api/.env.example` pour les modèles (`GEMINI_MODEL`, `GROQ_MODEL`, etc.).

### E-mails (Brevo)

L’API **démarre toujours**, même si l’e-mail est absent ou injoignable : la vérification
tourne en arrière-plan et son résultat est exposé sur `/health`. La connexion par mot de
passe envoie un **code de vérification par e-mail** (voir `LOGIN_OTP_REQUIRED` ci-dessous).

Deux transports, choisis automatiquement :

| Transport | Activé si | Quand l’utiliser |
|-----------|-----------|------------------|
| **API HTTPS Brevo** (`brevo-api`) | `BREVO_API_KEY` est défini | **Recommandé**, obligatoire sur Render gratuit (port 443, jamais bloqué) |
| SMTP (`smtp`) | `SMTP_HOST/USER/PASS` ou `SMTP_URL`, sans `BREVO_API_KEY` | En local, ou chez un hébergeur qui laisse passer le SMTP |

1. Créer un compte [Brevo](https://www.brevo.com/) (plan gratuit : ~300 emails/jour)
2. **Senders** : vérifier l’adresse de `MAIL_FROM`
3. **Settings → SMTP & API → API Keys** : créer une clé API v3 → `BREVO_API_KEY`
   (ce n’est **pas** la clé SMTP ; si Brevo restreint les IP, autoriser celles de l’hébergeur
   dans **Security → Authorised IPs**)
4. `npm run mail:test` (affiche le transport utilisé)

| Variable | Exemple |
|----------|---------|
| `BREVO_API_KEY` | `xkeysib-…` (clé API v3) |
| `MAIL_FROM` | `JobRadar <ton@email-verifie.com>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | `smtp-relay.brevo.com` / `587` (local) · `2525` sur Render / login SMTP / clé SMTP |

**Code de connexion** — `LOGIN_OTP_REQUIRED` :

| Valeur | Comportement |
|--------|--------------|
| `true` (défaut) | Code toujours exigé (sans e-mail fonctionnel, la connexion renvoie `503`) |
| `auto` (Render) | Code exigé dès que `/health` indique `mail.verified: true`, mot de passe seul sinon |
| `false` | Mot de passe seul (secours) |

`APP_ORIGIN` = URL publique du front (liens reset + notifs).  
Santé : `GET /health` → `{ mail: { configured, transport, verified } }` (toujours `200` si l'API tourne).  
Readiness e-mail : `GET /health/mail` → `503` si l’e-mail est configuré mais injoignable.

> **Render (plan gratuit)** : les ports SMTP sortants `25`, `465` et `587` sont bloqués
> ([changelog](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)).
> Utilise `BREVO_API_KEY` (ou, à défaut, `SMTP_PORT=2525`).

#### Fiabilité des notifications (relances, score, digest)

L’API envoie ces e-mails via un planificateur interne (toutes les 15 min). Sur
**Render gratuit, le service s’endort quand il est inactif** et ce planificateur ne
tourne plus de façon fiable. Une route machine prend le relais :
`POST /internal/dispatch-emails`, protégée par `CRON_SECRET`.

Le dépôt inclut un cron GitHub Actions (`.github/workflows/dispatch-emails.yml`) qui
l’appelle toutes les heures. Pour l’activer :

1. Sur le service API Render : définir `CRON_SECRET` (valeur aléatoire).
2. Sur GitHub (Settings → Secrets and variables → Actions) :
   - **Variable** `API_URL` = `https://jobradar-api-mpcj.onrender.com`
   - **Secret** `CRON_SECRET` = la même valeur que sur Render.

Sans `CRON_SECRET`, la route renvoie `404` (désactivée) et seul le planificateur interne agit.

### Connexion Google (optionnel)

Les boutons Google / LinkedIn ne s’affichent que si l’API les a configurés :
`GET /auth/providers` → `{ "google": true }`.

1. [Google Cloud Console → Identifiants](https://console.cloud.google.com/apis/credentials)
   → **Créer des identifiants → ID client OAuth → Application Web**
2. **URI de redirection autorisés** : `<URL_API>/auth/google/callback`
   (ex. `https://jobradar-api-mpcj.onrender.com/auth/google/callback`)
3. **Origines JavaScript autorisées** : l’URL du front
   (ex. `https://jobradar-web-ewb5.onrender.com`)
4. Écran de consentement : type *Externe* ; ajoutez votre compte en **testeur** tant que
   l’application n’est pas publiée
5. Renseignez `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `GOOGLE_REDIRECT_URI`
   dans l’environnement de l’API, puis redéployez

Même principe pour LinkedIn (`LINKEDIN_*`, redirection
`<URL_API>/auth/linkedin/callback`).

### Web

```powershell
cd web
cp .env.example .env
# VITE_API_URL=http://localhost:4000
npm install
npm run dev
```

→ http://localhost:5173

Build / PWA : `npm run build` puis `npm run preview` (manifest + service worker).

## Docker (stack complète)

Adaptez la définition du secret selon votre shell :

```powershell
# PowerShell
$env:JWT_SECRET="un-secret-d-au-moins-32-caracteres"
docker compose up --build
```

```bash
# bash / zsh (macOS, Linux, WSL)
export JWT_SECRET="un-secret-d-au-moins-32-caracteres"
docker compose up --build
```

- Web : http://localhost:8080  
- API : http://localhost:4000  
- Postgres : localhost:5432

Passez aussi `BREVO_API_KEY` / `SMTP_*`, `APP_ORIGIN`, `CORS_ORIGIN` et les clés IA via l’environnement ou un fichier `.env` à la racine (voir `docker-compose.yml`).

## Notes produit

- Les offres sont **isolées par utilisateur** (pas de fuite entre comptes).
- CV : import **PDF / DOCX / .txt**.
- Prefs email (Paramètres) : envoi réel si SMTP est configuré (score élevé, relance, entretien, digest).
- Suppression de compte : **Paramètres → Données** (ou Profil → Compte) — confirmation `SUPPRIMER`.
- **PWA** : le build web génère un service worker + manifest (installable sur mobile / desktop).
- Langue : **Paramètres → Langue** (FR / EN) ; les textes longs CGU / privacy / mentions restent en français.
- Pages légales : `/legal/cgu`, `/legal/privacy`, `/legal/mentions`.
- OAuth Google / LinkedIn : optionnel (variables dans `api/.env.example`).

## Tests

```powershell
cd api
npm test        # tests unitaires (Vitest), sans base de données ni réseau
```

Couverts : lecture des offres collées / CSV (`ingestion`), lecture d’une offre depuis son URL
et protection SSRF (`fetchOffer`), envoi d’e-mails Brevo / SMTP (`mail`), choix et erreurs des
fournisseurs IA (`ai`). Les fichiers sont dans `api/test/`.

Autres vérifications : smoke API (`npm run smoke`, API lancée) et `npm run mail:test`.  
CI (GitHub Actions) : typecheck + tests de l’API, validation Prisma, lint + build du web.
