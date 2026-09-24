# JobRadar API
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY prisma ./prisma
# prisma CLI is a devDependency; install it for generate + migrate deploy
RUN npm ci --omit=dev \
  && npm install prisma@6.19.3 --no-save \
  && npx prisma generate
COPY --from=build /app/dist ./dist
# Needed for `prisma db seed` (imports ../src/...)
COPY src ./src
EXPOSE 4000
# db push: simple for local Docker demo (évite l’historique migrate cassé sur volume neuf)
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]

