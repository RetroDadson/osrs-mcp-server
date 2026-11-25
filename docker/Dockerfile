# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM build AS production-deps
RUN npm prune --omit=dev

FROM node:26-bookworm-slim AS runtime
LABEL org.opencontainers.image.licenses="BSD-2-Clause"
RUN useradd --system --create-home --home-dir /app appuser
WORKDIR /app
COPY --from=build --chown=appuser:appuser /app/LICENSE ./LICENSE
COPY --from=production-deps --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=appuser:appuser /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=appuser:appuser /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=appuser:appuser /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=appuser:appuser /app/apps/client/dist ./apps/client/dist

USER appuser
ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
