'use strict';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');
const db = require('../lib/db');

const publicIndex = path.join(__dirname, '..', 'public', 'index.html');
const frontendIndex = path.join(__dirname, '..', 'frontend', 'index.html');
let wroteStubIndex = false;

describe('app integration', () => {
    beforeAll(async () => {
        process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
        await db.initStorage();
        // public/index.html es artefacto de Vite (gitignored); el job test no lo genera.
        if (!fs.existsSync(publicIndex)) {
            fs.mkdirSync(path.dirname(publicIndex), { recursive: true });
            fs.copyFileSync(frontendIndex, publicIndex);
            wroteStubIndex = true;
        }
    });

    afterAll(() => {
        if (wroteStubIndex && fs.existsSync(publicIndex)) {
            fs.unlinkSync(publicIndex);
        }
    });

    test('flujo completo: crear → descargar → completar', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base', hostname: 'integration', username: 'neo' })
            .expect(200);

        const token = create.body.token;

        await request(app)
            .get(`/api/config/${token}`)
            .expect(200)
            .then(res => {
                expect(res.body.hostname).toBe('integration');
                expect(res.body.username).toBe('neo');
            });

        await request(app)
            .post('/api/complete')
            .send({ token, status: 'completed', hostname: 'integration-done' })
            .expect(200);

        const status = await request(app)
            .get(`/api/installations/${token}`)
            .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN || 'test-admin-token'}`)
            .expect(200);

        expect(status.body.status).toBe('completed');
        expect(status.body.hostname).toBe('integration-done');
    });

    test('rutas SPA sirven index.html', async () => {
        const res = await request(app).get('/').expect(200);
        expect(res.text).toContain('NEUBAT');
    });

    test('/admin sirve la SPA React', async () => {
        const res = await request(app).get('/admin').expect(200);
        expect(res.text).toContain('<div id="root"></div>');
    });

    test('API 404 devuelve JSON', async () => {
        const res = await request(app).get('/api/noexiste').expect(404);
        expect(res.body).toHaveProperty('error');
    });

    test('CSP permite el tema inline y las descargas, sin upgrade-insecure-requests', async () => {
        const res = await request(app).get('/').expect(200);
        const csp = res.headers['content-security-policy'];
        expect(csp).toContain("script-src 'self' 'sha256-UO5IFt8KSPLWRe2U3rPhbOy7zYM9mVtQtzmfl7YVhT8='");
        expect(csp).toContain("connect-src 'self'");
        expect(csp).toContain('https://github.com');
        expect(csp).toContain('https://geo.mirror.pkgbuild.com');
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).not.toContain('upgrade-insecure-requests');
    });

    test('rate limiting bloquea tras 100 req /api', async () => {
        const reqs = [];
        for (let i = 0; i < 102; i++) {
            reqs.push(request(app).get('/api/health'));
        }
        const responses = await Promise.all(reqs);
        expect(responses.some(r => r.status === 429)).toBe(true);
    });
});
