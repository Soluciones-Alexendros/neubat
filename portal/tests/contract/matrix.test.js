'use strict';
/**
 * Tests de matriz perfiles x opciones (Fase 4, C1-C7).
 * Recorre combinaciones críticas de perfil + desktop + cifrado + snapshots,
 * crea la instalación por la API real y valida el contrato config-v1 y las
 * invariantes que el instalador (scripts/20-archinstall.sh) asume.
 */

const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const request = require('supertest');
const app = require('../../server');
const db = require('../../lib/db');

const SCHEMAS_DIR = path.join(__dirname, '..', '..', '..', 'schemas');

const MATRIX = [
    {
        id: 'C1',
        body: { profile: 'production', desktop: 'kde', password: 'C1-Strong-Pass-123', encryption: { enabled: true, method: 'keyfile' }, snapshots: { enabled: true } },
        expect: { desktop: 'kde', desktopMapped: 'plasma', encryption: true, snapshots: true }
    },
    {
        id: 'C2',
        body: { profile: 'developer', desktop: 'gnome', password: 'C2-Strong-Pass-123', encryption: { enabled: true, method: 'keyfile' }, snapshots: { enabled: true } },
        expect: { desktop: 'gnome', desktopMapped: 'gnome', encryption: true, snapshots: true }
    },
    {
        id: 'C3',
        body: { profile: 'vm-luks', desktop: 'none', password: 'C3-Strong-Pass-123', encryption: { enabled: true, method: 'keyfile' }, snapshots: { enabled: false } },
        expect: { desktop: 'none', desktopMapped: null, encryption: true, snapshots: false }
    },
    {
        id: 'C4',
        body: { profile: 'base', desktop: 'none', password: 'C4-Strong-Pass-123', snapshots: { enabled: false } },
        expect: { desktop: 'none', desktopMapped: null, encryption: false, snapshots: false }
    },
    {
        id: 'C5',
        body: { profile: 'minimal', desktop: 'none', password: 'C5-Strong-Pass-123', snapshots: { enabled: false } },
        expect: { desktop: 'none', desktopMapped: null, encryption: false, snapshots: false }
    },
    {
        id: 'C6',
        body: { profile: 'production', desktop: 'hyprland', password: 'C6-Strong-Pass-123', encryption: { enabled: true, method: 'interactive', passphrase: 'C6-Interactive-Pass-123' }, snapshots: { enabled: true } },
        expect: { desktop: 'hyprland', desktopMapped: 'hyprland', encryption: true, snapshots: true, method: 'passphrase' }
    },
    {
        id: 'C7',
        body: { profile: 'developer', desktop: 'sway', password: 'C7-Strong-Pass-123', encryption: { enabled: true, method: 'keyfile' }, snapshots: { enabled: true } },
        expect: { desktop: 'sway', desktopMapped: 'sway', encryption: true, snapshots: true }
    }
];

describe('contract: matriz perfiles x opciones (C1-C7)', () => {
    let validate;

    beforeAll(async () => {
        const ajv = new Ajv2020({ allErrors: true, strict: true });
        addFormats(ajv);
        validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'config-v1.json'), 'utf8')));
        await db.initStorage();
    });

    beforeEach(async () => {
        const store = await db.readDB();
        store.installations = [];
        await db.writeDB(store);
    });

    test.each(MATRIX)('$id crea instalación válida y coherente', async ({ id, body, expect: exp }) => {
        const create = await request(app)
            .post('/api/install')
            .send({ ...body, hostname: `matrix-${id.toLowerCase()}` })
            .expect(200);

        const res = await request(app).get(create.body.config_url).expect(200);
        const config = res.body;

        const valid = validate(config);
        expect(validate.errors).toBeNull();
        expect(valid).toBe(true);

        expect(config.token).toBe(create.body.token);
        expect(config.status).toBe('pending');
        expect(config.desktop).toBe(exp.desktop);
        expect(config.encryption.enabled).toBe(exp.encryption);
        expect(config.snapshots.enabled).toBe(exp.snapshots);
        if (exp.method) {
            expect(config.encryption.method).toBe(exp.method);
        }

        // Conversión archinstall coherente con el desktop solicitado
        expect(config.archinstall.desktop).toBe(exp.desktop);
        expect(config.archinstall.config).toBeDefined();
        expect(config.archinstall.creds).toBeDefined();
        const details = config.archinstall.config.profile_config.profile.details;
        if (exp.desktopMapped) {
            expect(details).toHaveProperty(exp.desktopMapped);
        } else {
            expect(Object.keys(details)).toHaveLength(0);
        }

        // La unión de paquetes conserva los del perfil (developer trae git)
        if (exp.desktop === 'gnome' || exp.desktop === 'sway') {
            expect(config.packages).toContain('git');
        }

        // Cifrado activo => el par archinstall no debe exponer secretos públicos
        if (exp.encryption) {
            expect(config.password).not.toBe('neubat');
        }
    });

    test('passphrase pública "neubat" con cifrado activo es rechazada', async () => {
        const res = await request(app)
            .post('/api/install')
            .send({ profile: 'production', encryption: { enabled: true, method: 'passphrase', passphrase: 'neubat' } })
            .expect(400);
        expect(res.body.error).toMatch(/neubat/);
    });

    test('cada combinación usa un token distinto', async () => {
        const tokens = new Set();
        for (const { body } of MATRIX) {
            const res = await request(app).post('/api/install').send(body).expect(200);
            tokens.add(res.body.token);
        }
        expect(tokens.size).toBe(MATRIX.length);
    });
});
