# Prueba end-to-end en VM (QEMU/KVM + NVMe virtual)

### Propósito de este documento

- **Objetivos:** Documentar la e2e QEMU/NVMe como **opt-in** (no required de CI).
- **Estructura:** Requisitos → uso → variables.
- **Contenido a integrar según contexto:** No conviertas este flujo en job required. ~40 min, necesita KVM.

`neubat_vm_test.py` reproduce la validación realizada el 19-sep-2026: instalación
desatendida completa del perfil elegido sobre un disco NVMe virtual y
verificación SSH del sistema instalado.

## Requisitos del host

- QEMU con KVM (`qemu-system-x86_64`, usuario en grupo `kvm`)
- OVMF (`/usr/share/OVMF/OVMF_{CODE,VARS}_4M.fd`)
- `pexpect`, `xorriso`, `qemu-img`, `blkid`
- ISO oficial de Arch Linux
- Portal NEUBAT corriendo (`cd portal && npm start`) y un servidor HTTP
  sirviendo el directorio de trabajo (para el tarball del repo):

```bash
cd /tmp/neubat-vm && python3 -m http.server 8000 &
```

## Uso

```bash
python3 tests/vm/neubat_vm_test.py
# o vía make:
make test-vm
```

Variables de entorno documentadas en la cabecera del script (ISO, puertos,
perfil, tamaño de disco). El perfil por defecto es `base` (sin cifrado). Un
perfil cifrado con contraseña o passphrase `neubat` lo rechaza el portal; en
esa VM exporta `NEUBAT_ALLOW_DEFAULT_SECRETS=1` o manda otra clave.

## Qué verifica

1. Creación de instalación vía API del portal (token + config con `/dev/nvme0n1`).
2. Arranque del live ISO con kernel directo y consola serie.
3. Instalador desatendido: particionado NVMe → pacstrap → chroot → portal local.
4. Reinicio desde la entrada EFI «NEUBAT» del sistema instalado.
5. SSH como usuario del perfil y comprobaciones: hostname, `/etc/neubat-release`,
   servicios activos, API del portal local, `NEUBAT-URL.txt`, layout NVMe,
   sudo endurecido (sin NOPASSWD).

## Smoke de arranque de la ISO propia

`boot_iso_smoke.py` valida la ISO **NEUBAT** generada (a diferencia de
`neubat_vm_test.py`, que arranca la ISO oficial de Arch): extrae
kernel/initramfs de la propia ISO, arranca QEMU/OVMF con consola serie y
`neubat_token` en el cmdline, y verifica que el entorno live arranca y que el
hook `neubat-autoinstall` se activa y lanza el instalador. No completa la
instalación.

```bash
make test-iso-boot
# o directo:
NEUBAT_ISO=out/neubat-2.0.0-x86_64.iso python3 tests/vm/boot_iso_smoke.py
```

Requisitos: `qemu-system-x86_64`, OVMF, `pexpect`, `xorriso`, `blkid`.
Usa `/dev/kvm` si es accesible (si no, TCG, más lento). Variables y timeout
en la cabecera del script. Úsalo tras `make build-iso` +
`make validate-iso` cuando cambies `iso/airootfs/`, el hook o el pipeline de
build.

## Notas sobre validación iPXE

La prueba `neubat_vm_test.py` valida la instalación con **kernel directo** (cdrom
local). El script iPXE del portal (`/boot/<token>`) y `netboot/ipxe/neubat.ipxe`
fueron verificados hasta el arranque del kernel+initramfs por red (dhcp → chain
al portal → descarga HTTP). La fase final `archiso_http_srv` depende de que el
initramfs obtenga red por DHCP; en la red `slirp` de QEMU, `ipconfig` de klibc
no recibe respuesta, por lo que el netboot puro hasta el live ISO requiere un
entorno con DHCP real (router doméstico, libvirt con dnsmasq, etc.).

Para testear iPXE con firmware sin HTTPS compilado, usar `NEUBAT_MIRROR_BASE`
con la caché HTTP de `deploy/pacman-cache/`.
