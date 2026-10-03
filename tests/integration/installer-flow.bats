#!/usr/bin/env bats
# =============================================================================
# NEUBAT - Pruebas de integración de las fases del instalador.
#
# Solo se cargan por `source` los archivos que son safe-to-source:
#   - scripts/lib/utils.sh          (solo definiciones de funciones)
#   - scripts/20-archinstall.sh     (guard BASH_SOURCE==0 en línea 11)
#
# Las funciones de log/error viven en neubat-install.sh, que NO es
# safe-to-source; aquí se inyectan stubs antes de invocar las funciones.
# =============================================================================

setup() {
    REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
    UTILS="${REPO_ROOT}/scripts/lib/utils.sh"
    ARCHINSTALL="${REPO_ROOT}/scripts/20-archinstall.sh"
    FIXTURE="${REPO_ROOT}/tests/fixtures/hmac-canonical.json"

    [ -f "${UTILS}" ]
    [ -f "${ARCHINSTALL}" ]
    [ -f "${FIXTURE}" ]

    # shellcheck source=scripts/lib/utils.sh
    source "${UTILS}"
    # shellcheck source=scripts/20-archinstall.sh
    source "${ARCHINSTALL}"

    # Stubs de logging (definidos en neubat-install.sh, no en 20-archinstall.sh).
    log() { :; }
    warning() { echo "WARN: $*" >&2; }
    success() { :; }
    error() { echo "ERROR: $*" >&2; exit 1; }

    export NEUBAT_ROOT="${REPO_ROOT}"
    TMPDIR_TEST="$(mktemp -d -t neubat-it-XXXXXX)"

    # Configs firmada / sin firma / manipulada a partir del fixture canónico.
    python3 - "${FIXTURE}" "${TMPDIR_TEST}/signed.json" "${TMPDIR_TEST}/unsigned.json" "${TMPDIR_TEST}/tampered.json" <<'PYEOF'
import json, sys
fixture = json.load(open(sys.argv[1]))
cfg = dict(fixture["config"])

unsigned = dict(cfg)
json.dump(unsigned, open(sys.argv[3], "w"))

signed = dict(cfg)
signed["signature"] = fixture["expected_signature"]
json.dump(signed, open(sys.argv[2], "w"))

tampered = dict(signed)
tampered["hostname"] = "atacante"
json.dump(tampered, open(sys.argv[4], "w"))
PYEOF
}

