# NEUBAT — Plan de Ejecución 360° E2E Integral

**Versión:** 1.0
**Fecha:** 2026-10-02
**Estado:** Borrador para revisión
**Autor:** Agente de planificación (read-only)

---

## 1. Resumen Ejecutivo

Este documento define un plan de ejecución **end-to-end completo** que cubre **todos los componentes, configuraciones, flujos y fronteras** del proyecto NEUBAT. El objetivo es:

1. **Detectar fallos** en cualquier capa (portal, instalador, frontend, ansible, ISO, CI/CD)
2. **Garantizar funcionamiento** de cada feature y combinación válida
3. **Implementar tests integrados de validación** en cada función crítica
4. **Automatizar la ejecución** en CI y local con criterios de calidad claros

---

## 2. Mapa de Componentes y Fronteras

### 2.1 Componentes Principales

| Componente | Tecnología | Punto de Entrada | Responsabilidad |
|------------|------------|------------------|-----------------|
| **Portal API** | Node.js 22 + Express | `portal/server.js` | REST API, HMAC, rate-limit, auth, iPXE |
| **Portal Frontend** | React 18 + Vite + TS | `portal/frontend/src/main.tsx` | SPA configurador, catálogo, auth, descargas |
| **Instalador Maestro** | Bash | `scripts/neubat-install.sh` | Orquestación fases 00-50 |
| **Fase 00** | Bash | `scripts/00-preinstall.sh` | Validaciones previas (root, UEFI, disco, red) |
| **Fase 10** | Bash | `scripts/10-partition.sh` | GPT/UEFI/btrfs, LUKS2, NVMe-safe (`part_name`) |
| **Fase 20** | Bash + Python | `scripts/20-archinstall.sh` | Fetch config (TLS), HMAC verify, archinstall/pacstrap |
| **Fase 30** | Bash | `scripts/30-postinstall.sh` | Config sistema, users, services, apps, bootloader |
| **Fase 35** | Bash | `scripts/35-snapper.sh` | Btrfs snapshots, limpieza programada |
| **Fase 40** | Bash | `scripts/40-portal-deploy.sh` | Despliegue portal local + URL única |
| **Fase 50** | Bash + Ansible | `scripts/50-firstboot-ansible.sh` | Primer arranque via Ansible |
| **Ansible Role** | Ansible | `ansible/roles/neubat/` | Configuración post-instalación |
| **ISO Builder** | Docker + archiso | `scripts/build-iso.sh` | ISO híbrida con autoinstall |
| **Netboot** | iPXE + GRUB | `netboot/` | Arranque por red (token + perfil) |

### 2.2 Fronteras de Integración (Contratos)

| Frontera | Contrato | Validación Actual | Gap |
|----------|----------|-------------------|-----|
| Portal → Instalador | JSON config + HMAC-SHA256 | `signingPayload` / `verify_config_signature` | ✅ Tests bats + fixture |
| Portal → Frontend | REST API (install, config, catalog, auth) | OpenAPI implícito + tests E2E | ⚠️ Sin schema formal |
| Instalador → Ansible | Vars YAML generadas | `neubat-ansible-vars.yml` | ⚠️ Sin tests de integración |
| Kernel cmdline → Instalador | `neubat_token`, `neubat_profile`, `neubat_portal_url` | `parse_kernel_cmdline` allowlist | ✅ Tests bats |
| ISO → QEMU | ISO boot + autoinstall | `test-iso-boot`, `test-vm` (opt-in) | ⚠️ Solo opt-in, no required |
| Frontend ↔ Portal | Fetch API + tokens | Tests Playwright 7 specs | ✅ E2E cubierto |

---

## 3. Matriz de Configuraciones (Perfiles × Opciones)

### 3.1 Perfiles Base (5)

| Perfil | Desktop | Cifrado | Snapshots | Paquetes Clave | Uso |
|--------|---------|---------|-----------|----------------|-----|
| `base` | none | ❌ | ❌ | htop, btop, fastfetch, git, curl, wget, okular | Mínimo funcional |
| `minimal` | none | ❌ | ❌ | Solo base + sshd | Contenedores/VMs |
| `production` | kde | ✅ keyfile | ✅ | KDE + apps oficina | Producción estándar |
| `developer` | gnome | ✅ keyfile | ✅ | GNOME + toolchain dev | Desarrollo |
| `vm-luks` | none | ✅ keyfile | ❌ | base + qemu-guest-agent | VMs con LUKS |

### 3.2 Opciones Variables (Combinatorias)

