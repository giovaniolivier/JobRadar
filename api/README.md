# JobRadar API

Backend Node.js + Express + Prisma + PostgreSQL + Claude.

Repo frontend séparé : `../web`

## Setup

```bash
cp .env.example .env
# Éditer DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, CORS_ORIGIN

npm install
npm run db:push
npm run db:seed
npm run dev
```

API : http://localhost:4000  
Compte démo : `demo@jobradar.dev` / `demo1234`

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | API en watch |
| `npm run build` / `start` | Production |
| `npm run db:push` | Appliquer le schéma Prisma |
| `npm run db:seed` | Données démo |
| `npm run smoke` | Health + Remotive |

## CORS

`CORS_ORIGIN` doit pointer vers le frontend (défaut `http://localhost:5173`).
