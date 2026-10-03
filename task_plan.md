# Plan de Tareas — Hardening NEUBAT (P0)

**Objetivo:** Cerrar los 5 hallazgos P0 del informe de seguridad en **un único PR** con tests de aceptación.
**Rama:** `fix/fase-1-seguridad-hardening` (ya existe en remoto).
**Criterio de cierre:** `make lint && make test && make smoke && make test-e2e && make validate` en verde + tests específicos P0 pasan.

---

## Estado Actual (2026-10-02)

**✅ COMPLETADO** — Todas las tareas P0 originales (T1–T12) + fixes F1–F7 implementados y tests verdes.

Pre-commit husky verificado: `.husky/pre-commit` → `lint-staged` (bash -n + shellcheck en *.sh, node --check en portal JS, json.tool en configs).

| Métrica | Resultado |
|---------|-----------|
| `make test-p0` | ✅ 26 tests (4 bats hmac + 3 jest hmac + 7 bats cmdline + 12 jest account) |
| `cd portal && npm test` | ✅ 88/88 tests |
| `bats tests/bash/*.bats` | ✅ 11/11 (hmac 4 + cmdline 7) |
| `make lint` | ✅ solo warnings frontend preexistentes |
| `make smoke` | ✅ health + install + contraste WCAG |
| `make validate` | ✅ 21 scripts/configs |

**Git diff:** 21 archivos modificados + 5 untracked (tests nuevos, fixture, task_plan.md)

---

## Cambios Implementados vs Plan Original

### T1. HMAC Fail-Closed en Instalador (`scripts/20-archinstall.sh`) ✅
- `verify_config_signature`: caso 2 (sin signature con secreto) → **error** (antes warning)
- Fix bug preexistente: captura correcta de `rc` del subshell python (el `!` negaba el código)
- Tests: `tests/bash/hmac.bats` (4 tests)

### T2. HMAC Fail-Closed en Portal + Secreto Obligatorio en Prod (`portal/server.js`, `portal/lib/db.js`) ✅
- `server.js:start()`: aborta si `NODE_ENV=production` y `!NEUBAT_HMAC_SECRET`
- `server.js:start()`: **F4** valida longitud ≥32 bytes y rechaza placeholder `.env.example`
- `server.js:start()`: **F3** exige `NEUBAT_PUBLIC_URL` empiece por `https://` en prod
- Tests: `portal/tests/lib/hmac.test.js` (3 tests)

### T3. Parser Cmdline Seguro (sin `eval`) ✅
- `scripts/lib/utils.sh`: `parse_kernel_cmdline()` allowlist + regex (token hex32, profile, URL http/https)
- `iso/airootfs/usr/local/bin/neubat-autoinstall`: reescrito, usa `source` de utils.sh con fallback embebido
- `scripts/20-archinstall.sh`: source utils.sh + `parse_kernel_cmdline` en invocación directa
- Tests: `tests/bash/cmdline-parser.bats` (5 tests)

### T4. Perfiles Públicos Sin Password En Claro (`portal/routes/account.js`) ✅
- `redactProfileForPublicView()`: redacta `password`, `encryption.passphrase`, `archinstall.creds` → `"[redacted]"`
- Tests: `portal/tests/routes/account.test.js` (4 tests T4)

### T5. Configs: TLS + No-Store en `/api/config/:token` (`portal/routes/install.js`) ✅
- Exige TLS en prod (`req.secure` + `NEUBAT_PUBLIC_URL` https)
- Header `Cache-Control: no-store, private`
- Tests: `portal/tests/routes/install.test.js` (bloque T5)

### T6. `docker-compose.yml` — Secretos y TLS ✅
- Inyecta `NEUBAT_HMAC_SECRET`, `NEUBAT_PUBLIC_URL=https://...`, `NEUBAT_LIVE_BASE=https://...`, `NEUBAT_USE_LIVE=1`
- **F3**: `NEUBAT_TRUST_PROXY=1` (para `req.secure` detrás de reverse-proxy)

### T7. Portal Docker — Usuario No-Root ✅
- `portal/Dockerfile`: `addgroup/adduser neubat (UID 1000)`, `chown -R neubat:neubat /app`, `USER neubat`

### T8. Ansible — `host_key_checking = True` ✅
- `ansible/ansible.cfg`: `host_key_checking = True`

