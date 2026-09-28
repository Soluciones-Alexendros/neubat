# Runbook: CI

### Propósito de este documento

- **Objetivos:** Explicar los jobs canónicos y qué hacer cuando uno falla, sin promover e2e frágil a required.
- **Estructura:** Orden de jobs → mapeo a Make → fallos → opt-in y workflow security.
- **Contenido a integrar según contexto:** Renombra o documenta jobs aquí si cambia `.github/workflows/ci.yml`. No copies un pipeline de otro stack. `build-iso.yml` y `make test-vm` siguen opt-in.

## Jobs canónicos (`.github/workflows/ci.yml`)

Van encadenados: `quality` → `test` → (`build` → `smoke`, `e2e`). Un fallo corta los siguientes.

| Job | Equivale a | Qué cubre |
| --- | ---------- | --------- |
| `quality` | `make validate` + `make lint` + Ansible syntax/lint + oxlint frontend | Estática |
| `test` | `make test` (Jest con cobertura ≥70 %) + frontend Vitest (incluye axe sobre Layout) + `make test-bash` | Unidad / integración rápida y a11y del árbol React |
| `build` | `make build-frontend` | Artefacto desplegable (SPA Vite) |
| `smoke` | `make smoke` | Contraste de tokens + health + `POST /api/install` |
| `e2e` | `make test-e2e` | Suite Playwright (Chromium): toda la UI + contratos API contra el backend real. Ver [runbook e2e](./e2e.md) |

`build` y `e2e` cuelgan de `test` y corren en paralelo; `smoke` sigue a `build`.

`.github/workflows/security.yml` ejecuta actionlint al cambiar `.github/**` y cada lunes a las 06:00 UTC. No es un check obligatorio de `main`: si lo fuera, los PR que no tocan workflows se quedarían esperando un job que no arranca.

La cobertura del frontend se mide con `npm run test:coverage` en `portal/frontend` (línea base 43 % líneas / 39 % ramas, 25-sep-2026). No hay umbral: por debajo del 70 % de la flota no se publica como check.

## Fallos

1. Abre el log del job con el nombre canónico (`quality`, `test`, `build`, `smoke`).
2. Reproduce en local el objetivo Make de la tabla.
3. No “arregles” un rojo aflojando el job ni saltándote `validate`.
4. Si el fallo es de dependencia de Actions, Renovate debe proponer el bump (sin automerge de majors).

## Monitorización

```bash
make ci-status              # últimos runs del repo (gh)
make ci-watch               # vigila el último run de la rama actual (--exit-status)
make ci-watch RUN_ID=<id>   # vigila un run concreto
make ci-log RUN_ID=<id>     # logs del fallo para diagnóstico
```

Procedimiento ante un run rojo: `make ci-log RUN_ID=<id>` → identifica el job →
reproduce en local con su equivalente Make (tabla de arriba) → fix en rama
`fix/…` → push → `make ci-watch` hasta verde. Los hooks de git (husky) ya
impiden que lleguen al remoto los fallos que detectan en local (sintaxis,
formato de commit, validate+smoke).

## Opt-in (no required)

- `make test-vm` — QEMU/NVMe, ~40 min. Ver [tests/vm/README.md](../../tests/vm/README.md).
- `make test-iso-boot` — smoke de arranque de la ISO propia en QEMU, ~5-15 min. Ver [runbook ISO](./iso.md).
- Workflow **Build ISO** — `workflow_dispatch` o tag `v*`. Valida la ISO estáticamente tras el build; el input `boot_smoke` añade el arranque en QEMU.
