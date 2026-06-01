FROM node:20-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

# ── Stage: instalar todas las dependencias ──────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ── Stage: compilar la API ──────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm --filter @crm/api build

# ── Stage: dependencias de producción únicamente (pnpm deploy) ──
FROM base AS prod-deps
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @crm/api --prod deploy /standalone

# ── Stage: imagen final ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /standalone/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
EXPOSE 3001
CMD ["node", "dist/index.js"]
