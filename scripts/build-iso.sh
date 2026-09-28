#!/bin/bash
# =============================================================================
# NEUBAT - Generador de ISO híbrida con autoinstalación
# Construye una imagen Arch Linux (releng) personalizada que arranca el
# instalador NEUBAT cuando se le pasa neubat_token en el kernel cmdline.
#
# Uso: bash scripts/build-iso.sh [tag]
# Salida: out/neubat-<tag>-x86_64.iso
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${1:-2.0.0}"
OUT_DIR="${ROOT_DIR}/out"
ISO_NAME="neubat-${TAG}-x86_64.iso"

mkdir -p "${OUT_DIR}"

echo "[build-iso] Construyendo ${ISO_NAME} con Docker + archiso ..."

# Se usa --privileged porque mkarchiso necesita montar filesystems/loops.
docker run --rm --privileged \
    -v "${OUT_DIR}:/out" \
    -v "${ROOT_DIR}:/src:ro" \
    archlinux:latest bash /src/scripts/build-iso-inner.sh "${ISO_NAME}"

echo "[build-iso] Listo: ${OUT_DIR}/${ISO_NAME}"
ls -lh "${OUT_DIR}/${ISO_NAME}"
