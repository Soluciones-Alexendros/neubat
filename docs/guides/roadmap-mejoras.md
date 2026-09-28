# Roadmap de mejoras — estado y backlog

> Revisión de estado del repositorio (2026-09) y backlog priorizado de desarrollos, mejoras y complementos.
> Fuentes de la revisión: exploración completa de `portal/`, `scripts/`, `ansible/`, `configs/`, `tests/`,
> `.github/workflows/` y `docs/`. El item D1 (catálogo categorizado) ya está implementado;
> este documento es la referencia para lo pendiente.

## 1. Estado actual por áreas

### Instalador (`scripts/`, fases 00–50 + `lib/`)

Completo, sin stubs. Orquestador `neubat-install.sh` (flujo: preinstall → particionado →
instalación base → postinstall → snapper → portal local → Ansible first-boot → finalización).
Puntos fuertes: particionado GPT/UEFI con LUKS2 (keyfile o passphrase), NVMe-safe vía
`part_name()`, verificación HMAC de la configuración descargada, snapper con retención,
absorb de sistemas existentes (`neubat-absorb.sh`), build de ISO con mkarchiso.

Deuda y riesgos:

- `features.ssh` de `configs/production.json` ya lo lee `20-archinstall.sh` y lo aplica
  `30-postinstall.sh` (gate de `sshd`). `features.{firewall,automatic_updates,backup}`
  siguen pendientes de implementación real; el instalador avisa si están activos.
- La firma HMAC cubre ya `aur_packages` y `features` (además de `encryption`/`snapshots`),
  con serialización JSON canónica idéntica en JS y Python. Contrato en `ARCHITECTURE.md`.
- Ansible first-boot repite trabajo ya hecho por `30-postinstall.sh`/`40-portal-deploy.sh`
  (crear usuario, instalar paquetes, desplegar portal). Alinear alcance.
- El motor archinstall queda opt-in (`NEUBAT_USE_ARCHINSTALL=1`); el camino por defecto es
  pacstrap manual. Falta ADR que fije esta decisión.

### Portal backend (`portal/`, Express 4, CommonJS)

Maduro: API de instalación (token + config firmada + iPXE), admin con Bearer, auth de
usuarios por sesión, absorb, métricas. Jest + Supertest con ~95 % de cobertura en
server/lib/routes.

Deuda:

- Validación de entrada en `POST /api/install` (hostname RFC-1123, username, locale,
  keyboard, timezone, desktop y nombres de paquete con allowlist/regex) → 400. El heredoc
  de `30-postinstall.sh` ya no expande variables del shell live (RCE cerrado).
- Persistencia JSON sin lock: el patrón read-write-write en `routes/install.js` y
  `lib/users.js` puede perder registros bajo concurrencia.
- Sesiones sin GC de caducadas; rate limiter en memoria sin eviction.
- `/api/complete` debe limitar `status` a una whitelist (`completed|failed`).
- Bloque muerto en `bootRouter` (`routes/install.js:185-187`) — eliminado en esta revisión.

### Portal frontend (`portal/frontend/`, React 19 + Vite + TS + Tailwind 4)

Configurador = formulario único largo (`ConfigurePage.tsx`), sin wizard ni validación
nativa (`noValidate`). Huecos detectados:

- Sin UI para disco (riesgo: el perfil fija `/dev/sda` vs `/dev/nvme0n1`), red, servicios,
  swap, retención de snapshots, usuarios adicionales.
- AUR soportado en tipos/backend/perfil developer pero sin UI (resuelto por D1).
- El usuario no ve el estado de sus instalaciones (`user_id` se guarda en backend pero no
  hay endpoint "mis instalaciones").
- Sin tests de AdminPage, DownloadPage y AccountPage.
- Dockerfile en `node:20` contra `engines >=22` (corregido a `node:22-alpine`).

### Docs, tests y CI

Docs sólidas pero **0 ADRs registrados** (solo plantilla) y faltan runbooks operativos.
CI: quality/test/build/smoke verdes; ISO y e2e VM opt-in. Tests bash cubren
`lib/utils.sh` y la canonicalización de la firma HMAC con `aur_packages` (fixture
compartida JS↔Python en `tests/fixtures/hmac-canonical.json`). El workflow
`security.yml` corre actionlint, enforcement de acciones fijadas por SHA, gitleaks
(historial completo) y osv-scanner (dependencias). Falta la validación de esquema de
perfiles `configs/*.json` en `make validate`.

## 2. Backlog priorizado

### Desarrollos (features nuevas)

