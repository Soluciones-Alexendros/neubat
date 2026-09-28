# Changelog

Registro de cambios relevantes de NEUBAT. Formato inspirado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Las versiones de producto no se generan con semantic-release. El esquema es [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-09-25

### Added

- El configurador abre por tres caminos: Uso diario, Desarrollo y Servidor mínimo. Hyprland queda como ajuste.
- Alineación P0/P1/P2 al contrato de repositorio (docs canónicos, CI `quality`/`test`/`build`/`smoke`, Renovate, Make fachada, meta-secciones).
- `SUPPORT.md` y workflow `security` (actionlint semanal y en cambios de `.github/`).
- Pruebas de cuenta, sesión y absorción para que el gate de cobertura del portal se ejecute de verdad.
- Análisis CodeQL (JavaScript y Python), revisión de dependencias en pull requests y attestation del artefacto de frontend.

### Changed

- **Breaking:** `POST /api/install` rechaza un cifrado cuya contraseña o passphrase sea `neubat`. El laboratorio puede exportar `NEUBAT_ALLOW_DEFAULT_SECRETS=1`.
- El portal exige Node.js 22 o superior. Node 18 está fuera de soporte.
- axe corre sobre `Layout` (landing, configurar y cuenta) en Vitest. El job `smoke` ya no evalúa un HTML escrito a mano.
- El panel `/api/admin` cubre 404, borrado de token no hex y fallos de lectura (100 % de ramas en ese módulo).
- Línea base de cobertura del frontend: 43 % de líneas y 39 % de ramas (`npm run test:coverage` en `portal/frontend`). No es un gate.
- Los workflows fijan cada `uses` a un commit y `build-iso` declara permisos. El tag de la ISO entra por el entorno, no interpolado en el script.
- Los jobs de CI quedan encadenados: `quality` → `test` → `build` → `smoke`.
- `make test` recoge cobertura Jest (umbral global 70 %).
- Renovate programa minor/patch y lockfile antes de las 06:00, `Europe/Madrid`.

### Security

- El portal y el instalador rechazan un disco cifrado cuya contraseña o passphrase LUKS sea `neubat`. Laboratorio: `NEUBAT_ALLOW_DEFAULT_SECRETS=1`.

## [1.0.0] - 2026-09-20

### Added

- Portal web (Express + SPA React) con cuentas, configurador e integridad HMAC.
- Arranque iPXE e ISO híbrida autoinstalable.
- Particionado GPT/UEFI/btrfs, LUKS2 opcional y snapper.
- Post-instalación Ansible (first-boot) y panel `/admin`.
- Suite de tests del portal, frontend, bats y workflow opt-in de ISO.

Ver [docs/RELEASE-v1.0.0.md](docs/RELEASE-v1.0.0.md).

[Unreleased]: https://github.com/Soluciones-Alexendros/neubat/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Soluciones-Alexendros/neubat/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Soluciones-Alexendros/neubat/releases/tag/v1.0.0
