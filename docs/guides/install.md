# NEUBAT — Documento Maestro de Instalación y Despliegue

### Propósito de este documento

- **Objetivos:** Guiar el despliegue del portal, el arranque por red/ISO y la instalación desatendida sin destruir datos por error.
- **Estructura:** Concepto → requisitos → portal → arranque iPXE/ISO → fases del instalador → validación y seguridad.
- **Contenido a integrar según contexto:** Adapta URLs, perfiles JSON y variables de `.env.example`. No copies un runbook de otro producto. El instalador **destruye el disco objetivo**.

**Versión:** 1.0.0
**Fecha:** 20 de septiembre de 2026
**Arquitectura:** x86_64
**Sistema base:** Arch Linux (rolling release)
**Entorno:** Producción — SSD/HDD bare metal

---

## 1. Concepto y filosofía

NEUBAT es un sistema de instalación desatendida de Arch Linux que despliega un entorno completo, preconfigurado y funcional desde Internet, sin medios físicos (USB/CD), mediante un portal web responsive que genera URLs únicas de configuración.

- **Zero-touch deployment:** instalación sin intervención tras el arranque inicial.
- **Infrastructure as Code:** toda la configuración versionada y reproducible.
- **Rolling release:** sistema siempre actualizado sin migraciones traumáticas.
- **Monolito recortado:** sistema mínimo, sin bloatware.

### Objetivos medibles

| # | Objetivo | Métrica de éxito |
|---|----------|------------------|
| 1 | Portal usuarios responsive | Accesible desde móvil/desktop, < 2 s de carga |
| 2 | URL generada post-instalación | URL única funcional en < 5 min desde el arranque |
| 3 | Instalación desatendida | 0 intervenciones tras la selección inicial |

## 2. Requisitos

**Servidor del portal:** Node.js ≥ 18, puerto 3000 libre, conectividad con las máquinas destino.

**Máquina destino:** arranque UEFI, soporte de arranque por red (PXE/iPXE) o ISO en disco (fallback GRUB loopback), disco ≥ 32 GiB, conexión a Internet.

**Entorno live:** ISO oficial de Arch Linux reciente (incluye `python3`, `parted`, `pacstrap`, `reflector`).

## 3. Despliegue del portal

### Docker Compose (recomendado)

```bash
cp .env.example .env   # opcional: ajusta ADMIN_TOKEN y NEUBAT_MIRROR_BASE
docker compose up -d
```

Variables de entorno útiles:

| Variable | Descripción | Defecto |
|----------|-------------|---------|
| `ADMIN_TOKEN` | Token para el panel `/admin` | — (panel deshabilitado si falta) |
| `NEUBAT_MIRROR_BASE` | Mirror base para el netboot iPXE | `https://geo.mirror.pkgbuild.com/iso/latest` |
| `NEUBAT_PORT` | Puerto expuesto del portal | `3000` |
| `NEUBAT_HMAC_SECRET` | Secreto compartido para firma HMAC de configuraciones | — |

### Node.js nativo

```bash
cd portal
npm install
npm start          # producción en :3000
npm run dev        # desarrollo
```

Como servicio systemd, usar como plantilla la unidad que genera `scripts/40-portal-deploy.sh` (`neubat-portal.service`).

### API

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/install` | Crea instalación; body: `profile`, `hostname?`, `username?`, `password?`, `desktop?`, `packages?[]`, `encryption?` |
| GET | `/api/config/:token` | Devuelve el JSON de configuración (consumido por el instalador) |
| POST | `/api/complete` | El instalador notifica `status`, `hostname`, `duration?`, `error?` |
| GET | `/api/metrics` | Métricas agregadas de instalaciones |
| GET | `/api/installations` | Últimas 50 instalaciones |
| GET | `/api/installations/:token` | Estado de una instalación |
| GET | `/api/health` | Health check |
| GET | `/boot/:token` | Script iPXE personalizado para el token |

### Panel de administración

Disponible en `/admin`. Requiere `ADMIN_TOKEN`. Endpoints bajo `/api/admin`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/admin/installations` | Listado completo de instalaciones |
| POST | `/api/admin/installations/:token/status` | Actualizar estado/hostname/error |
| POST | `/api/admin/installations/:token/reset` | Volver a estado `pending` |
| DELETE | `/api/admin/installations/:token` | Eliminar registro y config |

El portal aplica rate-limiting (100 req / 15 min por IP) en `/api/*`. Para exposición pública, desplegar detrás de un reverse proxy con TLS.

Variable de entorno opcional: `NEUBAT_MIRROR_BASE` — mirror base para el netboot iPXE (defecto: `https://geo.mirror.pkgbuild.com/iso/latest`). Apúntala a una caché local (`deploy/pacman-cache/`) cuando el firmware iPXE no tenga HTTPS compilado o para acelerar los arranques por red.

