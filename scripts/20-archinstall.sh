#!/bin/bash
# =============================================================================
# NEUBAT - Fase 0b/2: obtención de configuración e instalación del sistema base
# Módulo cargado por neubat-install.sh (no ejecutar directamente)
# Si se invoca directo (debug/lab), parsea el kernel cmdline con
# parse_kernel_cmdline() de scripts/lib/utils.sh (allowlist + validación).
# =============================================================================

# Invocación directa: obtener NEUBAT_* del kernel cmdline de forma segura.
# Al cargarse vía source desde neubat-install.sh no hace nada.
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
    _ARCHINSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    # shellcheck source=scripts/lib/utils.sh
    source "${_ARCHINSTALL_DIR}/lib/utils.sh"
    unset _ARCHINSTALL_DIR
    parse_kernel_cmdline
fi

fetch_configuration() {
    log "Obteniendo configuración para token: ${NEUBAT_TOKEN}"

    NEUBAT_WORKDIR=$(mktemp -d -t neubat-XXXXXX)
    cd "${NEUBAT_WORKDIR}" || error "No se pudo crear el directorio de trabajo"

    NEUBAT_CONFIG_FILE="${NEUBAT_WORKDIR}/neubat-config.json"

    # Intentar descargar la configuración personalizada del portal.
    # Si el portal es https, se prohíben protocolos inseguros (fail-closed TLS).
    _curl_proto=()
    if [[ "${NEUBAT_PORTAL_URL}" == https://* ]]; then
        _curl_proto=(--proto '=https' --tlsv1.2)
    fi
    if ! curl -sf --max-time 15 "${_curl_proto[@]}" "${NEUBAT_PORTAL_URL}/api/config/${NEUBAT_TOKEN}" -o "${NEUBAT_CONFIG_FILE}"; then
        warning "Sin config personalizada; usando perfil local: ${NEUBAT_PROFILE}"
        cp "${NEUBAT_ROOT}/configs/${NEUBAT_PROFILE}.json" "${NEUBAT_CONFIG_FILE}"
    fi
    unset _curl_proto
    chmod 600 "${NEUBAT_CONFIG_FILE}" 2>/dev/null || true

    # Validar JSON
    if ! python3 -m json.tool "${NEUBAT_CONFIG_FILE}" &>/dev/null; then
        error "Configuración JSON inválida"
    fi

    # Extraer parámetros clave (sin jq: python3 garantizado en el ISO).
    # Estas variables se consumen en los módulos 10/30/40 (archivos sourced).
    # shellcheck disable=SC2034
    DISK=$(cfg_get "${NEUBAT_CONFIG_FILE}" disk "/dev/sda")
    # shellcheck disable=SC2034
    HOSTNAME=$(cfg_get "${NEUBAT_CONFIG_FILE}" hostname "neubat")
    # shellcheck disable=SC2034
    USERNAME=$(cfg_get "${NEUBAT_CONFIG_FILE}" username "neubat")
    # shellcheck disable=SC2034
    PASSWORD=$(cfg_get "${NEUBAT_CONFIG_FILE}" password "")
    # shellcheck disable=SC2034
    DESKTOP=$(cfg_get "${NEUBAT_CONFIG_FILE}" desktop "none")
    # shellcheck disable=SC2034
    PACKAGES=$(cfg_get "${NEUBAT_CONFIG_FILE}" packages "")
    # shellcheck disable=SC2034
    AUR_PACKAGES=$(cfg_get "${NEUBAT_CONFIG_FILE}" aur_packages "")
    # shellcheck disable=SC2034
    TIMEZONE=$(cfg_get "${NEUBAT_CONFIG_FILE}" timezone "Europe/Madrid")
    # shellcheck disable=SC2034
    LOCALE=$(cfg_get "${NEUBAT_CONFIG_FILE}" locale "es_ES.UTF-8")
    # shellcheck disable=SC2034
    KEYMAP=$(cfg_get "${NEUBAT_CONFIG_FILE}" keyboard "es")

    # shellcheck disable=SC2034
    ENCRYPTION_ENABLED=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" encryption/enabled "false")
    # shellcheck disable=SC2034
    ENCRYPTION_METHOD=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" encryption/method "keyfile")
    # shellcheck disable=SC2034
    LUKS_PASSPHRASE=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" encryption/passphrase "")
    # shellcheck disable=SC2034
    LUKS_CIPHER=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" encryption/cipher "aes-xts-plain64")
    # shellcheck disable=SC2034
    LUKS_KEY_SIZE=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" encryption/key_size "512")

    # shellcheck disable=SC2034
    SNAPSHOTS_ENABLED=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" snapshots/enabled "false")
    # shellcheck disable=SC2034
    SNAP_KEEP_HOURLY=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" snapshots/cleanup/hourly "5")
    # shellcheck disable=SC2034
    SNAP_KEEP_DAILY=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" snapshots/cleanup/daily "7")
    # shellcheck disable=SC2034
    SNAP_KEEP_WEEKLY=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" snapshots/cleanup/weekly "2")
    # shellcheck disable=SC2034
    SNAP_KEEP_MONTHLY=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" snapshots/cleanup/monthly "2")

    # Features opcionales (features/*). ssh por defecto true para no romper
    # perfiles antiguos sin la clave features.
    # shellcheck disable=SC2034
    FEATURES_SSH=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" features/ssh "true")
    # shellcheck disable=SC2034
    FEATURES_FIREWALL=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" features/firewall "false")
    # shellcheck disable=SC2034
    FEATURES_AUTOMATIC_UPDATES=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" features/automatic_updates "false")
    # shellcheck disable=SC2034
    FEATURES_BACKUP_ENABLED=$(cfg_get_nested "${NEUBAT_CONFIG_FILE}" features/backup/enabled "false")

    if [[ "${FEATURES_FIREWALL}" == "true" ]]; then
        warning "features.firewall solicitado pero aún no implementado; configura un firewall tras el primer arranque"
    fi
    if [[ "${FEATURES_AUTOMATIC_UPDATES}" == "true" ]]; then
        warning "features.automatic_updates solicitado pero aún no implementado"
    fi
    if [[ "${FEATURES_BACKUP_ENABLED}" == "true" ]]; then
        warning "features.backup solicitado pero aún no implementado"
    fi

    # shellcheck disable=SC2034
    LUKS_KEYFILE=""
    if [[ "${ENCRYPTION_ENABLED}" == "true" && "${ENCRYPTION_METHOD}" == "keyfile" ]]; then
        LUKS_KEYFILE="${NEUBAT_WORKDIR}/luks-keyfile"
        log "Generando keyfile LUKS para arranque desatendido"
        dd if=/dev/urandom of="${LUKS_KEYFILE}" bs=512 count=1 status=none
        chmod 0400 "${LUKS_KEYFILE}"
    fi

    # Verificar firma HMAC de la configuración si el instalador tiene secreto.
    # Si la config viene de un perfil local (sin portal) y no hay firma, se omite.
    verify_config_signature "${NEUBAT_CONFIG_FILE}"

    if ! reject_public_luks_secret "${PASSWORD}" "${ENCRYPTION_ENABLED}" "${LUKS_PASSPHRASE}"; then
        error "Cifrado activo con la contraseña o la passphrase de ejemplo 'neubat'. Elige otra. En un laboratorio: NEUBAT_ALLOW_DEFAULT_SECRETS=1."
    fi

    if [[ "${PASSWORD}" == "neubat" ]]; then
        warning "Contraseña por defecto en uso. Cámbiala en el primer acceso."
    fi

    success "Configuración cargada: ${HOSTNAME} @ ${DISK} (perfil ${NEUBAT_PROFILE})"
}

# Verifica la firma HMAC-SHA256 de un archivo JSON descargado.
# Si NEUBAT_HMAC_SECRET está vacío, la verificación se omite (modo lab).
# Fail-closed: si hay secreto pero la config no trae signature o la firma
# es inválida, aborta con error fatal (exit 1 vía error()).
verify_config_signature() {
    local config_file="$1"
    local secret="${NEUBAT_HMAC_SECRET:-}"

    [[ -z "${secret}" ]] && return 0

    # Secreto débil: aviso claro pero no fatal para no romper el lab.
    if [[ "${#secret}" -lt 32 ]]; then
        warning "NEUBAT_HMAC_SECRET débil (<32 caracteres); genera uno con: openssl rand -hex 32"
    fi

    local rc=0
    python3 - "${config_file}" "${secret}" <<'PYEOF'
import json, hmac, hashlib, sys
with open(sys.argv[1]) as f:
    cfg = json.load(f)
secret = sys.argv[2].encode()
sig = cfg.pop('signature', None)
if sig is None:
    sys.exit(2)
def canonical_object(value):
    # JSON canónico recursivo (claves ordenadas en todos los niveles).
    # Debe coincidir con canonicalObject() de portal/lib/db.js.
    if not isinstance(value, dict):
        return ''
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

parts = [
    str(cfg.get('token', '')),
    str(cfg.get('machine_id', '')),
    str(cfg.get('hostname', '')),
    str(cfg.get('username', '')),
    str(cfg.get('desktop', '')),
    str(cfg.get('password', '')),
    str(cfg.get('disk', '')),
    str(cfg.get('timezone', '')),
    str(cfg.get('locale', '')),
    str(cfg.get('keyboard', '')),
    *(sorted(cfg.get('packages', [])) if isinstance(cfg.get('packages'), list) else []),
    *(sorted(cfg.get('aur_packages', [])) if isinstance(cfg.get('aur_packages'), list) else []),
    *(sorted(cfg.get('services', [])) if isinstance(cfg.get('services'), list) else []),
    canonical_object(cfg.get('encryption')),
    canonical_object(cfg.get('snapshots')),
    canonical_object(cfg.get('features')),
]
payload = '|'.join(parts).encode()
expected = hmac.new(secret, payload, hashlib.sha256).hexdigest()
sys.exit(0 if hmac.compare_digest(sig, expected) else 1)
PYEOF
    rc=$?
    if [[ "${rc}" -ne 0 ]]; then
        case "${rc}" in
            1) error "Firma HMAC inválida. Posible manipulación en tránsito." ;;
            2) error "Configuración sin firma HMAC; requerida cuando NEUBAT_HMAC_SECRET está definido" ;;
            *) error "Verificación HMAC falló (código ${rc})" ;;
        esac
    fi
}

