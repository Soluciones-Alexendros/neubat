# Arquitectura de NEUBAT

### Propósito de este documento

- **Objetivos:** Describir capas, fronteras y no-objetivos para que un cambio no rompa el arranque iPXE, los tokens ni el particionado desatendido.
- **Estructura:** Propósito del producto → capas → módulos → contratos → calidad → no-objetivos → stack.
- **Contenido a integrar según contexto:** Adapta módulos de este repo. No copies la arquitectura de una CLI de bundles ni de un SaaS. El detalle de flujo está en [docs/architecture/overview.md](docs/architecture/overview.md).

NEUBAT instala Arch Linux de forma desatendida: el usuario define la máquina en un portal web, obtiene un token/URL, y el destino arranca por red (iPXE) o ISO híbrida.

El [README.md](./README.md) cubre el uso. Las decisiones vivas están abajo; los ADRs numerados, si los hay, en [`docs/architecture/decisions/`](docs/architecture/decisions/).

## 1. Propósito

Entrada: perfil JSON (`configs/`) o config firmada servida por el portal (`GET /api/config/<token>`).  
Salida: sistema Arch particionado (GPT/UEFI/btrfs, LUKS opcional), portal local y URL única de setup.

Flujo: portal `POST /api/install` → boot iPXE/ISO → `neubat-install.sh` → fases 00–50 → `POST /api/complete` → first-boot Ansible.

## 2. Capas

```
Usuario (móvil/escritorio)
        │  SPA React + Express
        ▼
portal/                 token, boot_url, HMAC, admin
        │  HTTP / iPXE
        ▼
netboot/ + iso/         kernel cmdline (neubat_token, neubat_portal_url)
        │
        ▼
scripts/neubat-install.sh
  00-preinstall    validaciones
  10-partition     GPT/UEFI/btrfs/NVMe, LUKS2 opcional
  20-archinstall   config remota + pacstrap
  30-postinstall   chroot + aplicaciones
  35-snapper       snapshots btrfs
  40-portal-deploy portal local + URL
  50-firstboot     Ansible
        │
        ▼
configs/*.json     perfiles declarativos
ansible/           first-boot (ConditionFirstBoot)
```

## 3. Módulos

| Módulo | Responsabilidad |
| ------ | --------------- |
| `portal/server.js` | HTTP, rate-limit, estáticos, SPA fallback |
| `portal/routes/install.js` | Alta, config, boot iPXE, complete |
| `portal/routes/admin.js` | Panel `/admin` con `ADMIN_TOKEN` |
| `portal/lib/db.js` | Persistencia JSON (`portal/data/`) |
| `portal/frontend/` | SPA Vite + shadcn/ui |
| `scripts/lib/utils.sh` | Utilidades Bash (sin jq/bc) |
| `scripts/10-partition.sh` | `part_name()` NVMe-safe |
| `netboot/ipxe/neubat.ipxe` | Menú de arranque por red |

## 4. Contratos

| Qué | Dónde | Quién la mueve |
| --- | ----- | -------------- |
| Producto / ISO | `1.0.x`, tags `v*` | Release manual + `build-iso.yml` |
| Perfil JSON | `configs/*.json` | PR + docs/guides/packages.md |
| Token de instalación | hex 32 chars | `configPathFor()` — no relajar |
| Firma de config | `NEUBAT_HMAC_SECRET` | Entorno portal + live (nunca en git) |
| Esquema canónico de firma | `signingPayload()` (`portal/lib/db.js`) ↔ verificador Python (`scripts/20-archinstall.sh`) | PR coordinado; serialización JSON canónica (claves ordenadas) idéntica en ambos lados |
| Tokens DTCG OKLCH | `portal/frontend/tokens/` v1.0 | `tokens/CONTRACT.md`; `make smoke` comprueba contraste |

## 5. Calidad

- Jest + Supertest sobre el portal; Vitest + oxlint en el frontend
- `bash -n` + shellcheck + bats en `scripts/`
- Ansible syntax-check / ansible-lint
- CI: `quality` → `test` → `build` (SPA) → `smoke` (`/api/health` + `POST /api/install` + contraste DTCG)
- QEMU/NVMe (`make test-vm`) y build de ISO: **opt-in**, no required

## 6. Decisiones de diseño (vivas)

- **Sin jq/bc**: el live de Arch garantiza `python3`; JSON con `python3`, aritmética con `awk`/`$(( ))`.
- **NVMe-safe**: `part_name()` resuelve `/dev/sda1` vs `/dev/nvme0n1p1`.
- **btrfs + zstd**: compresión transparente y `noatime` para SSD.
- **Perfiles declarativos**: los JSON definen paquetes y servicios; el portal los extiende sin tocar el instalador.
- **HMAC-SHA256**: integridad de la config en tránsito. El payload se serializa como JSON canónico (claves ordenadas, `true`/`false` en minúscula) y cubre `token, machine_id, hostname, username, desktop, password, disk, timezone, locale, keyboard, packages, aur_packages, services, encryption, snapshots, features`.
- **LUKS2 opcional**: `keyfile` (desatendido) o passphrase interactiva.

## 7. No-objetivos

- No reescribir la API/UX del portal en PRs de plataforma
- No exigir e2e QEMU ni ISO en cada PR
- No cambiar branch protection, org settings ni secretos reales
- No sustituir la licencia GPL-3.0

## 8. Stack

Node 22 · Express · React 19 + Vite + TypeScript · Jest · Vitest · Bash · Ansible · archiso/Docker · iPXE.
