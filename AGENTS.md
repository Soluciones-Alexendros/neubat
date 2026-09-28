# AGENTS.md

### Propósito de este documento

- **Objetivos:** Fijar el contrato operativo para agentes de código y el rol Mantenedor: fuentes de verdad, autonomía, comandos y Definition of Done.
- **Estructura:** Destinatarios → fuentes de verdad → unidad de trabajo → autonomía → stack y comandos → convenciones → layout → Definition of Done.
- **Contenido a integrar según contexto:** Adapta layout, Make y scripts npm de este repo. No copies un `AGENTS.md` de landing/SaaS. No conviertas `test-vm` ni el build de ISO en required. No commitees `.env` ni keyfiles.

**Destinatarios:** agentes de código y el rol Mantenedor que trabajen en este repositorio.  
**Propósito:** contrato operativo. Homogeneizamos **nombres y contratos**, no el lenguaje ni la API del producto.

## Fuentes de verdad (orden)

1. [README.md](./README.md) — producto, quickstart y avisos de destrucción de disco
2. Este archivo
3. [ARCHITECTURE.md](./ARCHITECTURE.md)
4. [docs/architecture/](./docs/architecture/) — overview y ADRs
5. [CONTRIBUTING.md](./CONTRIBUTING.md)
6. [SECURITY.md](./SECURITY.md)
7. [SUPPORT.md](./SUPPORT.md)

No reinventes requisitos. Si falta ancla, paras y preguntas.

## Unidad de trabajo

```
Objetivo: <resultado verificable>
Traza: <ADR / issue / script o ruta API>
Alcance: <archivos>
Exclusiones: <qué no harás>
Pruebas: make lint && make test && make smoke && make test-e2e && make validate
Criterio de cierre: CI quality + test + smoke (+ build si toca frontend) verdes
```

Una sesión = una unidad cohesiva. PR pequeño. Mensajes al humano y commits en español (Conventional Commits).

## Autonomía

**Puedes sin preguntar**

- Tests que fijan comportamiento ya aceptado
- Corregir lint/format/typecheck causados por tu cambio
- Docs de guía/runbook en español
- Refactors locales que no cambien la API del portal ni el particionado

**Requiere confirmación**

- Cambiar el contrato de `configs/*.json`, tokens hex o HMAC
- Relajar `00-preinstall.sh`, `10-partition.sh` o `part_name()`
- Dependencia runtime nueva en `portal/`
- Convertir `test-vm` o `build-iso` en job required
- Tocar secretos, branch protection u org settings

## Stack y comandos

- Portal: Node ≥ 22 (LTS; CI 22), Express, Jest + Supertest
- Frontend: React + Vite + TypeScript + shadcn/ui + Vitest + oxlint
- Instalador: Bash + python3 (sin jq/bc) + Ansible first-boot
- Fachada: GNU Make

```bash
make install-deps && make install-deps-frontend
make lint && make test && make smoke && make validate
make test-frontend && make build-frontend   # si tocas portal/frontend
make test-e2e                               # suite E2E Playwright (portal/e2e)
make ci-status                              # estado de los pipelines (gh CLI)
```

Hooks de git: `npm install` en la raíz activa husky (pre-commit con lint-staged, commit-msg con commitlint Conventional Commits, pre-push con validate+smoke). Saltarlos (`--no-verify`) es excepción, no la norma.

CI principal (`.github/workflows/ci.yml`): jobs `quality`, `test`, `build`, `smoke`, `e2e`.  
ISO y QEMU quedan en workflow/target opt-in (`make build-iso`, `make validate-iso`, `make test-iso-boot`, `make test-vm`).

## Convenciones

- Ramas `feat/` `fix/` `docs/` `chore/` (los agentes Cloud usan `cursor/…`)
- Idioma: README/CONTRIBUTING/docs de guía en español; jobs de CI en inglés
- No commitees `out/`, `portal/data/`, `portal/public/assets/`, `.env` ni secretos
- Conserva GPL-3.0; no sustituyas `LICENSE`

## Layout

```
portal/           Express + SPA React (frontend/)
scripts/          Instalador por fases (00–50) + build-iso
configs/          Perfiles JSON
netboot/          iPXE + GRUB loopback
iso/              Overlay archiso (autoinstall)
ansible/          First-boot
tests/            bats + vm opt-in
docs/             architecture/, guides/, runbooks/
```

## Definition of Done

- Criterios de la traza cumplidos
- Jobs `quality`, `test`, `smoke` y `e2e` verdes (`build` si hay artefacto frontend)
- Docs canónicos actualizados si cambia el contrato
- Sin secretos en el diff
