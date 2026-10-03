'use strict';
/**
 * validate-contracts: valida schemas/*.json y los JSON del repo contra ellos.
 * - schemas compilan (draft 2020-12)
 * - configs/*.json (perfiles base) cumplen el subset de campos que aportan
 * - tests/fixtures/*.json parsean
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCHEMAS_DIR = path.join(ROOT, 'schemas');
const PORTAL_MODULES = path.join(ROOT, 'portal', 'node_modules');

const Ajv2020 = require(path.join(PORTAL_MODULES, 'ajv', 'dist', '2020'));
const addFormats = require(path.join(PORTAL_MODULES, 'ajv-formats'));

let failures = 0;
function fail(msg) {
    failures += 1;
    console.error(`FAIL ${msg}`);
}
function ok(msg) {
    console.log(`OK ${msg}`);
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

function loadSchema(file) {
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, file), 'utf8'));
    return ajv.compile(schema);
}

let validateConfig;
let validateCmdline;
try {
    validateConfig = loadSchema('config-v1.json');
    ok('schemas/config-v1.json compila');
} catch (e) {
    fail(`schemas/config-v1.json no compila: ${e.message}`);
}
try {
    validateCmdline = loadSchema('kernel-cmdline-v1.json');
    ok('schemas/kernel-cmdline-v1.json compila');
} catch (e) {
    fail(`schemas/kernel-cmdline-v1.json no compila: ${e.message}`);
}

// Perfiles base: aportan el subset sin token/machine_id/password/created_at/status/signature.
// Se validan contra el schema completo relajando `required` a los campos del perfil.
if (validateConfig) {
    const profileSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'config-v1.json'), 'utf8'));
    delete profileSchema.$id;
    profileSchema.required = ['hostname', 'username', 'desktop', 'timezone', 'locale', 'keyboard'];
    const profileAjv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(profileAjv);
    const validateProfile = profileAjv.compile(profileSchema);
    for (const f of fs.readdirSync(path.join(ROOT, 'configs')).filter((f) => f.endsWith('.json'))) {
        const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'configs', f), 'utf8'));
        if (validateProfile(doc)) {
            ok(`configs/${f} válido (subset perfil)`);
        } else {
            fail(`configs/${f} inválido: ${profileAjv.errorsText(validateProfile.errors)}`);
        }
    }
}

if (validateCmdline) {
    const good = {
        neubat_token: 'a'.repeat(32),
        neubat_profile: 'production',
        neubat_portal_url: 'https://portal.example.com'
    };
    if (validateCmdline(good)) {
        ok('kernel-cmdline ejemplo válido aceptado');
    } else {
        fail('kernel-cmdline ejemplo válido rechazado');
    }
}

for (const f of fs.readdirSync(path.join(ROOT, 'tests', 'fixtures'))) {
    try {
        JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', f), 'utf8'));
        ok(`tests/fixtures/${f} parsea`);
    } catch (e) {
        fail(`tests/fixtures/${f} no parsea: ${e.message}`);
    }
}

if (failures > 0) {
    console.error(`validate-contracts: ${failures} fallo(s)`);
    process.exit(1);
}
console.log('validate-contracts: todo válido');
