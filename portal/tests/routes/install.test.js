'use strict';

const request = require('supertest');
const app = require('../../server');
const db = require('../../lib/db');

describe('routes/install', () => {
    beforeAll(async () => {
        await db.initStorage();
    });

    beforeEach(async () => {
        const store = await db.readDB();
        store.installations = [];
        await db.writeDB(store);
    });

    test('POST /api/install crea una instalación', async () => {
        const res = await request(app)
            .post('/api/install')
            .send({ profile: 'base', hostname: 'test1' })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.token).toMatch(/^[0-9a-f]{32}$/);
        expect(res.body.boot_url).toMatch(/^\/boot\//);
    });

    test('POST /api/install rechaza perfil desconocido', async () => {
        await request(app)
            .post('/api/install')
            .send({ profile: 'noexiste' })
            .expect(400);
    });

    test('POST /api/install rechaza perfil con traversal', async () => {
        await request(app)
            .post('/api/install')
            .send({ profile: '../package' })
            .expect(400);
    });

    test('GET /api/config/:token devuelve la configuración', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base', hostname: 'test2' });

        const res = await request(app)
            .get(create.body.config_url)
            .expect(200);

        expect(res.body.hostname).toBe('test2');
        expect(res.body.token).toBe(create.body.token);
    });

    test('GET /api/config/:token cambia estado a downloaded', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base' });

        await request(app).get(create.body.config_url).expect(200);
        const store = await db.readDB();
        const install = store.installations.find(i => i.token === create.body.token);
        expect(install.status).toBe('downloaded');
    });

    test('POST /api/complete marca instalación como completada', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base' });

        await request(app)
            .post('/api/complete')
            .send({ token: create.body.token, status: 'completed', hostname: 'test2' })
            .expect(200);

        const store = await db.readDB();
        const install = store.installations.find(i => i.token === create.body.token);
        expect(install.status).toBe('completed');
        expect(install.hostname).toBe('test2');
    });

    test('POST /api/complete acepta status failed', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base' });

        await request(app)
            .post('/api/complete')
            .send({ token: create.body.token, status: 'failed', error: 'sin espacio en disco' })
            .expect(200);

        const store = await db.readDB();
        const install = store.installations.find(i => i.token === create.body.token);
        expect(install.status).toBe('failed');
        expect(install.error).toBe('sin espacio en disco');
    });

    test('POST /api/complete rechaza status inválido con 400', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base' });

        const res = await request(app)
            .post('/api/complete')
            .send({ token: create.body.token, status: 'in-progress' })
            .expect(400);
        expect(res.body.error).toMatch(/Estado inválido/);

        const store = await db.readDB();
        const install = store.installations.find(i => i.token === create.body.token);
        expect(install.status).toBe('pending');
    });

    test('POST /api/complete sin status conserva el default completed', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base' });

        await request(app)
            .post('/api/complete')
            .send({ token: create.body.token })
            .expect(200);

        const store = await db.readDB();
        const install = store.installations.find(i => i.token === create.body.token);
        expect(install.status).toBe('completed');
    });

    test('GET /boot/:token devuelve script iPXE', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base' });

        const res = await request(app)
            .get(create.body.boot_url)
            .expect(200)
            .expect('Content-Type', 'text/plain; charset=utf-8');

        expect(res.text).toContain('#!ipxe');
        expect(res.text).toContain(`neubat_token=${create.body.token}`);
    });

    test('POST /api/install acepta opciones de cifrado', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({
                profile: 'base',
                hostname: 'test-encrypted',
                password: 'clave-distinta',
                encryption: { enabled: true, method: 'passphrase', passphrase: 'secreto' }
            })
            .expect(200);

        const res = await request(app).get(create.body.config_url).expect(200);
        expect(res.body.encryption.enabled).toBe(true);
        expect(res.body.encryption.method).toBe('passphrase');
        expect(res.body.encryption.passphrase).toBe('secreto');
    });

    test('POST /api/install permite sobreescribir contraseña', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base', password: 'custom-password' })
            .expect(200);

        const res = await request(app).get(create.body.config_url).expect(200);
        expect(res.body.password).toBe('custom-password');
    });

    test('POST /api/install acepta opciones de snapshots', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({
                profile: 'base',
                snapshots: { enabled: true, cleanup: { hourly: 10 } }
            })
            .expect(200);

        const res = await request(app).get(create.body.config_url).expect(200);
        expect(res.body.snapshots.enabled).toBe(true);
        expect(res.body.snapshots.cleanup.hourly).toBe(10);
    });

    test('POST /api/install rechaza cifrado con el secreto de ejemplo', async () => {
        // F1: production.json ya no trae passphrase "neubat" -> los defaults son aceptados.
        const ok = await request(app)
            .post('/api/install')
            .send({ profile: 'production', hostname: 'no-publico' })
            .expect(200);
        expect(ok.body.token).toMatch(/^[0-9a-f]{32}$/);

        await request(app)
            .post('/api/install')
            .send({
                profile: 'base',
                password: 'clave-distinta',
                encryption: { enabled: true, method: 'passphrase', passphrase: 'neubat' }
            })
            .expect(400);

        const res = await request(app)
            .post('/api/install')
            .send({
                profile: 'production',
                hostname: 'con-secreto-explicito',
                encryption: { enabled: true, method: 'passphrase', passphrase: 'neubat' }
            })
            .expect(400);
        expect(res.body.error).toMatch(/neubat/);
    });

    test('NEUBAT_ALLOW_DEFAULT_SECRETS permite el perfil production en laboratorio', async () => {
        process.env.NEUBAT_ALLOW_DEFAULT_SECRETS = '1';
        try {
            await request(app)
                .post('/api/install')
                .send({ profile: 'production', hostname: 'lab' })
                .expect(200);
        } finally {
            delete process.env.NEUBAT_ALLOW_DEFAULT_SECRETS;
        }
    });

    test('POST /api/install firma la configuración cuando hay HMAC_SECRET', async () => {
        process.env.NEUBAT_HMAC_SECRET = 'test-secret';
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base', hostname: 'signed' })
            .expect(200);

        const res = await request(app).get(create.body.config_url).expect(200);
        expect(res.body.signature).toMatch(/^[0-9a-f]{64}$/);
        delete process.env.NEUBAT_HMAC_SECRET;
    });

    test('GET /boot/:token inválido devuelve 404', async () => {
        await request(app).get('/boot/00000000000000000000000000000000').expect(404);
    });

    test('POST /api/install rechaza hostname con metacaracteres', async () => {
        await request(app)
            .post('/api/install')
            .send({ profile: 'base', hostname: 'evil$(touch /tmp/pwned)' })
            .expect(400);
    });

    test('POST /api/install rechaza username inyectable', async () => {
        await request(app)
            .post('/api/install')
            .send({ profile: 'base', username: 'bad;name' })
            .expect(400);
    });

    test('POST /api/install rechaza password con salto de línea', async () => {
        await request(app)
            .post('/api/install')
            .send({ profile: 'base', password: 'linea1\nlinea2' })
            .expect(400);
    });

    test('POST /api/install rechaza timezone con traversal', async () => {
        await request(app)
            .post('/api/install')
            .send({ profile: 'base', timezone: '../../etc/passwd' })
            .expect(400);
    });

    test('POST /api/install rechaza locale inválido', async () => {
        await request(app)
            .post('/api/install')
            .send({ profile: 'base', locale: 'es_ES; rm -rf /' })
            .expect(400);
    });

    test('POST /api/install rechaza paquete inyectable', async () => {
        await request(app)
            .post('/api/install')
            .send({ profile: 'base', packages: ['ok', 'evil;rm -rf /'] })
            .expect(400);
    });

    test('POST /api/install rechaza desktop desconocido', async () => {
        await request(app)
            .post('/api/install')
            .send({ profile: 'base', desktop: 'evil' })
            .expect(400);
    });

    test('GET /boot usa NEUBAT_PUBLIC_URL y no refleja el Host', async () => {
        process.env.NEUBAT_PUBLIC_URL = 'https://portal.example.com';
        try {
            const create = await request(app)
                .post('/api/install')
                .send({ profile: 'base' })
                .expect(200);
            const res = await request(app)
                .get(create.body.boot_url)
                .set('Host', 'evil.example.com')
                .expect(200);
            expect(res.text).toContain('set portal-url https://portal.example.com');
            expect(res.text).not.toContain('evil.example.com');
        } finally {
            delete process.env.NEUBAT_PUBLIC_URL;
        }
    });
});