| Opción | Valores | Impacto en Instalador |
|--------|---------|----------------------|
| **Desktop** | `none`, `kde`, `gnome`, `xfce`, `hyprland`, `sway`, `i3`, `niri` | Paquetes, config WM, display manager |
| **Cifrado** | `disabled`, `keyfile`, `interactive` | LUKS2, keyfile en /boot, passphrase interactiva |
| **Snapshots** | `enabled`/`disabled` + retención (hourly/daily/weekly/monthly) | Snapper, config limpieza |
| **Features** | `ssh`, `firewall`, `automatic_updates`, `backup` | Servicios, hooks (algunos TODO) |
| **AUR packages** | Lista libre | `yay`/`paru` en postinstall |
| **Disco objetivo** | `/dev/sdX`, `/dev/nvmeXnY` | `part_name()` NVMe-safe |

### 3.3 Matriz de Combinaciones Críticas (Prioridad P0)

| Combo | Perfil | Desktop | Cifrado | Snapshots | Feature | Test Requerido |
|-------|--------|---------|---------|-----------|---------|----------------|
| C1 | production | kde | keyfile | ✅ | ssh | E2E completo |
| C2 | developer | gnome | keyfile | ✅ | ssh | E2E completo |
| C3 | vm-luks | none | keyfile | ❌ | ssh | VM test |
| C4 | base | none | disabled | ❌ | ssh | Smoke rápido |
| C5 | minimal | none | disabled | ❌ | ssh | CI rápido |
| C6 | production | hyprland | interactive | ✅ | ssh | E2E + interactive |
| C7 | developer | sway | keyfile | ✅ | ssh + firewall | E2E + firewall TODO |

---

## 4. Pirámide de Tests — Cobertura Objetivo

### 4.1 Niveles de Test

```
                    ┌─────────────────────┐
                    │   E2E / VM Tests    │  ← 7 specs Playwright + QEMU opt-in
                    │   (User Journeys)   │
            ┌───────┴─────────────────────┴───────┐
            │         Integration Tests           │  ← API + Installer + Ansible
            │    (Component Boundaries)           │
    ┌─────────┴─────────────────────────────┴─────────┐
    │            Contract Tests                       │  ← HMAC, cmdline, JSON schemas
    │      (Producer-Consumer Contracts)              │
┌───┴───────────────────────────────────────────────┴───┐
│              Unit Tests (Current)                     │  ← Jest (88) + Vitest + Bats (11)
│         (Functions, Utils, Pure Logic)                │
└───────────────────────────────────────────────────────┘
```

### 4.2 Cobertura Actual vs. Objetivo

| Capa | Tests Actuales | Objetivo 360° | Gap Crítico |
|------|----------------|---------------|-------------|
| **Unit (Portal)** | 88 tests (Jest) | 100% funciones exportadas | `archinstall.js`, `auth.js` bajos |
| **Unit (Frontend)** | Vitest (components, hooks, utils) | 100% hooks + utils | `paths.ts`, `catalog.ts` |
| **Unit (Bash)** | 11 bats (hmac 4 + cmdline 7) | 100% funciones `utils.sh` | `cfg_get`, `part_name`, `reject_public_luks_secret` |
| **Contract (HMAC)** | ✅ Fixture canónica + 6 tests | ✅ Completo | — |
| **Contract (cmdline)** | ✅ 7 tests allowlist | ✅ Completo | — |
| **Integration (API)** | Tests routes (install, account, admin, auth, status) | Portal completo + error paths | Rate-limit, auth flow completo |
| **Integration (Installer)** | ⚠️ Solo via `test-vm` opt-in | **Cada fase + combinaciones** | **CRÍTICO: Sin tests integración instalador** |
| **Integration (Ansible)** | ❌ Ninguno | Role + vars + idempotencia | **CRÍTICO** |
| **E2E (Frontend)** | 7 specs Playwright | User journeys completos | Falta: flujos error, offline, auth |
| **E2E (Instalador)** | 2 scripts VM (opt-in, ~40 min) | **Matrix perfiles × opciones** | **CRÍTICO: No required en CI** |
| **Security** | CodeQL + P0 tests | SAST + DAST + Secrets + Supply chain | DAST, supply chain |
| **Performance** | ❌ Ninguno | Benchmarks instalador, portal latency | **NUEVO** |

---

## 5. Plan de Ejecución por Capas

### 5.1 Capa 1: Unit Tests — Fortalecimiento (Sprint 1)

**Objetivo:** 100% cobertura funciones puras exportadas

#### Portal (Jest)
```bash
# Archivos a cubrir al 100%
portal/lib/archinstall.js      # toArchinstallPair, validateArchinstallConfig
portal/lib/auth.js             # hashPassword, verifyPassword, createSession
portal/lib/users.js            # createUser, getUser, validateCredentials
portal/lib/rate-limit.js       # createRateLimiter, keyGenerator
portal/lib/db.js               # signingPayload, canonicalJson, signConfig, loadProfile
portal/routes/*.js             # Validación inputs, error handling, edge cases
```

