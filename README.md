# JobRadar

Assistant de veille et de tri d'offres d'emploi.

```
JobRadar/
├── api/   → backend (Express + Prisma + PostgreSQL + Gemini/Claude)
└── web/   → frontend (React + Vite + Tailwind)
```

Un seul repo GitHub ; web et API se déploient séparément (ou via Docker Compose).

## Prérequis

- Node.js 20+
- PostgreSQL
- (Optionnel) clé Gemini (gratuit) et/ou Anthropic pour l’IA
- (Optionnel en local) SMTP pour OTP, reset password et emails de notification — **obligatoire en production**

## Setup local

### API

```powershell
cd api
cp .env.example .env
# Éditer DATABASE_URL, JWT_SECRET, CORS_ORIGIN, APP_ORIGIN, GEMINI_API_KEY, SMTP_*
npm install
npm run db:migrate:deploy   # ou npm run db:push en démo locale
npm run db:seed
npm run mail:test           # vérifie SMTP + envoie un email de test
npm run dev
```

→ http://localhost:4000  
Compte démo : `demo@jobradar.dev` / `demo1234`

### SMTP (Brevo)

En `NODE_ENV=production`, l’API **refuse de démarrer** si SMTP est absent ou inaccessible (`verify`).

1. Créer un compte [Brevo](https://www.brevo.com/)
2. **Settings → SMTP & API → SMTP** : copier login + clé SMTP dans `api/.env`
3. **Senders** : vérifier l’adresse de `MAIL_FROM` (ex. ton Gmail personnel au début)
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

## Docker (stack complète)

```powershell
# À la racine du repo
$env:JWT_SECRET="un-secret-d-au-moins-32-caracteres"
docker compose up --build
```

- Web : http://localhost:8080  
- API : http://localhost:4000  
- Postgres : localhost:5432

## Notes produit

- Les offres sont **isolées par utilisateur** (pas de fuite entre comptes).
- CV : import **PDF / DOCX / .txt**.
- Prefs email (Paramètres) : envoi réel si SMTP est configuré (score élevé, relance, entretien, digest).
- **PWA** : le build web génère un service worker + manifest (installable sur mobile / desktop).
- Langue : Paramètres → Langue (FR / EN).