## 4. Construcción de la ISO híbrida

Para generar una ISO personalizada a partir del código actual (requiere Docker):

```bash
make build-iso
# Salida: out/neubat-1.0.0-x86_64.iso
```

El proceso usa un contenedor Arch Linux con `archiso`, remasteriza el perfil `releng`, inyecta `/opt/neubat` y habilita `neubat-autoinstall.service`. Para publicar la ISO en GitHub:

```bash
make release
```

## 5. Flujo de instalación

### 5.1 Crear la instalación

Desde la web (`http://<portal>/configurar`) o por API:

```bash
curl -X POST http://<portal>:3000/api/install \
  -H 'Content-Type: application/json' \
  -d '{"profile":"production","hostname":"mi-equipo","desktop":"hyprland"}'
```

Respuesta: `token`, `config_url`, `boot_url`.

Cuenta de usuario: registro en `/cuenta`. Absorción del sistema actual: genera un código en la cuenta y ejecuta `scripts/neubat-absorb.sh --code … --portal …`.

### 5.2 Arrancar la máquina destino

- **Por red (recomendado):** encadenar iPXE a `http://<portal>:3000/boot/<token>`. El script incluye `neubat_token`, `neubat_profile` y `neubat_portal_url`. Para cero toques, publica el live NEUBAT en `NEUBAT_LIVE_DIR` (servido en `/live`) y define `NEUBAT_USE_LIVE=1` o `NEUBAT_LIVE_BASE`. Sin live, el mirror Arch arranca pero requiere ejecutar el instalador a mano o usar la ISO NEUBAT.
- **ISO híbrida autoinstalable:** en `/descargar` el portal verifica SHA-256 antes de guardar. También desde la [release](https://github.com/Soluciones-Alexendros/neubat/releases) con el `.sha256` generado por CI. Arranque:

  ```
  neubat_token=<token> neubat_profile=production neubat_portal_url=http://<portal>:3000
  ```

  El servicio `neubat-autoinstall.service` del live ISO lee esos parámetros y ejecuta el instalador de forma desatendida.

- **Fallback USB/disco:** `netboot/grub/loopback.cfg` arranca el ISO almacenado en disco sin reescribir el medio.

### 5.3 Ejecutar el instalador (desde el live ISO)

```bash
export NEUBAT_PORTAL_URL="http://<portal>:3000"
export NEUBAT_ASSUME_YES=true          # omite la confirmación de borrado
bash scripts/neubat-install.sh <token> [perfil]
```

> **AVISO:** el instalador destruye todos los datos del disco objetivo.

### Fases

| Fase | Módulo | Acción |
|------|--------|--------|
| 0 | `00-preinstall.sh` | root, Internet, UEFI, herramientas live |
| 0b | `20-archinstall.sh` | Descarga config por token o usa perfil local |
| 1 | `10-partition.sh` | GPT: EFI 1 GiB + raíz btrfs + home btrfs + swap 4G |
| 2 | `20-archinstall.sh` | Mirrors (reflector) + pacstrap + fstab |
| 3 | `30-postinstall.sh` | chroot: locale, usuarios, systemd-boot, yay, `/etc/neubat-release` |
| 4 | `30-postinstall.sh` | Desktop y paquetes/servicios de la configuración |
| 5 | `35-snapper.sh` | Snapper + snap-pac si `snapshots.enabled` |
| 6 | `40-portal-deploy.sh` | Portal local + `~/NEUBAT-URL.txt` |
| 7 | `50-firstboot-ansible.sh` | Ansible first-boot |
| 8 | maestro | Notificación al portal, resumen y reinicio |

## 6. Esquema de particionado

| Partición | Tamaño | FS | Montaje |
|-----------|--------|-----|---------|
| p1 (ESP) | 1 GiB | FAT32 | `/boot` |
| p2 (raíz) | 19–29 GiB (según tamaño del disco) | btrfs (zstd, noatime) | `/` |
| p3 (home) | resto − 4 GiB | btrfs (zstd, noatime) | `/home` |
| p4 (swap) | 4 GiB | swap | — |

Los nombres de partición se resuelven con `part_name()` (soporta `/dev/sda1` y `/dev/nvme0n1p1`).

## 6.1 Cifrado de disco LUKS (Fase 6)

NEUBAT puede cifrar las particiones de **raíz** y **home** con LUKS2. La partición EFI (`/boot`) permanece descifrada porque el firmware UEFI debe poder leer el cargador de arranque (systemd-boot).

### Modos de arranque

| Método | Campo `encryption.method` | Comportamiento | Seguridad |
|--------|---------------------------|----------------|-----------|
| **Keyfile en `/boot`** | `keyfile` | Arranque completamente desatendido | Protege datos en reposo si el disco está apagado; no protege si roban el disco con la partición EFI |
| **Passphrase manual** | `passphrase` | El initramfs pide la contraseña en cada arranque | Mayor seguridad física; rompe el despliegue zero-touch |

### Configuración en el perfil

```json
{
  "encryption": {
    "enabled": true,
    "method": "keyfile",
    "passphrase": "cambiar-post-instalacion",
    "cipher": "aes-xts-plain64",
    "key_size": 512
  }
}
```

- `enabled`: activa/desactiva LUKS.
- `method`: `keyfile` (desatendido) o `passphrase` (interactivo).
- `passphrase`: se usa para formatear el contenedor cuando no hay keyfile; también puede usarse para añadir frases adicionales tras la instalación. El valor `neubat` se rechaza mientras `enabled` sea verdadero, igual que la contraseña de usuario `neubat`. Para una VM de prueba: `NEUBAT_ALLOW_DEFAULT_SECRETS=1`.
- `cipher` / `key_size`: parámetros de `cryptsetup luksFormat` (defecto `aes-xts-plain64` / 512).

### Desde la API

```bash
curl -X POST http://<portal>:3000/api/install \
  -H 'Content-Type: application/json' \
  -d '{
    "profile": "production",
    "hostname": "mi-equipo",
    "password": "UnaClaveDeUsuario",
    "encryption": { "enabled": true, "method": "passphrase", "passphrase": "MiFraseSegura" }
  }'
```

### Post-instalación recomendada

Cuando uses `method: "keyfile"`, rota la llave tras el primer arranque:

```bash
# Añade una passphrase y elimina el keyfile del slot 0
sudo cryptsetup luksAddKey /dev/nvme0n1p2
sudo cryptsetup luksRemoveKey /dev/nvme0n1p2 /etc/cryptsetup-keys.d/neubat_root.key
sudo rm /etc/cryptsetup-keys.d/neubat_root.key /etc/cryptsetup-keys.d/neubat_home.key
```

Para TPM2 o FIDO2, consulta `systemd-cryptenroll` (fuera del alcance del MVP).

## 6.2 Snapshots btrfs automáticos (Fase 7)

Cuando el perfil activa `snapshots.enabled`, NEUBAT instala `snapper` y `snap-pac` y configura snapshots automáticos de `/` y `/home`:

- **Timeline:** snapshot cada hora (gestionado por `snapper-timeline.timer`).
- **Pacman:** `snap-pac` crea snapshots `pre`/`post` en cada operación de paquetes, permitiendo rollback si una actualización rompe el sistema.
- **Limpieza:** `snapper-cleanup.timer` aplica los límites configurados.

### Configuración en el perfil

```json
{
  "snapshots": {
    "enabled": true,
    "cleanup": {
      "hourly": 5,
      "daily": 7,
      "weekly": 2,
      "monthly": 2
    }
  }
}
```

### Gestión básica

```bash
# Listar snapshots de raíz
sudo snapper -c root list

# Ver diferencias entre dos snapshots
sudo snapper -c root status <id>..<id>

# Restaurar un snapshot (boot desde snapshot + rollback)
sudo snapper -c root rollback <id>
```

## 6.3 Firma HMAC y métricas de instalación (Fase 8)

El portal puede firmar cada configuración con **HMAC-SHA256** para que el instalador verifique que no ha sido alterada en tránsito.

### Configuración

Establece el mismo secreto en el portal y en el entorno live del instalador:

```bash
# .env del portal (o docker compose)
NEUBAT_HMAC_SECRET=una-cadena-larga-y-aleatoria

# Entorno live del instalador
export NEUBAT_HMAC_SECRET="una-cadena-larga-y-aleatoria"
```

Si el secreto está configurado, el portal añade un campo `signature` al JSON de configuración. El instalador lo verifica automáticamente en `fetch_configuration()` y aborta si la firma no coincide.

### Métricas

El instalador mide su duración en segundos y la envía al portal en `/api/complete`:

```bash
curl http://<portal>:3000/api/metrics
```

Respuesta:

```json
{
  "total": 10,
  "completed": 8,
  "failed": 1,
  "pending": 1,
  "avg_duration_seconds": 420,
  "duration_count": 8
}
```

## 7. Perfiles de configuración

Los perfiles viven en `configs/` (`base`, `production`, `developer`). Claves:

| Clave | Defecto | Descripción |
|-------|---------|-------------|
| `hostname` | `neubat-*` | Nombre del equipo |
| `username` | `neubat` | Usuario principal (grupo wheel) |
| `password` | `neubat` | Contraseña inicial de usuario y root — **cambiar en el primer acceso** |
| `disk` | `/dev/sda` | Disco objetivo (**se borra entero**) |
| `desktop` | `none` | `kde` · `gnome` · `xfce` · `none` |
| `packages` | — | Paquetes pacman adicionales (los paquetes AUR deben instalarse post-instalación con yay) |
| `services` | — | Servicios systemd a habilitar |
| `timezone` / `locale` / `keyboard` | Madrid / es_ES / es | Regionalización |

## 8. Portal local post-instalación

El sistema instalado incluye `neubat-portal.service` (Node.js en :3000, usuario no-root, código en `/opt/neubat-portal`). La URL del portal local queda en `~/NEUBAT-URL.txt`:

```
http://<hostname>.local:3000/
```

## 9. Validación post-instalación

```bash
bash scripts/validate-install.sh
```

Comprueba: `/etc/neubat-release`, hostname, usuario no-root, Internet, NetworkManager, sshd, Docker, portal local, espacio en disco y fstab. Devuelve código de salida no nulo si algo falla.

## 10. Notas de seguridad

- La construcción desatendida de paquetes AUR (yay) requiere `NOPASSWD` temporal en `%wheel`; **el instalador lo retira automáticamente** al terminar (`/etc/sudoers.d/neubat` queda `%wheel ALL=(ALL:ALL) ALL`).
- Cambiar las contraseñas iniciales de usuario y root en el primer acceso.
- Los tokens son hex aleatorios de 128 bits; el portal valida su formato antes de tocar el sistema de archivos.
- `boot_url` y `config_url` no llevan autenticación: quien posea el token puede descargar la configuración. Tratar los tokens como secretos y, en producción, servir bajo TLS.

## 11. Solución de problemas

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| `Sin config personalizada; usando perfil local` | Portal inalcanzable o token inexistente | Verificar `NEUBAT_PORTAL_URL` y el token |
| `parted` falla en NVMe | Nombre de partición | Resuelto por `part_name()`; si persiste, revisar `lsblk` |
| `yay` no se instaló | Fallo de red/AUR durante el chroot | No crítico: `git clone https://aur.archlinux.org/yay.git && cd yay && makepkg -si` |
| Portal local no responde | `npm install` falló en destino | `cd /opt/neubat-portal && npm install --omit=dev && systemctl restart neubat-portal` |
| Log completo | — | `/var/log/neubat-install.log` (en el entorno live) |

## 12. Pruebas en VM (QEMU/KVM)

Lecciones aprendidas al validar NEUBAT en QEMU con disco NVMe virtual:

| Problema | Causa | Solución |
|----------|-------|----------|
| `IP-Config: no response` en initramfs | `ip=dhcp` usa `ipconfig` (klibc), que busca `eth0`; con nombres predecibles no existe. Incluso con `eth0`, `ipconfig` puede no obtener respuesta del servidor DHCP interno de QEMU slirp | Añadir `net.ifnames=0` a la cmdline. En red con DHCP real (slirp) / router doméstico) el netboot por iPXE funciona; en slirp pura la fase de `archiso_http_srv` puede quedarse sin red. Usar kernel directo para pruebas locales o una red con DHCP real |
| iPXE con build estándar sin HTTPS | `ipxe.lkrn` de boot.ipxe.org no incluye HTTPS en su build por defecto | Usar `NEUBAT_MIRROR_BASE` apuntando a la caché HTTP local (`deploy/pacman-cache/`) o un build de iPXE con HTTPS |
| `/dev/disk/by-label/ARCH_*` no aparece | cdrom IDE sin módulo en initramfs (máquina `pc`) | Usar `-machine q35` (cdrom SATA/AHCI) |
| Descarga de pacman congelada | virtio-net + red slirp se cuelga en transferencias grandes | Usar NIC `-device e1000,netdev=...` |
| reflector agota timeouts | su rating usa 5 s por defecto | `--download-timeout 30` en redes lentas |
| Consola serie sin prompt | el prompt zsh del ISO lleva códigos ANSI | En automatización (pexpect), usar patrones tolerantes a escapes |
| SSH tras instalar | `PermitRootLogin prohibit-password` por defecto | Entrar con el usuario del perfil, no root |

Ejemplo de lanzamiento con kernel directo (consola serie completa):

```bash
qemu-system-x86_64 -machine q35 -enable-kvm -cpu host -m 4096 -smp 4 \
  -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
  -drive if=pflash,format=raw,file=vars.fd \
  -drive file=disk.qcow2,if=none,id=nvm0,format=qcow2 -device nvme,drive=nvm0 \
  -cdrom archlinux-x86_64.iso \
  -kernel vmlinuz-linux -initrd initramfs-linux.img \
  -append "archisobasedir=arch archisolabel=ARCH_YYYYMM console=ttyS0" \
  -netdev user,id=n0,hostfwd=tcp::2222-:22 -device e1000,netdev=n0 \
  -nographic
```

Para iterar rápido, usar la caché de paquetes de `deploy/pacman-cache/`.

---

**Hash de verificación del documento:** `neubat-doc-v1.0-20260920`