install_base_system() {
    log "Instalando sistema base Arch Linux..."

    # Exportar JSON de archinstall para auditoría y para el motor desatendido.
    if [[ -f "${NEUBAT_CONFIG_FILE}" ]]; then
        python3 - "${NEUBAT_CONFIG_FILE}" "${NEUBAT_WORKDIR}" <<'PYEOF' || warning "No se pudo exportar config archinstall"
import json, sys
cfg = json.load(open(sys.argv[1]))
out = sys.argv[2]
pair = cfg.get("archinstall")
if not pair:
    sys.exit(0)
open(f"{out}/user_configuration.json", "w").write(json.dumps(pair.get("config", {}), indent=2))
open(f"{out}/user_credentials.json", "w").write(json.dumps(pair.get("creds", {}), indent=2))
print("archinstall configs written")
PYEOF
    fi

    # Motor archinstall: solo si está en el live y NEUBAT_USE_ARCHINSTALL=1.
    # En ese modo se asume que 10-partition aún no montó /mnt (ver neubat-install.sh).
    if [[ "${NEUBAT_USE_ARCHINSTALL:-0}" == "1" ]] && command -v archinstall >/dev/null 2>&1 \
        && [[ -f "${NEUBAT_WORKDIR}/user_configuration.json" ]]; then
        log "Invocando archinstall --config/--creds (desatendido)..."
        if archinstall --config "${NEUBAT_WORKDIR}/user_configuration.json" \
            --creds "${NEUBAT_WORKDIR}/user_credentials.json" \
            --silent; then
            success "Sistema base instalado con archinstall"
            return 0
        fi
        warning "archinstall falló; se continúa con pacstrap"
    fi

    # Optimizar mirrors (España y vecinos prioritarios)
    log "Optimizando mirrors..."
    reflector --country Spain,Germany,France \
              --age 12 \
              --protocol https \
              --latest 20 \
              --sort rate \
              --save /etc/pacman.d/mirrorlist || warning "reflector falló; se usan los mirrors por defecto"

    log "Instalando paquetes base con pacstrap..."
    pacstrap -K /mnt --noconfirm \
        base linux linux-firmware \
        btrfs-progs \
        cryptsetup \
        grub efibootmgr \
        networkmanager network-manager-applet \
        sudo git base-devel \
        curl wget \
        inetutils \
        reflector \
        neovim nano \
        terminus-font \
        openssh \
        ansible \
        python-archinstall || true

    log "Generando fstab..."
    genfstab -U /mnt >> /mnt/etc/fstab

    success "Sistema base instalado"
}
