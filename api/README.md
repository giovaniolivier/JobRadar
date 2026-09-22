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

## Endpoints

| Méthode | Route | Description |
|--------|--------|-------------|
| POST | `/auth/register` | Inscription |
| POST | `/auth/login` | Connexion |
| POST | `/auth/upload-cv` | Upload CV (fichier `cv` ou JSON `{ cvText }`) |
| POST | `/offers` | Ajouter offre(s) manuel / CSV / texte |
| GET | `/offers` | Liste + filtres (`minScore`, `salary`, `remote`, `stack`) |
| GET | `/offers/:id` | Détail |
| POST | `/offers/:id/analyze` | Analyse IA |
| POST | `/offers/:id/generate-letter` | Lettre de motivation |
| GET | `/applications` | Pipeline candidatures |
| PATCH | `/applications/:id` | Changer statut |
| GET/PUT | `/profile` | Profil candidat (skills, cibles…) |
| POST | `/offers/sync` | Sync Remotive (bonus) |

## CORS

`CORS_ORIGIN` doit pointer vers le frontend (défaut `http://localhost:5173`).