**Nuevos tests unitarios requeridos:**
- `archinstall.test.js`: conversión config → archinstall (todos los campos, edge cases)
- `auth.test.js`: scrypt params, timing attacks, session expiry
- `users.test.js`: duplicate email, password strength, RBAC
- `db.test.js`: canonicalJson recursivo, sorting determinista, HMAC con secretos vacíos

#### Frontend (Vitest)
```bash
# Archivos a cubrir al 100%
portal/frontend/src/lib/paths.ts          # pathsFromRecommendations, pathAnnouncement
portal/frontend/src/lib/catalog.ts        # mergeSelection, splitSelection, filterCatalog
portal/frontend/src/lib/install-config.ts # buildInstallRequest, downloadInstallJson
portal/frontend/src/lib/api.ts            # fetch wrappers, error handling, retries
portal/frontend/src/lib/auth.tsx          # useAuth, login, logout, token refresh
```

#### Bash (Bats)
```bash
# Funciones en scripts/lib/utils.sh sin tests
tests/bash/utils.bats (nuevo):
  - cfg_get() con JSON válido, inválido, claves anidadas, defaults
  - cfg_get_nested() paths profundos, arrays, tipos
  - part_name() NVMe (/dev/nvme0n1p1), SATA (/dev/sda1), loop, mmcblk
  - parse_kernel_cmdline() allowlist estricta, rechazo injection, token hex32
  - reject_public_luks_secret() combinaciones password/passphrase/encryption
  - canonicalObject() recursivo, arrays, null, empty
```

**Criterio de cierre Capa 1:**
```bash
make test && cd portal && npm test -- --coverage
# Coverage: statements >90%, branches >85%, functions >90%, lines >90%
```

---

### 5.2 Capa 2: Contract Tests — Contratos Formales (Sprint 1-2)

**Objetivo:** Validar contratos producer-consumer con schemas versionados

#### 5.2.1 Schema JSON Config (Portal ↔ Instalador)
```json
// schemas/config-v1.json (JSON Schema Draft 2020-12)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["token", "machine_id", "hostname", "username", "password", ...],
  "properties": {
    "token": { "type": "string", "pattern": "^[0-9a-f]{32}$" },
    "machine_id": { "type": "string", "pattern": "^[0-9a-f]{8}$" },
    "encryption": { "$ref": "#/$defs/encryption" },
    "snapshots": { "$ref": "#/$defs/snapshots" },
    "features": { "$ref": "#/$defs/features" },
    "signature": { "type": "string", "pattern": "^[0-9a-f]{64}$" }
  }
}
```

**Tests de contrato:**
- Portal genera config válida contra schema (producer test)
- Instalador parsea config válida + rechaza inválidas (consumer test)
- Fixture canónica versionada en `tests/fixtures/config-v1.json`
- CI: `ajv validate -s schemas/config-v1.json -d portal/configs/generated/*.json`

#### 5.2.2 Schema Kernel Cmdline
```json
// schemas/kernel-cmdline-v1.json
{
  "type": "object",
  "properties": {
    "neubat_token": { "type": "string", "pattern": "^[0-9a-f]{32}$" },
    "neubat_profile": { "type": "string", "enum": ["base", "production", "developer", "minimal", "vm-luks"] },
    "neubat_portal_url": { "type": "string", "format": "uri", "pattern": "^https?://" }
  },
  "required": ["neubat_token", "neubat_profile", "neubat_portal_url"]
}
```

#### 5.2.3 Schema Ansible Vars
```yaml
# schemas/ansible-vars-v1.yml (yamllint + custom validator)
```

**Implementación:**
- `npm pkg set scripts.contract:validate="ajv validate -s schemas/config-v1.json -d portal/configs/generated/"`
- `make validate-contracts` en CI `quality` job

---

### 5.3 Capa 3: Integration Tests — Límites de Componente (Sprint 2)

#### 5.3.1 Portal API Integration (Supertest + Testcontainers opcional)
```javascript
// portal/tests/integration/api.integration.test.js
describe('API Integration', () => {
  // Flujo completo: POST /install → GET /config/:token → POST /complete
  // Con HMAC secreto real, TLS mock, rate-limit real
  // Error paths: token inválido, config no encontrada, HMAC mismatch, TLS bypass
  // Auth flow: login → session → protected routes → logout → session expiry
  // Admin: list users, delete, promote, audit log
  // Catalog: sync, fallback, versioning
});
```

