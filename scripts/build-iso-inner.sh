#!/bin/bash
# NEUBAT - Script interno ejecutado dentro del contenedor Arch para construir la ISO
set -euo pipefail

ISO_NAME="${1:-neubat-2.0.0-x86_64.iso}"

echo "[build-iso] Actualizando e instalando archiso + reflector ..."
pacman -Sy --noconfirm --needed archiso reflector

echo "[build-iso] Optimizando mirrorlist ..."
reflector --country Germany,France,Netherlands,Spain \
          --age 24 --protocol https --sort rate \
          --connection-timeout 30 --download-timeout 30 \
          --save /etc/pacman.d/mirrorlist || true

# Desactivar timeouts por velocidad lenta.
if ! grep -q "^DisableDownloadTimeout" /etc/pacman.conf; then
    sed -i '/^\[options\]/a DisableDownloadTimeout' /etc/pacman.conf
fi
export PACMAN_TIMEOUT=180

WORK_DIR="$(mktemp -d -t neubat-work-XXXXXX)"
PROFILE_DIR="$(mktemp -d -t neubat-profile-XXXXXX)"
trap 'rm -rf "${WORK_DIR}" "${PROFILE_DIR}"' EXIT

echo "[build-iso] Copiando perfil releng ..."
cp -a /usr/share/archiso/configs/releng/. "${PROFILE_DIR}/"

if ! grep -q "^DisableDownloadTimeout" "${PROFILE_DIR}/pacman.conf"; then
    sed -i '/^\[options\]/a DisableDownloadTimeout' "${PROFILE_DIR}/pacman.conf"
fi
if ! grep -q "^ParallelDownloads" "${PROFILE_DIR}/pacman.conf"; then
    sed -i '/^\[options\]/a ParallelDownloads = 5' "${PROFILE_DIR}/pacman.conf"
fi

echo "[build-iso] Inyectando NEUBAT en airootfs ..."
mkdir -p "${PROFILE_DIR}/airootfs/opt/neubat"
cp -a /src/. "${PROFILE_DIR}/airootfs/opt/neubat/"

# Reducir tamaño de la ISO eliminando artefactos no necesarios en runtime.
rm -rf "${PROFILE_DIR}/airootfs/opt/neubat/.git"
rm -rf "${PROFILE_DIR}/airootfs/opt/neubat/portal/node_modules"
rm -rf "${PROFILE_DIR}/airootfs/opt/neubat/out"
rm -rf "${PROFILE_DIR}/airootfs/opt/neubat/tests/vm"/*.qcow2 2>/dev/null || true

echo "[build-iso] Instalando servicio de autoinstalación ..."
cp /src/iso/airootfs/etc/systemd/system/neubat-autoinstall.service \
   "${PROFILE_DIR}/airootfs/etc/systemd/system/"
cp /src/iso/airootfs/usr/local/bin/neubat-autoinstall \
   "${PROFILE_DIR}/airootfs/usr/local/bin/"
chmod +x "${PROFILE_DIR}/airootfs/usr/local/bin/neubat-autoinstall"
mkdir -p "${PROFILE_DIR}/airootfs/etc/systemd/system/multi-user.target.wants"
ln -sf /etc/systemd/system/neubat-autoinstall.service \
       "${PROFILE_DIR}/airootfs/etc/systemd/system/multi-user.target.wants/neubat-autoinstall.service"

# mkarchiso copia el airootfs con 'cp --no-preserve=mode': el +x del hook se
# pierde (queda 644) y systemd falla con 203/EXEC al arrancar el servicio.
# Declarar el modo en file_permissions es el mecanismo soportado por archiso.
sed -i 's|^)$|  ["/usr/local/bin/neubat-autoinstall"]="0:0:755"\n)|' \
    "${PROFILE_DIR}/profiledef.sh"
grep -q '"/usr/local/bin/neubat-autoinstall"' "${PROFILE_DIR}/profiledef.sh" || {
    echo "[build-iso] ERROR: no se pudo declarar el permiso del hook en profiledef.sh" >&2
    exit 1
}

echo "[build-iso] Ejecutando mkarchiso (puede tardar varios minutos) ..."
mkarchiso -v -w "${WORK_DIR}" "${PROFILE_DIR}" "/out/${ISO_NAME}"

# mkarchiso ignora el nombre solicitado y usa image_name de profiledef.sh.
for generated in /out/archlinux-*.iso; do
    [ -e "${generated}" ] && mv "${generated}" "/out/${ISO_NAME}"
done

echo "[build-iso] ISO generada: /out/${ISO_NAME}"
