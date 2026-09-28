'use strict';

const request = require('supertest');
const app = require('../../server');
const db = require('../../lib/db');

describe('routes/status', () => {
    const adminToken = 'test-admin-token';

    beforeAll(async () => {
        process.env.ADMIN_TOKEN = adminToken;
        await db.initStorage();
    });

    afterAll(() => {
        delete process.env.ADMIN_TOKEN;
    });

    test('GET /api/health responde ok', async () => {
        const res = await request(app).get('/api/health').expect(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.version).toBe('2.1.0');
    });

    test('GET /api/installations sin token → 401', async () => {
        await request(app).get('/api/installations').expect(401);
    });

    test('GET /api/installations con ADMIN_TOKEN lista instalaciones', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base' });

        const res = await request(app)
            .get('/api/installations')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.some(i => i.token === create.body.token)).toBe(true);
    });

    test('GET /api/installations/:token sin auth → 401', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base' });

        await request(app)
            .get(`/api/installations/${create.body.token}`)
            .expect(401);
    });

    test('GET /api/installations/:token con auth devuelve una instalación', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base' });

        const res = await request(app)
            .get(`/api/installations/${create.body.token}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(res.body.token).toBe(create.body.token);
    });

    test('GET /api/installations/:token con auth → 404 si no existe', async () => {
        await request(app)
            .get('/api/installations/00000000000000000000000000000000')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(404);
    });

    test('GET /api/metrics sin auth → 401', async () => {
        await request(app).get('/api/metrics').expect(401);
    });

    test('GET /api/metrics con auth devuelve métricas agregadas', async () => {
        const create = await request(app)
            .post('/api/install')
            .send({ profile: 'base' });

        await request(app)
            .post('/api/complete')
            .send({ token: create.body.token, status: 'completed', duration: 120 })
            .expect(200);

        const res = await request(app)
            .get('/api/metrics')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
        expect(res.body.total).toBeGreaterThanOrEqual(1);
        expect(res.body.completed).toBeGreaterThanOrEqual(1);
        expect(res.body.avg_duration_seconds).toBe(120);
    });
});
