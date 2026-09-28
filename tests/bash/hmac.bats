#!/usr/bin/env bats
# Verifica que el verificador Python del instalador acepta la firma canónica de
# la fixture compartida (tests/fixtures/hmac-canonical.json), garantizando que
# la serialización de JS y Python produce el mismo payload.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/20-archinstall.sh"
    FIXTURE="${BATS_TEST_DIRNAME}/../fixtures/hmac-canonical.json"
    WORK="$(mktemp -d)"

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
    rm -rf "${WORK}"
}

@test "el verificador Python acepta la firma canónica de la fixture" {
    run python3 "${WORK}/verifier.py" "${WORK}/valid.json" "${SECRET}"
    [ "$status" -eq 0 ]
}

@test "el verificador Python rechaza una configuración manipulada" {
    run python3 "${WORK}/verifier.py" "${WORK}/tampered.json" "${SECRET}"
    [ "$status" -eq 1 ]
}
