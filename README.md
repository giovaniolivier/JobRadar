# JobRadar

Assistant de veille et de tri d'offres d'emploi.

```
JobRadar/
├── api/   → backend (Express + Prisma + PostgreSQL + Claude)
└── web/   → frontend (React + Vite + Tailwind)
```

Un seul repo GitHub ; web et API se déploient séparément (ou via Docker Compose).

## Prérequis

- Node.js 20+
- PostgreSQL
- (Optionnel) clé Anthropic pour Claude
- (Optionnel) SMTP pour OTP, reset password et emails de notification

## Setup local

### API

```powershell
cd api
cp .env.example .env
# Éditer DATABASE_URL, JWT_SECRET, CORS_ORIGIN, APP_ORIGIN, ANTHROPIC_API_KEY, SMTP_*
npm install
npm run db:migrate:deploy   # ou npm run db:push en démo locale
npm run db:seed
npm run dev
```

→ http://localhost:4000  
Compte démo : `demo@jobradar.dev` / `demo1234`

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
