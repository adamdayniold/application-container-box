# ==========================================
# 1. BASE STAGE (Shared OS setup)
# ==========================================
FROM node:24.22.2-alpine3.24 AS base
WORKDIR /app
# Alpine uses musl; libc6-compat lets Next.js's native modules (sharp) run
RUN apk add --no-cache libc6-compat
COPY package*.json ./

# ==========================================
# 2. DEVELOPMENT STAGE (Local Hot-Reloading)
# ==========================================
FROM base AS dev
RUN npm install
COPY . .
# Next.js telemetry can be disabled during development if desired
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["npm", "run", "dev"]

# ==========================================
# 3. BUILDER STAGE (Compiles the application)
# ==========================================
FROM base AS builder
WORKDIR /app
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ==========================================
# 4. PRODUCTION / STAGING RUNTIME STAGE
# ==========================================
FROM node:24.22.2-alpine3.24 AS prod
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root system user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --ingroup nodejs nextjs

# CRITICAL: Next.js output standalone feature must be enabled in next.config.js
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# No HEALTHCHECK on purpose: Kubernetes ignores it and uses the probes in the
# Helm chart instead (liveness /api/health, readiness /api/health/ready).

# The standalone server entrypoint built by Next.js
CMD ["node", "server.js"]