| # | Item | Valor | Esfuerzo |
|---|------|-------|----------|
| D1 | **Catálogo de paquetes categorizado** en el configurador: familias, roles, funciones, origen oficial/AUR, búsqueda y filtros estilo inventario (ver `portal/catalog/packages.json` y sección Software de `/configurar`) | Alto | Hecho |
| D2 | **Mis instalaciones**: `GET /api/account/installations` filtrando por `user_id` (ya persistido) + sección en AccountPage con estado del token | Alto | M |
| D3 | **Consumo real de `features`** en Ansible first-boot: firewall (nftables/ufw), ssh (hardening básico de `sshd_config`), automatic_updates (reflector/pacman timer), backup (restic o similar) | Alto | M-L |
| D4 | **Selector de disco** en el configurador: mostrar el disco del perfil, advertencia de destrucción y permitir override (el backend ya acepta `disk` en el merge) | Alto | S |
| D5 | UI de **retención de snapshots** (hoy solo on/off), **servicios** a habilitar y **red** | Medio | M |
| D6 | **Perfiles como paquetes versionados** (roadmap P3): editor de perfiles en portal o repo de perfiles con versionado semántico | Medio | L |

### Mejoras (deuda técnica)

| # | Item | Estado |
|---|------|--------|
| M1 | Alinear versiones visibles a la release (banner, health, footer, `NEUBAT_RELEASE_TAG` default, `NEUBAT_VERSION`, campo `version` de perfiles) | Hecho (2.0.0) |
| M2 | Dockerfile a `node:22-alpine` | Hecho |
| M3 | Makefile: mensaje correcto en `validate-ansible` | Hecho |
| M4 | Whitelist de `status` en `POST /api/complete` | Hecho |
| M5 | Eliminar bloque muerto en `bootRouter` | Hecho |
| M6 | Selección de paquetes acumulativa al cambiar de preset/intención (merge, no overwrite) | Hecho (D1) |
| M7 | Validación de esquema en `POST /api/install` (hostname, username, packages) con tests | Hecho |
| M8 | Persistencia JSON atómica (write tmp + rename) en `install.js`/`users.js` | Hecho |
| M9 | GC de sesiones caducadas y eviction del rate limiter | Hecho |
| M10 | Tests frontend de AdminPage, DownloadPage y AccountPage | Pendiente |
| M11 | Validación de esquema de perfiles `configs/*.json` en `make validate` + test de firma con `aur_packages` | Parcial (test de firma con `aur_packages` Hecho; validación de esquema Pendiente) |
| M12 | CSP activa con `helmet` (hash del script inline de tema; `upgrade-insecure-requests` desactivado para no romper el portal local por HTTP) | Hecho |
| M13 | Endurecer CI de seguridad: gitleaks, osv-scanner y enforcement de acciones fijadas por SHA en `security.yml` | Hecho |
| M14 | Cerrar las 10 alertas de code-scanning abiertas: path-injection en `loadProfile`/`configPathFor`, XSS reflejado/DOM, rate-limiting en `/boot`, falso positivo de HMAC | Hecho (28-sep-2026) |

### Complementos (diseño y documentación)

| # | Item | Prioridad |
|---|------|-----------|
| C1 | ADRs reales: motor archinstall opt-in, esquema canónico de firma HMAC (qué campos entran y por qué), portal dual (modo local con fallback) | Alta |
| C2 | Runbooks: recuperación de LUKS con keyfile perdido, restauración de sistema con snapper, rotación de `NEUBAT_HMAC_SECRET` | Alta |
| C3 | e2e VM de LUKS + snapper + HMAC en conjunto (roadmap P1) | Alta |
| C4 | Decidir si `version` de perfiles/instalador se bumpea por release y automatizarlo | Media |
| C5 | Servidor iPXE propio (roadmap P3) | Media |
| C6 | Vista "inventario" post-instalación: categorizar el absorb (`neubat-absorb.sh` → `POST /api/account/absorb`) con el mismo modelo de familias/funciones del catálogo | Media |
| C7 | Alinear alcance de Ansible first-boot con 30/40 (quitar redundancia) | Baja |

## 3. Contratos que no hay que romper

- `configs/*.json`: cambiar su esquema rompe la firma HMAC y `scripts/20-archinstall.sh`.
  Cualquier campo nuevo requiere confirmación y coherencia con `signingPayload`.
- `part_name()` y los scripts `00-preinstall.sh`/`10-partition.sh`: tocarlos requiere
  confirmación explícita (destrucción de disco).
- El `signingPayload` canónico vive en `portal/lib/db.js` y debe coincidir con
  `scripts/20-archinstall.sh`.
