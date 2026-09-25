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
- (Optionnel en local) SMTP pour OTP, reset password et emails de notification — **obligatoire en production**

## Setup local

### API

```powershell
cd api
cp .env.example .env
# Éditer DATABASE_URL, JWT_SECRET, CORS_ORIGIN, APP_ORIGIN,
# GEMINI_API_KEY / GROQ_API_KEY / ANTHROPIC_API_KEY, AI_PROVIDER, SMTP_*
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

### SMTP (Brevo)

En `NODE_ENV=production`, l’API **refuse de démarrer** si SMTP est absent ou inaccessible (`verify`).

1. Créer un compte [Brevo](https://www.brevo.com/) (plan gratuit : ~300 emails/jour)
2. **Settings → SMTP & API → SMTP** : copier login + clé SMTP dans `api/.env`
3. **Senders** : vérifier l’adresse de `MAIL_FROM`
4. `npm run mail:test`

| Variable | Exemple Brevo |
|----------|----------------|
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | login SMTP du dashboard |
| `SMTP_PASS` | clé SMTP |
| `MAIL_FROM` | `JobRadar <ton@email-verifie.com>` |

`APP_ORIGIN` = URL publique du front (liens reset + notifs).  
Santé : `GET /health` → `{ mail: { configured, verified } }`.

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

Passez aussi `SMTP_*`, `APP_ORIGIN`, `CORS_ORIGIN` et les clés IA via l’environnement ou un fichier `.env` à la racine (voir `docker-compose.yml`).

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

Peu de couverture automatisée pour l’instant : smoke API (`cd api && npm run smoke`) et `npm run mail:test`.  
CI : typecheck / build web + validation Prisma (pas de suite e2e complète).