#### 5.3.2 Instalador Fase-a-Fase (Bats + Mock Portal)
```bash
# tests/bash/integration/20-archinstall.integration.bats
# Mock HTTP server (python3 http.server + TLS self-signed) para /api/config/:token
# Tests:
#  - fetch_configuration: portal OK → config firmada → HMAC pass
#  - fetch_configuration: portal 404 → fallback perfil local
#  - fetch_configuration: portal HTTPS + TLS 1.2 enforced
#  - fetch_configuration: HMAC fail-closed (sin signature, signature inválida)
#  - install_base_system: archinstall path + pacstrap fallback
#  - verify_config_signature: secret vacío (lab), secret débil (warn), secret fuerte (pass/fail)

# tests/bash/integration/10-partition.integration.bats
#  - part_name() NVMe, SATA, loop, mmcblk
#  - partition_disk: GPT + ESP + btrfs + LUKS2 (keyfile + passphrase)
#  - LUKS2 keyfile generado + chmod 0400
#  - Error: disco no existe, no UEFI, particiones preexistentes

# tests/bash/integration/30-postinstall.integration.bats
#  - configure_system: hostname, locale, timezone, keyboard, sudoers
#  - install_applications: packages + aur_packages (mock yay)
#  - bootloader: grub UEFI + config kernel cmdline
#  - users: useradd, password hash, groups, ssh keys
```

#### 5.3.3 Ansible Integration
```yaml
# tests/ansible/integration/test_neubat_role.yml
# molecule scenario (requirements: molecule, docker)
# - converge: role applied to fresh container
# - idempotence: re-run converges without changes
# - verify: assertions on files, services, users, config
# - destroy: cleanup
```

**Criterio de cierre Capa 3:**
```bash
make test-integration  # Nuevo target
# Portal API: 100% endpoints cubiertos (happy + error paths)
# Instalador: cada fase testeada con mock portal
# Ansible: molecule pass + idempotence
```

---

### 5.4 Capa 4: E2E Tests — User Journeys Completos (Sprint 2-3)

#### 5.4.1 Frontend E2E (Playwright - Actual + Extensiones)
```typescript
// portal/e2e/specs/*.spec.ts - Extender 7 specs existentes
// Nuevos specs requeridos:
specs/error-recovery.spec.ts      // Portal caído → modo local → descargar JSON
specs/auth-flow.spec.ts           // Login → save config → logout → login → recover
specs/offline-mode.spec.ts        // Sin red → configurar → descargar → instalar offline
specs/accessibility.spec.ts       // axe-core en todas las pages (WCAG 2.1 AA)
specs/perf-budget.spec.ts         // LCP < 2.5s, TBT < 200ms, CLS < 0.1
```

#### 5.4.2 Instalador E2E (QEMU - Matrix Completa)
```python
# tests/vm/e2e_matrix.py (nuevo - parametrizado por pytest)
# Matrix: 7 combos críticos × 2 arquitecturas (x86_64, aarch64 opcional)
# Cada test:
#  1. Boot ISO (netboot o ISO local)
#  2. Kernel cmdline con token/perfil/portal_url
#  3. Instalación completa fases 00-50
#  4. Reboot → firstboot ansible
#  5. Validación post-install (validate-install.sh checklist)
#  6. Portal local accesible + funcional

# Perfiles a testear OBLIGATORIAMENTE:
#  - production (kde, keyfile, snapshots, ssh)
#  - developer (gnome, keyfile, snapshots, ssh)
#  - vm-luks (none, keyfile, no snapshots, ssh + qemu-agent)
#  - base (none, disabled, disabled, ssh) - smoke rápido
#  - minimal (none, disabled, disabled, ssh) - CI rápido
#  - production + hyprland + interactive (edge case WM)
#  - developer + sway + firewall (feature TODO)
```

**Criterio de cierre Capa 4:**
```bash
make test-e2e           # Frontend Playwright (required en CI)
make test-vm-matrix     # Nuevo: matrix 7 combos (opt-in por tiempo, ~3h total)
# O: make test-vm-smoke  # Subset 3 combos en CI required (~45 min)
```

---

### 5.5 Capa 5: Security Tests — Hardening Continuo (Sprint 3)

| Test | Herramienta | Frecuencia | Objetivo |
|------|-------------|------------|----------|
| **SAST** | CodeQL (actual) | Cada PR | Vulns código |
| **Secrets** | gitleaks (actual) | Pre-commit + CI | Fugas secretos |
| **Deps** | npm audit + renovate | Semanal | CVE dependencies |
| **DAST** | OWASP ZAP / nuclei | Semanal + release | Vulns runtime portal |
| **Container** | Trivy / Grype | Cada build ISO | Vulns base image |
| **Supply Chain** | SLSA provenance (actual) | Cada release | Integridad artifacts |
| **HMAC PenTest** | Custom script | Cada release | Timing, replay, key recovery |
| **TLS Test** | testssl.sh | Cada release | Config TLS portal + instalador |

