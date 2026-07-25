# syntax=docker/dockerfile:1

# UGMF production image.
#
# Multi-stage so the shipped layer contains no toolchain and no dev
# dependencies — just Node, the standalone server, and the static assets.
# Final image is around 200 MB, which sits comfortably on a NAS.

FROM node:22-alpine AS base
# Next's native binaries expect glibc symbols that Alpine's musl lacks.
RUN apk add --no-cache libc6-compat

# ---------------------------------------------------------------- deps ------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------- build ------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------- run -------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    # Without this Next binds to localhost inside the container and nothing
    # outside it can reach the app.
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `output: "standalone"` in next.config.ts produces a server bundled with only
# the node_modules it actually uses. Static assets are not included in it and
# have to be copied alongside.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Artist pages and the live listing revalidate on a timer, so the cache
# directory has to be writable by the unprivileged user.
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

# Where the background sync (lib/sync/) writes artists.json/events.json —
# the data the site actually reads on every request. Mount a volume here
# (see docker-compose.yml) so a real dataset survives a container restart
# instead of starting back on seed data every time.
RUN mkdir -p .data && chown -R nextjs:nodejs .data

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
