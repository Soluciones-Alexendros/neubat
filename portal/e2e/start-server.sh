#!/usr/bin/env bash
# Arranca el portal NEUBAT aislado para la suite E2E (lo invoca playwright.config.ts).
# - Compila el frontend si hace falta (Express sirve portal/public).
# - Datos en tmp efímero (mismo patrón que portal/tests/setup.js).
# - Rate limit desactivado: la suite supera 100 req/15 min desde 127.0.0.1.
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTAL_DIR="$(dirname "$E2E_DIR")"

# Recompila si falta el build o si alguna fuente del frontend es más reciente
# (servir un SPA obsoleto hace fallar la E2E de forma confusa).
if [ ! -f "$PORTAL_DIR/public/index.html" ] \
    || find "$PORTAL_DIR/frontend/src" "$PORTAL_DIR/frontend/index.html" \
            -newer "$PORTAL_DIR/public/index.html" -print -quit 2>/dev/null | grep -q .; then
    echo "[e2e] Compilando frontend..."
    npm --prefix "$PORTAL_DIR/frontend" run build
fi

TMP_ROOT="$(mktemp -d /tmp/neubat-e2e.XXXXXX)"
trap 'rm -rf "$TMP_ROOT"' EXIT
mkdir -p "$TMP_ROOT/data" "$TMP_ROOT/configs/generated" "$TMP_ROOT/users"

echo "[e2e] Datos en $TMP_ROOT (efímero)"
cd "$PORTAL_DIR"
exec env \
    PORT=3101 \
    ADMIN_TOKEN=test-admin-token \
    NEUBAT_DATA_DIR="$TMP_ROOT/data" \
    NEUBAT_CONFIGS_DIR="$TMP_ROOT/configs/generated" \
    NEUBAT_USERS_DIR="$TMP_ROOT/users" \
    NEUBAT_DISABLE_RATE_LIMIT=1 \
    node server.js
