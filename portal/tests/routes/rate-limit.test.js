'use strict';

const request = require('supertest');
const app = require('../../server');
const { resetAllRateLimiters } = require('../../lib/rate-limit');

describe('rate limit de rutas sensibles', () => {
    beforeEach(() => {
        delete process.env.NEUBAT_DISABLE_RATE_LIMIT;
        resetAllRateLimiters();
    });

    afterAll(() => {
        delete process.env.NEUBAT_DISABLE_RATE_LIMIT;
        resetAllRateLimiters();
    });

    test('POST /api/auth/login responde 429 tras el máximo', async () => {
        let last;
        for (let i = 0; i < 11; i += 1) {
            last = await request(app)
                .post('/api/auth/login')
                .send({ email: 'nadie@example.com', password: 'mala-clave' });
        }

        expect(last.status).toBe(429);
        expect(last.body.error).toContain('Demasiados intentos');
    });

    test('POST /api/auth/register responde 429 tras el máximo', async () => {
        let last;
        for (let i = 0; i < 11; i += 1) {
            last = await request(app)
                .post('/api/auth/register')
                .send({ email: 'sin-arroba', password: 'corta' });
        }

        expect(last.status).toBe(429);
    });

    test('POST /api/account/absorb responde 429 tras el máximo', async () => {
        let last;
        for (let i = 0; i < 21; i += 1) {
            last = await request(app)
                .post('/api/account/absorb')
                .send({ code: 'inexistente', inventory: { packages: [] } });
        }

        expect(last.status).toBe(429);
    });

    test('NEUBAT_DISABLE_RATE_LIMIT=1 desactiva el limitador de login', async () => {
        process.env.NEUBAT_DISABLE_RATE_LIMIT = '1';
        const statuses = [];
        for (let i = 0; i < 15; i += 1) {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'nadie@example.com', password: 'mala-clave' });
            statuses.push(res.status);
        }

        expect(statuses).not.toContain(429);
    });
});
