'use strict';
/**
 * Tests de contrato: schemas JSON versionados (schemas/*.json).
 * Producer: portal POST /api/install + configs/*.json (perfiles base).
 * Consumer: instalador scripts/20-archinstall.sh (HMAC, fetch) y
 * parse_kernel_cmdline() en scripts/lib/utils.sh.
 */

const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const request = require('supertest');
const app = require('../../server');
const db = require('../../lib/db');

const SCHEMAS_DIR = path.join(__dirname, '..', '..', '..', 'schemas');
const PROFILES = ['base', 'minimal', 'production', 'developer', 'vm-luks'];

function loadValidator(schemaFile) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, schemaFile), 'utf8'));
    return ajv.compile(schema);
}

describe('contract: config-v1', () => {
    let validate;

    beforeAll(async () => {
        validate = loadValidator('config-v1.json');
        await db.initStorage();
    });

    beforeEach(async () => {
        const store = await db.readDB();
        store.installations = [];
        await db.writeDB(store);
    });

    test.each(PROFILES)('POST /api/install con perfil %s genera config válida', async (profile) => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile, hostname: `contract-${profile}` })
            .expect(200);

        const res = await request(app).get(create.body.config_url).expect(200);
        const valid = validate(res.body);
        expect(validate.errors).toBeNull();
        expect(valid).toBe(true);
        // Invariantes del contrato que el instalador asume
        expect(res.body.token).toBe(create.body.token);
        expect(res.body.archinstall).toBeDefined();
        expect(res.body.archinstall.config).toBeDefined();
        expect(res.body.archinstall.creds).toBeDefined();
    });

    test('config con desktop inválido es rechazada por el schema', () => {
        const bad = {
            token: 'a'.repeat(32),
            machine_id: 'b'.repeat(8),
            hostname: 'h1',
            username: 'neubat',
            password: 'x',
            desktop: 'windows11',
            timezone: 'Europe/Madrid',
            locale: 'es_ES.UTF-8',
            keyboard: 'es',
            created_at: new Date().toISOString(),
            status: 'pending'
        };
        expect(validate(bad)).toBe(false);
        expect(validate.errors.some((e) => e.instancePath === '/desktop')).toBe(true);
    });

    test('config con token no-hex es rechazada por el schema', () => {
        const bad = {
            token: 'no-es-hex!!',
            machine_id: 'b'.repeat(8),
            hostname: 'h1',
            username: 'neubat',
            password: 'x',
            desktop: 'none',
            timezone: 'Europe/Madrid',
            locale: 'es_ES.UTF-8',
            keyboard: 'es',
            created_at: new Date().toISOString(),
            status: 'pending'
        };
        expect(validate(bad)).toBe(false);
    });
});

describe('contract: kernel-cmdline-v1', () => {
    let validate;

    beforeAll(() => {
        validate = loadValidator('kernel-cmdline-v1.json');
    });

    test('parámetros válidos del instalador pasan el schema', () => {
        expect(validate({
            neubat_token: 'a'.repeat(32),
            neubat_profile: 'production',
            neubat_portal_url: 'https://portal.example.com'
        })).toBe(true);
    });

    test.each(PROFILES)('perfil %s es un valor permitido', (profile) => {
        expect(validate({
            neubat_token: 'a'.repeat(32),
            neubat_profile: profile,
            neubat_portal_url: 'https://portal.example.com'
        })).toBe(true);
    });

    test('token con mayúsculas o corto es rechazado', () => {
        expect(validate({
            neubat_token: 'ABCDEF123456',
            neubat_profile: 'base',
            neubat_portal_url: 'https://portal.example.com'
        })).toBe(false);
    });

    test('portal_url no http(s) es rechazado', () => {
        expect(validate({
            neubat_token: 'a'.repeat(32),
            neubat_profile: 'base',
            neubat_portal_url: 'ftp://evil.example.com/x'
        })).toBe(false);
    });
});
