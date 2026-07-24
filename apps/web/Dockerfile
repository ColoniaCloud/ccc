FROM node:20-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

# ── Stage: instalar todas las dependencias ──────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ── Stage: build de Next.js (output standalone) ─────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
# NEXT_PUBLIC_* se inyectan en el bundle del cliente en build-time, no en
# runtime — tienen que venir como build arg.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @crm/web build

# ── Stage: imagen final ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# El server.js de standalone lee HOSTNAME para decidir en qué interfaz
# escuchar. Docker define HOSTNAME=<container id> por defecto — sin este
# override, Next termina bindeando solo a la IP del contenedor en vez de
# 0.0.0.0, y ni el healthcheck (127.0.0.1) ni nada fuera del propio
# proceso puede conectarse.
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