**Nuevos tests seguridad requeridos:**
```bash
# tests/security/hmac-pentest.sh
# - Timing attack en compare_digest (constant-time verificado)
# - Replay attack: token reutilizado → debe fallar (single-use)
# - Key recovery: known plaintext → secret (imposible HMAC-SHA256)
# - Length extension: SHA256 no vulnerable, pero verificar implementación

# tests/security/tls-validation.sh
# - Portal: TLS 1.2+, cipher suites fuertes, HSTS, cert validity
# - Instalador: curl --proto '=https' --tlsv1.2 enforced
# - Netboot: iPXE HTTPS support (fallback HTTP documentado)
```

---

### 5.6 Capa 6: Performance & Reliability (Sprint 3-4)

| Métrica | Target | Medición |
|---------|--------|----------|
| **Portal cold start** | < 2s | `npm start` → `/api/health` |
| **API latency (p95)** | < 100ms | k6 / autocannon en CI |
| **Frontend LCP** | < 2.5s | Playwright + Lighthouse CI |
| **Instalador total** | < 15 min (SSD NVMe) | `test-vm` timestamps |
| **Fase 10 (partition)** | < 2 min | bats timing |
| **Fase 20 (fetch+install)** | < 8 min | bats timing |
| **ISO build** | < 10 min | `build-iso` timing |
| **ISO boot → login** | < 3 min | `test-iso-boot` |

**Implementación:**
- `scripts/benchmark-installer.sh` con `time` por fase
- `portal/benchmarks/api.bench.js` (autocannon)
- GitHub Actions: `performance` job (schedule weekly + on release)

---

## 6. Pipeline de Ejecución Integrado

### 6.1 Gates de Calidad (Quality Gates)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PIPELINE CI/CD NEUBAT 360°                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐    ┌─────────┐    ┌──────────┐    ┌────────┐    ┌──────────┐  │
│  │ QUALITY │───▶│  TEST   │───▶│ P0-TESTS │───▶│ BUILD  │───▶│  SMOKE   │  │
│  │ (lint,  │    │ (unit,  │    │ (security│    │(frontend│    │(health + │  │
│  │ validate,│    │  integ, │    │  P0 only)│    │ artifact)│   │ install) │  │
│  │ contract)│    │ contract)│    │          │    │        │    │          │  │
│  └─────────┘    └─────────┘    └──────────┘    └────────┘    └──────────┘  │
│       │           │             │             │            │               │
│       ▼           ▼             ▼             ▼            ▼               │
│  ✅ Shellcheck  ✅ 100% unit  ✅ 26 P0      ✅ Frontend   ✅ /api/health   │
│  ✅ JSON valid  ✅ Contract   ✅ HMAC       ✅ Artifact   ✅ POST /install │
│  ✅ Ansible     ✅ Integ API  ✅ cmdline    ✅ Upload     ✅ Contrast      │
│  ✅ Schema      ✅ Integ Bash ✅ profiles                                          │
│                                                                             │
│                                    ┌──────────┐                             │
│                                    │   E2E    │◀── Parallel con BUILD      │
│                                    │(Playwright│     (needs: test)          │
│                                    │  + VM*)  │                             │
│                                    └──────────┘                             │
│                                           │                                 │
│                                           ▼                                 │
│                                    ┌──────────┐                             │
│                                    │PROVENANCE│  (needs: build)             │
│                                    │ (SLSA)   │                             │
│                                    └──────────┘                             │
│                                                                             │
│  * VM tests: opt-in por tiempo. Subset "smoke" (3 perfiles) en required.  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Targets Makefile Extendidos (Nuevos)

```makefile
# Añadir a Makefile:

# Capa 1: Unit (existente + nuevos)
test-unit: test test-frontend test-bash
test-unit-coverage: test  # con --coverage

# Capa 2: Contract
validate-contracts:
	@ajv validate -s schemas/config-v1.json -d portal/configs/generated/
	@ajv validate -s schemas/kernel-cmdline-v1.json -d tests/fixtures/kernel-cmdline/*.json
	@yamllint -c .yamllint.yml ansible/

test-contract: validate-contracts

# Capa 3: Integration
test-integration-portal:
	cd portal && npm test -- --testPathPattern=integration

test-integration-installer:
	bats tests/bash/integration/*.bats

test-integration-ansible:
	cd tests/ansible && molecule test

test-integration: test-integration-portal test-integration-installer test-integration-ansible

# Capa 4: E2E
test-e2e-frontend: build-frontend install-deps-e2e
	cd portal/e2e && npm run test:e2e

test-vm-smoke:        # 3 perfiles críticos (~45 min) - REQUIRED en CI
	python3 tests/vm/e2e_matrix.py --profiles production,developer,vm-luks

test-vm-matrix:       # 7 perfiles completos (~3h) - SCHEDULED weekly
	python3 tests/vm/e2e_matrix.py --all-profiles

test-e2e: test-e2e-frontend test-vm-smoke

# Capa 5: Security
test-security:
	bash tests/security/hmac-pentest.sh
	bash tests/security/tls-validation.sh
	cd portal && npm audit --audit-level=high
	trivy image neubat-portal:latest

# Capa 6: Performance
test-performance:
	bash scripts/benchmark-installer.sh
	cd portal && node benchmarks/api.bench.js
	cd portal/frontend && npm run lighthouse:ci

# Meta-targets
test-all: test-unit test-contract test-integration test-e2e test-security test-performance
test-ci: quality test-unit test-contract test-integration test-p0 test-e2e-frontend test-vm-smoke build smoke provenance

# Local development
dev-test: test-unit test-contract test-p0  # Rápido (<5 min)
dev-test-full: test-ci  # Completo (~20 min sin VM)
```

