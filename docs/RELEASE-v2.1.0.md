# NEUBAT 2.1.0

### Propósito de este documento

- **Objetivos:** Dejar las notas de la versión 2.1.0 alineadas con `CHANGELOG.md`, que es la fuente.
- **Estructura:** Mismas entradas que la sección `[2.1.0]` del changelog.
- **Contenido a integrar según contexto:** Si el changelog cambia antes del tag, copia aquí la misma sección. No redactes notas distintas.

## Added

- Suite E2E con Playwright: 7 specs y job `e2e` en CI, con runbook dedicado.
- Catálogo de software en el configurador (`GET /api/catalog` con fallback).
- Tooling ISO/VM: `scripts/validate-iso.sh`, `tests/vm/boot_iso_smoke.py` y targets `make` asociados.
- Hooks de git en la raíz (husky + lint-staged + commitlint, Conventional Commits).
- Fixture dorada HMAC JS↔Python (`tests/fixtures/hmac-canonical.json`), cubierta por Jest y bats.
- `docs/guides/tareas.md`: tareas inmediatas y backlog con criterio de cierre.
- Rate limiting parametrizado en `GET /boot/:token` (configurable por entorno).

## Changed

- `POST /api/install` valida hostname, usuario, contraseña, locale, teclado y paquetes.
- El payload firmado HMAC cubre ahora `aur_packages` y `features`.
- `toArchinstallPair` deja de inyectar la contraseña `neubat` silenciosa y permite fijar versión.
- Eliminada la URL muerta `/setup/<machine-id>`; el portal local apunta a la raíz.
- Helmet con CSP real (hash del script inline de tema) y `connect-src` para la descarga verificada.
- `security.yml`: gitleaks, osv-scanner y enforcement de acciones fijadas por SHA.
- `GET /api/releases` apunta por defecto al tag `v2.1.0`.
- Portal en versión 2.1.0 (`/api/health`).

## Security

- Cierre de RCE como root en `scripts/30-postinstall.sh` (heredoc sin expansión en el shell live).
- Bearer de admin comparado en tiempo constante (`crypto.timingSafeEqual`).
- Rate limiting con `express-rate-limit` en `/register`, `/login`, `/absorb` no autenticado y `/boot/:token`.
- Allowlist `PROFILE_RE` en `loadProfile`: cierra path traversal en perfiles.
- Wiki: `innerHTML` → `textContent` en el render de Markdown (cierra XSS-through-DOM).
- Boot iPXE prioriza `NEUBAT_PUBLIC_URL` y valida el Host; trust proxy opt-in.
- Escritura atómica del store de sesiones con purga de caducadas; manejador global sin trazas.
- Code-scanning en 0 alertas abiertas (fixes reales + descartes documentados T5).
