#!/usr/bin/env bats
# =============================================================================
# NEUBAT - Tests del parser seguro del kernel cmdline (SEC-004)
# Usa CMDLINE_OVERRIDE para inyectar una cmdline falsa.
# =============================================================================

setup() {
    UTILS="${BATS_TEST_DIRNAME}/../../scripts/lib/utils.sh"
    [[ -f "${UTILS}" ]]
    # shellcheck source=scripts/lib/utils.sh
    source "${UTILS}"
    unset NEUBAT_TOKEN NEUBAT_PROFILE NEUBAT_PORTAL_URL
    unset CMDLINE_OVERRIDE
    export NEUBAT_ALLOW_TEST_HOOKS=1
}

teardown() {
    unset CMDLINE_OVERRIDE
    unset NEUBAT_TOKEN NEUBAT_PROFILE NEUBAT_PORTAL_URL
    unset NEUBAT_ALLOW_TEST_HOOKS
}

@test "token válido + profile + URL https → exporta variables" {
    CMDLINE_OVERRIDE="neubat_token=0123456789abcdef0123456789abcdef neubat_profile=production neubat_portal_url=https://portal.example.com"
    export CMDLINE_OVERRIDE
    parse_kernel_cmdline
    [ "${NEUBAT_TOKEN}" = "0123456789abcdef0123456789abcdef" ]
    [ "${NEUBAT_PROFILE}" = "production" ]
    [ "${NEUBAT_PORTAL_URL}" = "https://portal.example.com" ]
}

@test "token con ; rm -rf / → rechaza" {
    CMDLINE_OVERRIDE="neubat_token=deadbeef; rm -rf / neubat_profile=production"
    export CMDLINE_OVERRIDE
    parse_kernel_cmdline
    [ -z "${NEUBAT_TOKEN:-}" ]
    [ "${NEUBAT_PROFILE}" = "production" ]
    [ ! -e "/tmp/neubat-cmdline-pwned" ]
}

@test "token con mayúsculas → rechaza (solo minúsculas, como el portal)" {
    CMDLINE_OVERRIDE="neubat_token=0123456789ABCDEF0123456789ABCDEF neubat_profile=production"
    export CMDLINE_OVERRIDE
    parse_kernel_cmdline
    [ -z "${NEUBAT_TOKEN:-}" ]
    [ "${NEUBAT_PROFILE}" = "production" ]
}

@test "profile con ../etc/passwd → rechaza" {
    CMDLINE_OVERRIDE="neubat_token=0123456789abcdef0123456789abcdef neubat_profile=../../etc/passwd"
    export CMDLINE_OVERRIDE
    parse_kernel_cmdline
    [ "${NEUBAT_TOKEN}" = "0123456789abcdef0123456789abcdef" ]
    [ -z "${NEUBAT_PROFILE:-}" ]
}

@test "URL ftp:// → rechaza" {
    CMDLINE_OVERRIDE="neubat_token=0123456789abcdef0123456789abcdef neubat_portal_url=ftp://example.com/archivo"
    export CMDLINE_OVERRIDE
    parse_kernel_cmdline
    [ "${NEUBAT_TOKEN}" = "0123456789abcdef0123456789abcdef" ]
    [ -z "${NEUBAT_PORTAL_URL:-}" ]
}

@test "sin NEUBAT_ALLOW_TEST_HOOKS → CMDLINE_OVERRIDE se ignora" {
    unset NEUBAT_ALLOW_TEST_HOOKS
    CMDLINE_OVERRIDE="neubat_token=0123456789abcdef0123456789abcdef neubat_profile=production"
    export CMDLINE_OVERRIDE
    parse_kernel_cmdline
    [ -z "${NEUBAT_TOKEN:-}" ]
}

@test "clave desconocida → ignora" {
    CMDLINE_OVERRIDE="neubat_token=0123456789abcdef0123456789abcdef neubat_profile=minimal evil_key=pwned neubat_hacker=1"
    export CMDLINE_OVERRIDE
    parse_kernel_cmdline
    [ "${NEUBAT_TOKEN}" = "0123456789abcdef0123456789abcdef" ]
    [ "${NEUBAT_PROFILE}" = "minimal" ]
    [ -z "${evil_key:-}" ]
    [ -z "${neubat_hacker:-}" ]
    [ -z "${EVIL_KEY:-}" ]
}
