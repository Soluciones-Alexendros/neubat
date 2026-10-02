#!/usr/bin/env bats
# =============================================================================
# NEUBAT - Tests HMAC del instalador:
#  - fail-closed de verify_config_signature (T1)
#  - contrato canónico JS<->Python con la fixture compartida
#    (tests/fixtures/hmac-canonical.json)
# =============================================================================

setup() {
    # Stubs de logging (neubat-install.sh los define en producción;
    # aquí error() debe abortar con exit 1 para el modo fail-closed).
    log() { echo "[LOG] $1"; }
    error() { echo "[ERROR] $1" >&2; exit 1; }
    warning() { echo "[WARNING] $1" >&2; }
    success() { echo "[OK] $1"; }

    # shellcheck source=scripts/20-archinstall.sh
    source "${BATS_TEST_DIRNAME}/../../scripts/20-archinstall.sh"

    TMP_DIR="$(mktemp -d)"
    export TMP_DIR
    TEST_SECRET="test-hmac-secret-fail-closed"

    # Contrato canónico: extrae el verificador Python y prepara
    # configs válida/manipulada a partir de la fixture compartida.
    WORK="$(mktemp -d)"
    SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/20-archinstall.sh"
    FIXTURE="${BATS_TEST_DIRNAME}/../fixtures/hmac-canonical.json"

    # Extrae el primer heredoc <<'PYEOF' de verify_config_signature (el verificador).
    python3 - "${SCRIPT}" "${WORK}/verifier.py" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
match = re.search(r"verify_config_signature\(\)\s*\{.*?<<'PYEOF'\n(.*?)\nPYEOF", src, re.S)
if not match:
    sys.exit("No se encontró el verificador Python en 20-archinstall.sh")
open(sys.argv[2], 'w').write(match.group(1) + "\n")
PY

    SECRET="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['secret'])" "${FIXTURE}")"

    python3 - "${FIXTURE}" "${WORK}/valid.json" "${WORK}/tampered.json" <<'PY'
import json, sys
fixture = json.load(open(sys.argv[1]))
valid = dict(fixture['config'])
valid['signature'] = fixture['expected_signature']
json.dump(valid, open(sys.argv[2], 'w'))
tampered = json.loads(json.dumps(valid))
tampered['snapshots']['cleanup']['hourly'] = 99
json.dump(tampered, open(sys.argv[3], 'w'))
PY
}

teardown() {
    [[ -n "${TMP_DIR:-}" && -d "${TMP_DIR}" ]] && rm -rf "${TMP_DIR}"
    [[ -n "${WORK:-}" && -d "${WORK}" ]] && rm -rf "${WORK}"
    unset NEUBAT_HMAC_SECRET
}

# Genera una config sin signature.
_make_unsigned_config() {
    local out="$1"
    cat > "${out}" <<'JSON'
{
  "token": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "machine_id": "deadbeef",
  "hostname": "neubat-test",
  "username": "tester",
  "desktop": "none",
  "password": "clave-distinta",
  "disk": "/dev/sda",
  "timezone": "Europe/Madrid",
  "locale": "es_ES.UTF-8",
  "keyboard": "es",
  "packages": ["b", "a"],
  "aur_packages": [],
  "services": ["sshd"],
  "encryption": {"enabled": false},
  "snapshots": {"enabled": false},
  "features": {"ssh": true}
}
JSON
}

# Genera una config firmada con el secreto dado (misma lógica que
# verify_config_signature: payload determinista + HMAC-SHA256 hex).
_make_signed_config() {
    local out="$1" secret="$2"
    _make_unsigned_config "${out}"
    python3 - "${out}" "${secret}" <<'PYEOF'
import json, hmac, hashlib, sys
path, secret = sys.argv[1], sys.argv[2].encode()
with open(path) as f:
    cfg = json.load(f)
def canonical_object(value):
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
sig = hmac.new(secret, '|'.join(parts).encode(), hashlib.sha256).hexdigest()
cfg['signature'] = sig
with open(path, 'w') as f:
    json.dump(cfg, f)
PYEOF
}

@test "sin signature y secreto definido → aborta" {
    export NEUBAT_HMAC_SECRET="${TEST_SECRET}"
    cfg="${TMP_DIR}/unsigned.json"
    _make_unsigned_config "${cfg}"
    run verify_config_signature "${cfg}"
    [ "$status" -eq 1 ]
    [[ "$output" =~ "sin firma HMAC" ]]
}

@test "firma inválida → aborta" {
    export NEUBAT_HMAC_SECRET="${TEST_SECRET}"
    cfg="${TMP_DIR}/tampered.json"
    _make_signed_config "${cfg}" "${TEST_SECRET}"
    # Manipular un campo firmado sin re-firmar.
    python3 - "${cfg}" <<'PYEOF'
import json, sys
p = sys.argv[1]
cfg = json.load(open(p))
cfg['hostname'] = 'manipulado'
json.dump(cfg, open(p, 'w'))
PYEOF
    run verify_config_signature "${cfg}"
    [ "$status" -eq 1 ]
    [[ "$output" =~ "inválida" ]]
}

@test "firma válida → OK" {
    export NEUBAT_HMAC_SECRET="${TEST_SECRET}"
    cfg="${TMP_DIR}/valid.json"
    _make_signed_config "${cfg}" "${TEST_SECRET}"
    run verify_config_signature "${cfg}"
    [ "$status" -eq 0 ]
}

@test "sin secreto → omitida (backward compat lab)" {
    unset NEUBAT_HMAC_SECRET
    cfg="${TMP_DIR}/lab.json"
    _make_unsigned_config "${cfg}"
    run verify_config_signature "${cfg}"
    [ "$status" -eq 0 ]
}

@test "el verificador Python acepta la firma canónica de la fixture" {
    run python3 "${WORK}/verifier.py" "${WORK}/valid.json" "${SECRET}"
    [ "$status" -eq 0 ]
}

@test "el verificador Python rechaza una configuración manipulada" {
    run python3 "${WORK}/verifier.py" "${WORK}/tampered.json" "${SECRET}"
    [ "$status" -eq 1 ]
}
