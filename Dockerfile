# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# EssentiaMES - immagine di produzione (Next.js standalone, Node 22)
#   docker build -t essentia-mes .
#   docker run --env-file .env.production -p 3000:3000 -v essentia-docs:/app/data essentia-mes
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Europe/Rome \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/app/data/upload_documenti
# L'immagine node:*-slim include gia' zoneinfo: TZ=Europe/Rome funziona senza pacchetti aggiuntivi.
RUN groupadd --system --gid 1001 essentia && useradd --system --uid 1001 --gid essentia essentia
COPY --from=build --chown=essentia:essentia /app/.next/standalone ./
COPY --from=build --chown=essentia:essentia /app/.next/static ./.next/static
COPY --from=build --chown=essentia:essentia /app/public ./public
COPY --from=build --chown=essentia:essentia /app/templates ./templates
# Script di amministrazione DB (npm run db:init / user:create) utilizzabili dal container.
COPY --from=build --chown=essentia:essentia /app/database ./database
COPY --from=build --chown=essentia:essentia /app/scripts ./scripts
RUN mkdir -p /app/data/upload_documenti && chown -R essentia:essentia /app/data
USER essentia
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
