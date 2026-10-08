FROM node:24-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
COPY shared /app/shared
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 APP_REQUIRE_AUTH=true
WORKDIR /app/frontend
COPY --from=build --chown=node:node /app/frontend ./
COPY --from=build --chown=node:node /app/shared /app/shared
USER node
CMD ["sh", "-c", "exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port ${PORT:-3000}"]
