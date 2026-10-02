FROM node:22-alpine

WORKDIR /app

# Backend dependencies
COPY portal/package*.json ./portal/
RUN cd /app/portal && npm ci --omit=dev

# Frontend dependencies
COPY portal/frontend/package*.json ./portal/frontend/
RUN cd /app/portal/frontend && npm ci

# Copy full repo
COPY . /app

# Build React SPA into portal/public
RUN cd /app/portal/frontend && npm run build

# Usuario no-root para ejecución en prod (UID/GID 1000)
RUN addgroup -g 1000 -S neubat && adduser -u 1000 -S neubat -G neubat \
 && mkdir -p /app/data /app/portal/configs/generated \
 && chown -R neubat:neubat /app

WORKDIR /app/portal

ENV NODE_ENV=production \
    PORT=3000 \
    NEUBAT_DATA_DIR=/app/data \
    NEUBAT_CONFIGS_DIR=/app/portal/configs/generated

EXPOSE 3000

VOLUME ["/app/data", "/app/portal/configs/generated"]

USER neubat

CMD ["node", "server.js"]