### 6.3 GitHub Actions Workflow Actualizado (`.github/workflows/ci.yml`)

```yaml
# Jobs nuevos/actualizados:
jobs:
  quality:          # Sin cambios (lint, validate, ansible-lint)
  
  test-unit:        # Nuevo: unit + contract (needs: quality)
    # Portal Jest + Frontend Vitest + Bats unit
  
  test-contract:    # Nuevo: contract validation (needs: quality)
    # AJV schemas + kernel cmdline fixtures
  
  test-integration: # Nuevo: integration (needs: test-unit)
    # Portal API integration + Installer fase-a-fase + Ansible molecule
  
  p0-tests:         # Existente (needs: quality)
  
  test-security:    # Nuevo: security suite (needs: test-unit)
    # HMAC pentest, TLS validation, npm audit, trivy
  
  build:            # Existente (needs: test-integration)
  
  smoke:            # Existente (needs: build)
  
  e2e-frontend:     # Existente (needs: test-unit)
  
  test-vm-smoke:    # NUEVO REQUIRED (needs: build, timeout: 60 min)
    # Matrix 3 perfiles críticos
  
  test-vm-matrix:   # NUEVO SCHEDULED (weekly, timeout: 180 min)
    # Matrix 7 perfiles completos
  
  performance:      # NUEVO SCHEDULED (weekly)
    # Benchmarks instalador + portal + frontend
  
  provenance:       # Existente (needs: build)
```

---

## 7. Validación Integrada por Función

### 7.1 Tabla de Validación por Función Crítica

| Función | Unit | Contract | Integration | E2E | Security | Perf | Validación Automática |
|---------|------|----------|-------------|-----|----------|------|----------------------|
| **POST /api/install** | ✅ | ✅ Schema | ✅ Happy+Error | ✅ Playwright | ✅ Rate-limit, auth | ✅ p95<100ms | `make test-ci` |
| **GET /api/config/:token** | ✅ | ✅ Schema | ✅ TLS+HMAC | ✅ Playwright | ✅ HMAC fail-closed | ✅ p95<100ms | `make test-ci` |
| **HMAC sign/verify** | ✅ | ✅ Fixture | ✅ Portal+Instalador | ✅ VM | ✅ Timing, replay | - | `make test-p0` |
| **parse_kernel_cmdline** | ✅ | ✅ Schema | ✅ Allowlist | ✅ VM boot | ✅ Injection | - | `make test-p0` |
| **partition_disk** | ✅ part_name | - | ✅ NVMe/SATA/LUKS | ✅ VM | - | ✅ <2min | `test-integration-installer` |
| **fetch_configuration** | - | ✅ Schema | ✅ Mock portal | ✅ VM | ✅ TLS 1.2, HMAC | ✅ <30s | `test-integration-installer` |
| **archinstall/pacstrap** | - | - | ✅ Both paths | ✅ VM | - | ✅ <8min | `test-vm-smoke` |
| **configure_system** | - | - | ✅ Idempotence | ✅ VM | - | - | `test-integration-installer` |
| **Ansible firstboot** | - | ✅ Schema | ✅ Molecule | ✅ VM | - | - | `test-integration-ansible` |
| **Portal deploy local** | - | - | ✅ Systemd + nginx | ✅ VM | - | - | `test-vm-smoke` |
| **Frontend ConfigurePage** | ✅ hooks | - | ✅ API mock | ✅ Playwright | ✅ XSS, CSP | ✅ LCP | `test-e2e-frontend` |
| **ISO build** | - | - | ✅ validate-iso.sh | ✅ test-iso-boot | ✅ Trivy | ✅ <10min | `build-iso && validate-iso` |

### 7.2 Checklist de Validación por Release