describe('GET /api/config/:token TLS y caché (T5)', () => {
    const ORIG_NODE_ENV = process.env.NODE_ENV;
    beforeAll(async () => {
        await db.initStorage();
    });

    beforeEach(async () => {
        const store = await db.readDB();
        store.installations = [];
        await db.writeDB(store);
    });

    afterEach(() => {
        delete process.env.NEUBAT_PUBLIC_URL;
        delete process.env.NODE_ENV;
        if (typeof ORIG_NODE_ENV !== 'undefined') process.env.NODE_ENV = ORIG_NODE_ENV;
    });

    test('en HTTP devuelve 400 en production cuando la URL pública es https', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base', hostname: 'tls-test' })
            .expect(200);

        process.env.NODE_ENV = 'production';
        process.env.NEUBAT_PUBLIC_URL = 'https://portal.example.com';

        const res = await request(app).get(create.body.config_url).expect(400);
        expect(res.body.error).toMatch(/TLS/i);
        expect(res.headers['cache-control']).toMatch(/no-store/);
    });

    test('en HTTPS devuelve 200 y Cache-Control no-store (respeta X-Forwarded-Proto con trust proxy)', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base', hostname: 'tls-ok' })
            .expect(200);

        process.env.NODE_ENV = 'production';
        process.env.NEUBAT_PUBLIC_URL = 'https://portal.example.com';
        const prevTrustProxy = app.get('trust proxy');
        app.set('trust proxy', true);
        try {
            const res = await request(app)
                .get(create.body.config_url)
                .set('X-Forwarded-Proto', 'https')
                .expect(200);
            expect(res.body.token).toBe(create.body.token);
            expect(res.headers['cache-control']).toMatch(/no-store/);
            expect(res.headers['cache-control']).toMatch(/private/);
        } finally {
            if (prevTrustProxy === undefined || prevTrustProxy === false) {
                app.set('trust proxy', false);
            } else {
                app.set('trust proxy', prevTrustProxy);
            }
        }
    });

    test('Cache-Control no-store presente en la descarga', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base', hostname: 'cache-test' })
            .expect(200);

        const res = await request(app).get(create.body.config_url).expect(200);
        expect(res.headers['cache-control']).toMatch(/no-store/);
        expect(res.headers['cache-control']).toMatch(/private/);
    });
});
