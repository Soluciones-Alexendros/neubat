# Contribuir a NEUBAT

### Propósito de este documento

- **Objetivos:** Explicar setup, flujo de rama/PR y reglas para contribuir sin romper el instalador, los perfiles JSON ni el portal.
- **Estructura:** Idioma → setup → flujo de trabajo → comprobaciones antes del PR → reglas.
- **Contenido a integrar según contexto:** Adapta Make y scripts npm de este repo. No copies un flujo pnpm/monorepo. La e2e QEMU y el build de ISO no son required.

Idioma: este fichero, `README.md` y `docs/guides|runbooks` en español. Identificadores de CI y nombres de jobs en inglés (`quality`, `test`, `build`, `smoke`).

Lee también [AGENTS.md](AGENTS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) y [SUPPORT.md](SUPPORT.md).

## Setup

```bash
cp -n .env.example .env
make install-deps
make install-deps-frontend
```

## Flujo de trabajo

Rama `feat/*` / `fix/*` / `docs/*` / `chore/*` → PR contra `main`. Los agentes Cloud usan `cursor/…`.

## Antes de un PR

```bash
npm install        # activa los hooks de git (husky), solo la primera vez
make lint
make test
make smoke
make test-e2e
make validate
```

### Hooks de git (husky)

Instalados automáticamente con `npm install` en la raíz:

- **pre-commit**: `lint-staged` — `bash -n` + `shellcheck` en `*.sh`, `node --check` en el JS del portal, `oxlint` en el frontend y JSON válido.
- **commit-msg**: `commitlint` — exige Conventional Commits (`feat:`, `fix:`, `chore:`, …).
- **pre-push**: `make validate && make smoke`.

Para saltárselos en casos excepcionales: `git commit --no-verify` (úsalo con criterio; CI vigila lo mismo).

### Monitorización de pipelines

```bash
make ci-status              # últimos runs del repo
make ci-watch               # vigila el último run de la rama actual hasta el final
make ci-watch RUN_ID=<id>   # vigila un run concreto
make ci-log RUN_ID=<id>     # logs del fallo de un run
```

Si todo verde: rápido para automerge. Ver [runbook CI](docs/runbooks/ci.md).

Si tocas el frontend: `make test-frontend` y `make build-frontend`.  
Si tocas `ansible/`: `make test-ansible`.  
Si tocas `scripts/*.sh`: `make test-bash` (requiere `bats`).

`make test-vm`, `make build-iso`, `make validate-iso` y `make test-iso-boot`
son opt-in (largos / Docker / QEMU).

## Reglas

- El instalador **destruye el disco objetivo**. No relajes validaciones de `00-preinstall.sh` ni de `part_name()` sin prueba explícita.
- Cambios de contrato (API `/api/*`, formato JSON de `configs/`, HMAC, tokens) → actualiza `ARCHITECTURE.md` o un ADR en `docs/architecture/decisions/`.
- Conventional Commits. Cuerpo y docs en español.
- Vulnerabilidades: [SECURITY.md](SECURITY.md), no un issue público.
- Sin secretos, `.env`, `out/*.iso` ni datos de `portal/data/` en el diff.