```markdown
# Release Validation Checklist v$(TAG)

## Pre-Release (CI Required)
- [ ] `make quality` ✅
- [ ] `make test-unit` ✅ (coverage >90%)
- [ ] `make test-contract` ✅
- [ ] `make test-integration` ✅
- [ ] `make test-p0` ✅ (26 tests)
- [ ] `make test-e2e-frontend` ✅ (7+ specs)
- [ ] `make test-vm-smoke` ✅ (3 perfiles)
- [ ] `make build` ✅ (frontend artifact)
- [ ] `make smoke` ✅
- [ ] `make provenance` ✅

## Release Candidate (Manual/Scheduled)
- [ ] `make build-iso TAG=$(TAG)` ✅
- [ ] `make validate-iso` ✅
- [ ] `make test-vm-matrix` ✅ (7 perfiles)
- [ ] `make test-security` ✅
- [ ] `make test-performance` ✅
- [ ] `make test-iso-boot` ✅

## Post-Release
- [ ] `make release TAG=$(TAG)` ✅ (GitHub Release + ISO)
- [ ] Verificar checksums SHA256 en release notes
- [ ] Actualizar `docs/RELEASE-v$(TAG).md`
- [ ] Tag firmado GPG
```

---

## 8. Gap Analysis y Plan de Acción

### 8.1 Gaps Críticos (Bloquean 360°)

| Gap | Impacto | Esfuerzo | Prioridad |
|-----|---------|----------|-----------|
| **Sin tests integración instalador** | No se valida fases 10-50 en CI | 3-5 días | **P0** |
| **Sin tests Ansible (molecule)** | No se valida firstboot | 2-3 días | **P0** |
| **VM tests solo opt-in** | No required en CI | 1-2 días (infra) | **P0** |
| **Sin contract schemas formales** | Drift portal↔instalador silencioso | 1 día | **P0** |
| **Sin DAST/Container scanning** | Vulns runtime no detectadas | 1-2 días | **P1** |

### 8.2 Gaps Importantes

| Gap | Impacto | Esfuerzo | Prioridad |
|-----|---------|----------|-----------|
| Cobertura unit <100% en lib/ | Regresiones silenciosas | 2-3 días | **P1** |
| E2E frontend: error recovery, offline, auth | Flujos reales no cubiertos | 3-4 días | **P1** |
| Performance benchmarks ausentes | Degradaciones no detectadas | 2 días | **P2** |
| Supply chain: SBOM, sigstore | Compliance | 1-2 días | **P2** |
| Accessibility: axe-core en CI | WCAG 2.1 AA | 1 día | **P2** |

### 8.3 Quick Wins (≤1 día cada uno)

1. **`make test-integration-installer`** - Bats con mock HTTP server python
2. **`schemas/config-v1.json`** - JSON Schema + AJV validation
3. **`tests/security/hmac-pentest.sh`** - Timing + replay tests
4. **`test-vm-smoke` target** - Subset 3 perfiles en CI required
5. **`molecule.yml` para Ansible** - Docker + converge + idempotence

---

## 9. Roadmap de Implementación

### Sprint 1 (Semana 1-2): Foundation
- [ ] **Día 1-2:** JSON Schemas (config, kernel-cmdline, ansible-vars) + AJV en CI
- [ ] **Día 3-4:** Unit tests faltantes (archinstall, auth, users, paths, catalog, api)
- [ ] **Día 5:** Bats utils.sh (cfg_get, part_name, reject_public_luks_secret)
- [ ] **Día 6-7:** `test-contract` + `test-unit-coverage` targets + CI job

### Sprint 2 (Semana 3-4): Integration
- [ ] **Día 1-3:** Portal API integration tests (Supertest + mock HMAC + TLS)
- [ ] **Día 4-6:** Instalador fase-a-fase integration (bats + mock portal HTTP server)
- [ ] **Día 7:** Ansible molecule setup + idempotence test
- [ ] **Día 8-10:** `test-integration` target + CI job

### Sprint 3 (Semana 5-6): E2E + Security
- [ ] **Día 1-3:** E2E frontend specs nuevos (error, offline, auth, a11y, perf)
- [ ] **Día 4-6:** `test-vm-smoke` (3 perfiles) + infra CI (self-hosted runner o GitHub macOS/ubuntu large)
- [ ] **Día 7-8:** Security suite (HMAC pentest, TLS validation, Trivy, npm audit)
- [ ] **Día 9-10:** `test-security` target + CI job

### Sprint 4 (Semana 7-8): Performance + Polish
- [ ] **Día 1-3:** Benchmarks instalador + portal API + frontend Lighthouse
- [ ] **Día 4-5:** `test-vm-matrix` completo (7 perfiles) + scheduled weekly
- [ ] **Día 6-7:** Supply chain (SBOM, sigstore, SLSA provenance completo)
- [ ] **Día 8-10:** Documentación, runbooks, release checklist automatizado

---

## 10. Métricas de Éxito (KPIs)

