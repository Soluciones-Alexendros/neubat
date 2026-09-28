#!/bin/bash
# =============================================================================
# NEUBAT - Sistema de Instalación Desatendida de Arch Linux
# Script maestro (orquestador) para producción en SSD/HDD
#
# Uso:   bash neubat-install.sh [token] [perfil]
# Entorno:
#   NEUBAT_PORTAL_URL   URL del portal (defecto: http://localhost:3000)
#   NEUBAT_ASSUME_YES   "true" para omitir la confirmación de borrado de disco
#
# AVISO: este script DESTRUYE TODOS LOS DATOS del disco objetivo.
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# CONFIGURACIÓN GLOBAL
# -----------------------------------------------------------------------------

NEUBAT_VERSION="2.0.0"
NEUBAT_TOKEN="${1:-}"
NEUBAT_PROFILE="${2:-production}"
NEUBAT_LOG="/var/log/neubat-install.log"
NEUBAT_PORTAL_URL="${NEUBAT_PORTAL_URL:-http://localhost:3000}"
NEUBAT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NEUBAT_WORKDIR=""

if [[ -z "${NEUBAT_TOKEN}" ]]; then
    if command -v openssl &>/dev/null; then
        NEUBAT_TOKEN="$(openssl rand -hex 16)"
    else
        NEUBAT_TOKEN="$(head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    fi
fi

# Colores para output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# -----------------------------------------------------------------------------
# FUNCIONES DE UTILIDAD
# -----------------------------------------------------------------------------

log()     { echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "${NEUBAT_LOG}"; }
error()   { echo -e "${RED}[ERROR]${NC} $1" | tee -a "${NEUBAT_LOG}"; exit 1; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "${NEUBAT_LOG}"; }
success() { echo -e "${GREEN}[OK]${NC} $1" | tee -a "${NEUBAT_LOG}"; }

# Utilidades compartidas (part_name, cfg_get)
source "${NEUBAT_ROOT}/scripts/lib/utils.sh"

# -----------------------------------------------------------------------------
# MÓDULOS DE FASES
# -----------------------------------------------------------------------------

source "${NEUBAT_ROOT}/scripts/00-preinstall.sh"     # check_requirements
source "${NEUBAT_ROOT}/scripts/10-partition.sh"      # partition_disk
source "${NEUBAT_ROOT}/scripts/20-archinstall.sh"    # fetch_configuration, install_base_system
source "${NEUBAT_ROOT}/scripts/30-postinstall.sh"    # configure_system, install_applications
source "${NEUBAT_ROOT}/scripts/35-snapper.sh"        # configure_snapper
source "${NEUBAT_ROOT}/scripts/40-portal-deploy.sh"  # deploy_local_portal
source "${NEUBAT_ROOT}/scripts/50-firstboot-ansible.sh"  # prepare_ansible_firstboot

# -----------------------------------------------------------------------------
# FASE 6: LIMPIEZA Y FINALIZACIÓN
# -----------------------------------------------------------------------------

finalize_installation() {
    log "Finalizando instalación..."

    # Calcular duración de la instalación para métricas
    local duration=0
    if [[ -n "${NEUBAT_START_TIME:-}" ]]; then
        duration=$(($(date +%s) - NEUBAT_START_TIME))
    fi

    # Limpiar archivos temporales
    rm -f /mnt/root/neubat-config.json

    # Notificar al portal central (si existe conectividad)
    curl -sf -X POST "${NEUBAT_PORTAL_URL}/api/complete" \
         -H "Content-Type: application/json" \
         -d "{\"token\":\"${NEUBAT_TOKEN}\",\"status\":\"completed\",\"hostname\":\"${HOSTNAME}\",\"duration\":${duration}}" \
         || warning "No se pudo notificar al portal central"

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "                 INSTALACIÓN NEUBAT COMPLETADA                 "
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  Hostname:    ${HOSTNAME}"
    echo "  Usuario:     ${USERNAME}"
    echo "  Contraseña:  la definida en la configuración (cámbiala ya)"
    echo "  Perfil:      ${NEUBAT_PROFILE}"
    echo ""
    echo "  Portal local: http://${HOSTNAME}.local:3000"
    echo "  URL setup:    ver archivo NEUBAT-URL.txt en el home"
    echo ""
    echo "  El sistema se reiniciará en 10 segundos..."
    echo "═══════════════════════════════════════════════════════════════"

    sleep 10
    umount -R /mnt
    reboot
}

# -----------------------------------------------------------------------------
# EJECUCIÓN PRINCIPAL
# -----------------------------------------------------------------------------

main() {
    # No limpiar la pantalla en salida no interactiva (consola serie/VM)
    [[ -t 1 ]] && clear || true
    echo "═══════════════════════════════════════════════════════════════"
    echo "   NEUBAT v${NEUBAT_VERSION} - Instalador Desatendido Arch Linux   "
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    NEUBAT_START_TIME=$(date +%s)

    check_requirements
    fetch_configuration
    partition_disk
    install_base_system
    configure_system
    install_applications
    configure_snapper
    deploy_local_portal
    prepare_ansible_firstboot
    finalize_installation
}

trap 'error "Instalación interrumpida"' INT TERM

main "$@"