teardown() {
    rm -rf "${TMPDIR_TEST}"
    unset NEUBAT_TOKEN NEUBAT_PROFILE NEUBAT_PORTAL_URL NEUBAT_HMAC_SECRET \
        NEUBAT_ALLOW_DEFAULT_SECRETS CMDLINE_OVERRIDE NEUBAT_ALLOW_TEST_HOOKS \
        NEUBAT_CONFIG_FILE NEUBAT_WORKDIR NEUBAT_USE_ARCHINSTALL 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# parse_kernel_cmdline (allowlist)
# ---------------------------------------------------------------------------

@test "parse_kernel_cmdline extrae token, perfil y url válidos" {
    export NEUBAT_ALLOW_TEST_HOOKS=1
    export CMDLINE_OVERRIDE="quiet neubat_token=0123456789abcdef0123456789abcdef neubat_profile=production neubat_portal_url=https://portal.example.com"
    parse_kernel_cmdline
    [ "${NEUBAT_TOKEN}" = "0123456789abcdef0123456789abcdef" ]
    [ "${NEUBAT_PROFILE}" = "production" ]
    [ "${NEUBAT_PORTAL_URL}" = "https://portal.example.com" ]
}

@test "parse_kernel_cmdline ignora token inválido y claves desconocidas" {
    unset NEUBAT_TOKEN
    export NEUBAT_ALLOW_TEST_HOOKS=1
    export CMDLINE_OVERRIDE="neubat_token=NO-VALIDO neubat_profile=minimal foo=bar"
    parse_kernel_cmdline
    [ -z "${NEUBAT_TOKEN:-}" ]
    [ "${NEUBAT_PROFILE}" = "minimal" ]
}

@test "parse_kernel_cmdline rechaza url con metacaracteres" {
    unset NEUBAT_PORTAL_URL
    export NEUBAT_ALLOW_TEST_HOOKS=1
    export CMDLINE_OVERRIDE='neubat_portal_url=https://e.com/$(evil)'
    parse_kernel_cmdline
    [ -z "${NEUBAT_PORTAL_URL:-}" ]
}

# ---------------------------------------------------------------------------
# part_name (seguridad de dispositivos NVMe/MMC)
# ---------------------------------------------------------------------------

@test "part_name construye particiones para SATA, NVMe, MMC y virtio" {
    [ "$(part_name /dev/sda 1)" = "/dev/sda1" ]
    [ "$(part_name /dev/vda 3)" = "/dev/vda3" ]
    [ "$(part_name /dev/nvme0n1 1)" = "/dev/nvme0n1p1" ]
    [ "$(part_name /dev/mmcblk0 2)" = "/dev/mmcblk0p2" ]
}

# ---------------------------------------------------------------------------
# cfg_get / cfg_get_nested contra un perfil real
# ---------------------------------------------------------------------------

@test "cfg_get y cfg_get_nested leen el perfil base con defaults" {
    local base="${NEUBAT_ROOT}/configs/base.json"
    [ "$(cfg_get "${base}" disk)" = "/dev/sda" ]
    [ "$(cfg_get "${base}" hostname)" = "neubat-base" ]
    [ "$(cfg_get_nested "${base}" encryption/enabled)" = "false" ]
    [ "$(cfg_get_nested "${base}" snapshots/cleanup/daily)" = "7" ]
    [ "$(cfg_get "${base}" inexistente "por_defecto")" = "por_defecto" ]
    [ "$(cfg_get_nested "${base}" features/ssh "true")" = "true" ]
}

# ---------------------------------------------------------------------------
# reject_public_luks_secret (política de secretos por defecto)
# ---------------------------------------------------------------------------

@test "reject_public_luks_secret aplica la matriz de política" {
    unset NEUBAT_ALLOW_DEFAULT_SECRETS
    run reject_public_luks_secret "neubat" "false" "";   [ "$status" -eq 0 ]
    run reject_public_luks_secret "fuerte-123" "false" ""; [ "$status" -eq 0 ]
    run reject_public_luks_secret "neubat" "true" "";    [ "$status" -eq 1 ]
    run reject_public_luks_secret "fuerte-123" "true" "neubat"; [ "$status" -eq 1 ]
    run reject_public_luks_secret "fuerte-123" "true" "otra";   [ "$status" -eq 0 ]
    NEUBAT_ALLOW_DEFAULT_SECRETS=1 run reject_public_luks_secret "neubat" "true" "neubat"
    [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# verify_config_signature (HMAC-SHA256, fail-closed)
# ---------------------------------------------------------------------------

@test "verify_config_signature acepta una firma válida" {
    export NEUBAT_HMAC_SECRET="neubat-fixture-secret"
    run verify_config_signature "${TMPDIR_TEST}/signed.json"
    [ "$status" -eq 0 ]
}

@test "verify_config_signature rechaza configuración manipulada" {
    export NEUBAT_HMAC_SECRET="neubat-fixture-secret"
    run verify_config_signature "${TMPDIR_TEST}/tampered.json"
    [ "$status" -ne 0 ]
    [[ "${output}" == *"HMAC inválida"* ]]
}

@test "verify_config_signature exige firma cuando hay secreto definido" {
    export NEUBAT_HMAC_SECRET="neubat-fixture-secret"
    run verify_config_signature "${TMPDIR_TEST}/unsigned.json"
    [ "$status" -ne 0 ]
    [[ "${output}" == *"sin firma HMAC"* ]]
}

@test "verify_config_signature omite la verificación sin secreto (modo lab)" {
    unset NEUBAT_HMAC_SECRET
    run verify_config_signature "${TMPDIR_TEST}/unsigned.json"
    [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# fetch_configuration (fallback a perfil local sin portal)
# ---------------------------------------------------------------------------

@test "fetch_configuration usa el perfil local cuando el portal no responde" {
    export NEUBAT_PROFILE="base"
    export NEUBAT_TOKEN="0123456789abcdef0123456789abcdef"
    export NEUBAT_PORTAL_URL="http://127.0.0.1:9"
    unset NEUBAT_HMAC_SECRET

    fetch_configuration

    [ -f "${NEUBAT_CONFIG_FILE}" ]
    python3 -m json.tool "${NEUBAT_CONFIG_FILE}" >/dev/null
    [ "${DISK}" = "/dev/sda" ]
    [ "${HOSTNAME}" = "neubat-base" ]
    [ "${ENCRYPTION_ENABLED}" = "false" ]
    [ "${SNAPSHOTS_ENABLED}" = "false" ]
}

# ---------------------------------------------------------------------------
# install_base_system (exportación archinstall + rama archinstall)
# ---------------------------------------------------------------------------

@test "install_base_system exporta user_configuration y user_credentials" {
    NEUBAT_WORKDIR="${TMPDIR_TEST}"
    NEUBAT_CONFIG_FILE="${TMPDIR_TEST}/arch.json"
    export NEUBAT_CONFIG_FILE NEUBAT_WORKDIR
    export NEUBAT_USE_ARCHINSTALL=0
    python3 - "${NEUBAT_CONFIG_FILE}" <<'PYEOF'
import json, sys
json.dump({"archinstall": {"config": {"version": "3"}, "creds": {"!users": []}}}, open(sys.argv[1], "w"))
PYEOF

    reflector() { :; }
    pacstrap() { :; }
    genfstab() { :; }

    run install_base_system
    [ -f "${NEUBAT_WORKDIR}/user_configuration.json" ]
    [ -f "${NEUBAT_WORKDIR}/user_credentials.json" ]
    [ "$(python3 -c 'import json;print(json.load(open("'"${NEUBAT_WORKDIR}"'/user_configuration.json"))["version"])')" = "3" ]
}

@test "install_base_system invoca archinstall cuando NEUBAT_USE_ARCHINSTALL=1" {
    NEUBAT_WORKDIR="${TMPDIR_TEST}"
    NEUBAT_CONFIG_FILE="${TMPDIR_TEST}/arch.json"
    export NEUBAT_CONFIG_FILE NEUBAT_WORKDIR
    export NEUBAT_USE_ARCHINSTALL=1
    python3 - "${NEUBAT_CONFIG_FILE}" <<'PYEOF'
import json, sys
json.dump({"archinstall": {"config": {"version": "3"}, "creds": {"!users": []}}}, open(sys.argv[1], "w"))
PYEOF

    archinstall() { return 0; }

    run install_base_system
    [ "$status" -eq 0 ]
}
