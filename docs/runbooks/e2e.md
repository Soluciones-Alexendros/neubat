# Runbook: pruebas E2E con Playwright

### Propósito de este documento

- **Objetivos:** Ejecutar, depurar y extender la suite E2E de navegador que recorre el portal completo (configurador, cuenta, descargas, admin y contratos API) contra el backend real.
- **Estructura:** Qué es → cómo correrla → cómo funciona el entorno → cómo añadir specs → fallos habituales.
- **Contenido a integrar según contexto:** La suite vive en `portal/e2e/` y corre en el job `e2e` de `.github/workflows/ci.yml`. No la muevas dentro de `portal/frontend` (es cross-stack: SPA + Express).

## Qué cubre

Siete specs (36 tests) sobre Chromium:

| Spec | Cobertura |
| ---- | --------- |
| `api.spec.ts` | Contratos API extremo a extremo: health, catálogo, ciclo de vida install → config → boot iPXE → complete, rechazo de LUKS con secreto por defecto, 401 admin |
| `landing.spec.ts` | Landing, navegación, tema claro/oscuro persistente, título por ruta |
| `configurar.spec.ts` | El configurador entero: intención, perfil, escritorio, identidad, catálogo de paquetes (buscar/filtrar/marcar), LUKS, snapshots, generar instalación y flujo punta a punta |
| `cuenta.spec.ts` | Registro/login por UI, persistencia de sesión, guardar config en cuenta, absorción |
| `descargar.spec.ts` | Descargas con stub interceptado (`page.route`) y verificación SHA-256 en navegador |
| `admin.spec.ts` | Panel admin: token, tabla, buscador/filtros, acciones con diálogo `confirm()` nativo |
| `instalacion.spec.ts` | Formulario clásico de `/instalar` |

## Cómo correrla

```bash
make test-e2e              # build-frontend + deps + suite completa
cd portal/e2e && npm run test:e2e:ui     # modo interactivo (depuración)
cd portal/e2e && npm run test:e2e:report # abre el informe HTML del último run
```

La primera vez necesitas el navegador: `cd portal/e2e && npx playwright install chromium` (lo hace `make install-deps-e2e` + este comando).

## Cómo funciona el entorno

- `playwright.config.ts` levanta el servidor con `start-server.sh` (`webServer`): compila el frontend si falta o si hay fuentes más recientes que el build (servir un SPA obsoleto falla de forma confusa) y arranca `portal/server.js` en `http://127.0.0.1:3101`.
- Datos **aislados en tmp efímero** (`NEUBAT_DATA_DIR`/`NEUBAT_CONFIGS_DIR`/`NEUBAT_USERS_DIR`): la suite no toca `portal/data/` ni `portal/configs/generated/` reales. Mismo patrón que `portal/tests/setup.js`.
- `ADMIN_TOKEN=test-admin-token` y rate limit desactivado (`NEUBAT_DISABLE_RATE_LIMIT=1`, solo evaluado en `portal/server.js`): la suite supera las 100 req/15 min por IP. Nunca definas esa variable fuera de tests.
- `workers: 1`: los specs comparten servidor y estado. Cada spec siembra lo que necesita vía API en `beforeAll` con datos únicos; no asumas orden de ejecución.
- Credenciales de usuario: el fixture `registeredUser` (`fixtures.ts`) registra un usuario fresco por API; la UI de login/registro se ejercita en `cuenta.spec.ts`.

## Cómo añadir un spec

1. Crea `portal/e2e/specs/<nombre>.spec.ts` importando `test`/`expect` de `../fixtures`.
2. Usa selectores Testing Library (`getByRole`, `getByLabel`, `getByText`); ojo al matching por subcadena (usa `exact: true` ante ambigüedad).
3. Siembra datos vía el `request` fixture; nunca reutilices datos de otro spec.
4. Nada de red externa: intercepta con `page.route` cualquier descarga o fetch grande.
5. Perfiles con cifrado: el portal rechaza passphrase/password por defecto `neubat` (uso `production` cifrado por defecto); manda claves fuertes.

## Fallos habituales

| Señal | Acción |
| ----- | ------ |
| 429 `Demasiadas peticiones` | `NEUBAT_DISABLE_RATE_LIMIT=1` no llegó al servidor (revisa `start-server.sh`) |
| La UI no coincide con el test tras tocar el frontend | El test fija contrato: actualízalo si el cambio es deliberado; `start-server.sh` recompila solo si detecta fuentes nuevas |
| `confirm()` bloquea el test | Registra `page.on('dialog')` antes del clic (ver `admin.spec.ts`) |
| Descarga de ISO real (~1 GB) en el test | Intercepta con `page.route` (ver `descargar.spec.ts`) |
| Rojo solo en CI | Descarga el artefacto `playwright-report` del job `e2e`; los traces se capturan en el primer retry (`CI=true`) |