### T9. Perfiles Base — Passwords No Hardcodeadas ✅
- Eliminada clave `"password"` de `configs/*.json` (5 archivos)
- `portal/routes/install.js`: genera `effectivePassword = crypto.randomBytes(16).toString('hex')` si no hay password

### T10. Fixture HMAC Canónica Actualizada ✅
- `tests/fixtures/hmac-canonical.json`: regenerada con `encryption.method=passphrase`, claves orden canónico

### T11. Makefile — Targets Test P0 ✅
- `test-hmac`, `test-cmdline-parser`, `test-profiles`, `test-p0` (agrega los 3)

### T12. CI — Job `p0-tests` ✅
- `.github/workflows/ci.yml`: job `p0-tests` (needs: quality) corre `make test-p0`

---

## Fixes Adicionales (F1–F5) — Hallados en Revisión de Seguridad

| Fix | Archivo | Cambio |
|-----|---------|--------|
| **F1** Passphrase por defecto | `configs/production.json:53` | `"passphrase": "neubat"` → `""` |
| **F2** `loadProfile` sin allowlist | `portal/lib/db.js` | Añadido regex `^[A-Za-z0-9_-]{1,64}$` (mismo que utils.sh) |
| **F3** TLS bypass si PUBLIC_URL no https | `portal/server.js:start()` | Exige `PUBLIC_URL.startsWith('https://')` en prod; `docker-compose.yml` añade `NEUBAT_TRUST_PROXY=1` |
| **F4** Secreto débil <32 aceptado | `portal/server.js:start()` | Valida `length >= 32` y rechaza placeholder `.env.example`; `scripts/20-archinstall.sh` warning si `${#secret}<32` |
| **F5** Defaults `neubat` residuales | `portal/lib/archinstall.js`, `scripts/20-archinstall.sh` | Fallbacks `password`/`passphrase` → `""` (install.js ya genera aleatorio) |

---

## F6/F7 — Completados En Este Mismo PR ✅

| Item | Descripción | Implementación |
|------|-------------|----------------|
| **F6** Duplicación parser cmdline | `neubat-autoinstall` usa `source` obligatorio de `utils.sh` (sin copia embebida); `token_re` solo minúsculas como el portal; `CMDLINE_OVERRIDE` solo con `NEUBAT_ALLOW_TEST_HOOKS=1` | `scripts/lib/utils.sh`, `iso/.../neubat-autoinstall`, `tests/bash/cmdline-parser.bats` (+2 tests) |
| **F7** Confidencialidad instalador | `curl --proto '=https'` + `--tlsv1.2` cuando la URL es https; `chmod 600` en config del instalador; `writeFile mode 0o600` en `install.js` | `scripts/20-archinstall.sh`, `portal/routes/install.js` |

---

## Verificación Pre-Merge (Ejecutada ✅)

```bash
make validate && make lint          # ✅
cd portal && npm test               # ✅ 113/113 (14 suites)
bats tests/bash/hmac.bats           # ✅ 6/6 (fail-closed + fixture canónica)
bats tests/bash/cmdline-parser.bats # ✅ 7/7
make smoke                          # ✅
make test-p0                        # ✅
```

---

## Notes para el Commit Final

- Un solo commit (squash T1–T12 + F1–F7) o commits atómicos por tarea
- Mensajes Conventional Commits en español: `fix(security): HMAC fail-closed en instalador y portal`
- No tocar `NEUBAT_ALLOW_DEFAULT_SECRETS` ni `NEUBAT_DISABLE_RATE_LIMIT` — quedan para P1
- No implementar envelope encryption, TPM2 — P2
- F6/F7 completados en este mismo PR (parser unificado, curl https-only, chmod 600)

---

## Resumen de Tests de Aceptación P0

| Hallazgo | Test | Comando |
|----------|------|---------|
| SEC-001 HMAC fail-open | `bats tests/bash/hmac.bats` + `npm test -- hmac` | `make test-hmac` |
| SEC-004 eval cmdline | `bats tests/bash/cmdline-parser.bats` | `make test-cmdline-parser` |
| SEC-003 perfiles públicos | `npm test -- account.test.js` | `make test-profiles` |
| SEC-002 Compose sin secreto | Integración: `docker compose up` + healthcheck | `make smoke` |
| SEC-005/010 auth installs | `npm test -- install.test.js` (P1, no bloquea P0) | — |