| KPI | Baseline Actual | Target 360° | Medición |
|-----|-----------------|-------------|----------|
| **Unit Coverage** | ~75% | >90% statements, >85% branches | `npm test -- --coverage` |
| **Integration Coverage** | 0% (instalador) | 100% fases + API endpoints | `make test-integration` |
| **E2E Frontend** | 7 specs | 12+ specs (error, offline, a11y, perf) | `make test-e2e-frontend` |
| **VM Test Matrix** | 0 required | 3 required + 7 scheduled | `make test-vm-smoke/matrix` |
| **Security Tests** | CodeQL only | SAST+DAST+Secrets+Container+Supply | `make test-security` |
| **Performance Baselines** | Ninguno | Definidos + CI regression detection | `make test-performance` |
| **Contract Drift** | Manual | 0 (automated AJV) | `make validate-contracts` |
| **Mean Time to Feedback** | ~20 min (CI) | <15 min (parallel jobs) | GitHub Actions timing |
| **Release Confidence** | Manual checklist | Automated gate `make test-all` | Release workflow |

---

## 11. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **VM tests lentos (>40 min c/u)** | Alta | CI timeout, coste runners | Subset smoke (3 perfiles) required; matrix completa scheduled; self-hosted runners |
| **Mock portal HTTP server inestable** | Media | Flaky integration tests | Testcontainers o fixture JSON estáticos; retry logic en bats |
| **Ansible molecule en CI** | Media | Complejidad Docker-in-Docker | GitHub Actions `docker` service; o validar solo syntax + lint en CI, molecule local |
| **Schema drift portal/instalador** | Alta | Silent failures en producción | AJV validation en CI `quality` + `test-contract`; fixture canónica versionada |
| **HMAC timing attacks** | Baja | Crítico si explotado | `hmac.compare_digest` ya usado; pentest valida constant-time |
| **Frontend bundle size creep** | Media | LCP degradation | Lighthouse CI budget en `test-performance` |

---

## 12. Decisiones Pendientes (Requieren Input Usuario)

1. **VM Tests en CI Required vs Opt-in:**
   - Opción A: `test-vm-smoke` (3 perfiles, ~45 min) **required** en CI → mayor confianza, más coste/lentitud
   - Opción B: Solo `test-vm-matrix` **scheduled weekly** → CI rápido, feedback diferido
   - **Recomendación:** Opción A para perfiles críticos (production, developer, vm-luks)

2. **Contract Testing Tooling:**
   - Opción A: AJV + JSON Schema (actual, zero-deps, fast)
   - Opción B: Pact (consumer-driven contracts, más potente, más setup)
   - **Recomendación:** AJV suficiente para NEUBAT (contratos simples, un consumidor)

3. **Ansible Testing Strategy:**
   - Opción A: Molecule + Docker (completo, idempotence real)
   - Opción B: `ansible-playbook --syntax-check + ansible-lint` only (rápido, shallow)
   - **Recomendación:** Molecule para `test-integration-ansible` (local + scheduled), syntax+lint en CI required

4. **Performance Budget Targets:**
   - Definir umbrales concretos para: instalador total, fase 20, API p95, frontend LCP
   - **Recomendación:** Medir baseline actual en Sprint 4, luego fijar -10% como target

5. **Supply Chain Signing:**
   - ¿Firmar artifacts ISO + frontend con cosign/keyless?
   - **Recomendación:** Sí, SLSA Level 3 para releases (provenance + signing)

---

## 13. Apéndice: Comandos de Referencia Rápida

```bash
# Desarrollo diario (rápido, <5 min)
make dev-test

# Pre-push (completo sin VM, ~15 min)
make dev-test-full

# CI Pipeline completo (simular local)
make quality && make test-unit && make test-contract && make test-integration && make test-p0 && make test-e2e-frontend && make test-vm-smoke && make build && make smoke && make provenance

# Release Candidate (completo con VM matrix, ~3-4h)
make test-all && make build-iso TAG=x.y.z && make validate-iso && make test-vm-matrix && make test-security && make test-performance && make test-iso-boot

# Solo seguridad
make test-security

# Solo performance
make test-performance

# Validar contratos
make validate-contracts

# Lint solo
make lint

# Ver estado CI
make ci-status
```

---

## 14. Próximos Pasos Inmediatos

1. **Revisar y aprobar** este plan (este documento)
2. **Crear issue GitHub** con checklist de tareas por Sprint
3. **Priorizar Sprint 1** (schemas + unit tests) - base para todo lo demás
4. **Configurar runners CI** para VM tests (GitHub Actions ubuntu-large o self-hosted)
5. **Ejecutar baseline** de performance actual antes de fijar targets

---

*Fin del documento. Pendiente de revisión y aprobación para iniciar implementación.*