#!/bin/bash
# =============================================================================
# NEUBAT - Utilidades compartidas de los scripts de instalación
# Funciones puras reutilizables; puede cargarse sin ejecutar el instalador.
# =============================================================================

# Sufijo de partición: /dev/sda -> /dev/sda1, /dev/nvme0n1 -> /dev/nvme0n1p1
part_name() {
    local disk="$1" num="$2"
    if [[ "${disk}" =~ [0-9]$ ]]; then
        echo "${disk}p${num}"
    else
        echo "${disk}${num}"
    fi
}

# Lectura de claves JSON sin jq (python3 está garantizado en el ISO de Arch)
# Uso: cfg_get <archivo> <clave> [valor_por_defecto]
cfg_get() {
    python3 - "$1" "$2" "${3:-}" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    cfg = json.load(f)
val = cfg.get(sys.argv[2])
if val is None:
    print(sys.argv[3])
elif isinstance(val, list):
    print(' '.join(str(v) for v in val))
else:
    print(val)
PYEOF
}

# Lectura de claves anidadas (objetos dentro de objetos).
# Soporta separadores '/' o '.'. Ejemplo: cfg_get_nested cfg.json encryption/enabled false
# Uso: cfg_get_nested <archivo> <ruta> [valor_por_defecto]
cfg_get_nested() {
    python3 - "$1" "$2" "${3:-}" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    cfg = json.load(f)
path = sys.argv[2].replace('/', '.').split('.')
default = sys.argv[3]
val = cfg
for key in path:
    if not isinstance(val, dict) or key not in val:
        print(default)
        sys.exit(0)
    val = val[key]
if val is None:
    print(default)
elif isinstance(val, bool):
    print("true" if val else "false")
elif isinstance(val, list):
    print(' '.join(str(v) for v in val))
else:
    print(val)
PYEOF
}

# Cifrado con el secreto de ejemplo del repositorio. 0 = se puede continuar.
# NEUBAT_ALLOW_DEFAULT_SECRETS=1 solo para un laboratorio que asume el riesgo.
reject_public_luks_secret() {
    local password="$1" enabled="$2" passphrase="$3"
    [[ "${NEUBAT_ALLOW_DEFAULT_SECRETS:-}" == "1" ]] && return 0
    [[ "${enabled}" == "true" ]] || return 0
    if [[ "${password}" == "neubat" || "${passphrase}" == "neubat" ]]; then
        return 1
    fi
    return 0
}

# Parser seguro del kernel cmdline (SEC-004): no interpreta la cmdline como código.
# Lee /proc/cmdline o $CMDLINE_OVERRIDE (solo tests), con allowlist:
# neubat_token, neubat_profile, neubat_portal_url.
# Solo exporta valores validados: NEUBAT_TOKEN, NEUBAT_PROFILE,
# NEUBAT_PORTAL_URL. Claves desconocidas se ignoran.
# Uso: parse_kernel_cmdline
parse_kernel_cmdline() {
    local cmdline_src=""
    if [[ "${NEUBAT_ALLOW_TEST_HOOKS:-}" == "1" && -n "${CMDLINE_OVERRIDE+x}" ]]; then
        cmdline_src="${CMDLINE_OVERRIDE}"
    elif [[ -r /proc/cmdline ]]; then
        cmdline_src="$(cat /proc/cmdline)"
    fi

    unset NEUBAT_TOKEN NEUBAT_PROFILE NEUBAT_PORTAL_URL

    local token_re='^[0-9a-f]{32}$'
    local profile_re='^[A-Za-z0-9_-]{1,64}$'
    # shellcheck disable=SC2016 # $() entre comillas simples es regex literal intencional (caracteres a rechazar).
    local url_re='^https?://[^[:space:]"'"'"';`$(){}|&<>]+$'

    local -a parts=()
    read -ra parts <<< "${cmdline_src}" || true
    [[ "${#parts[@]}" -eq 0 ]] && return 0

    local entry key value
    for entry in "${parts[@]}"; do
        case "${entry}" in
            *=*) ;;
            *) continue ;;
        esac
        key="${entry%%=*}"
        value="${entry#*=}"
        case "${key}" in
            neubat_token)
                if [[ "${value}" =~ ${token_re} ]]; then
                    export NEUBAT_TOKEN="${value}"
                fi
                ;;
            neubat_profile)
                if [[ "${value}" =~ ${profile_re} ]]; then
                    export NEUBAT_PROFILE="${value}"
                fi
                ;;
            neubat_portal_url)
                if [[ "${value}" =~ ${url_re} ]]; then
                    export NEUBAT_PORTAL_URL="${value}"
                fi
                ;;
            *) continue ;;
        esac
    done
}
