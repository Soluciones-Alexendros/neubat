'use strict';

const express = require('express');
const request = require('supertest');
const { createRateLimiter, resetAllRateLimiters } = require('../../lib/rate-limit');

function appWith(...limiters) {
    const app = express();
    for (const limiter of limiters) {
        app.use(limiter);
    }
    app.get('/', (req, res) => res.json({ ok: true }));
    return app;
}

describe('lib/rate-limit', () => {
    afterEach(() => {
        delete process.env.NEUBAT_DISABLE_RATE_LIMIT;
        resetAllRateLimiters();
    });

    test('bloquea con 429 al superar el máximo', async () => {
        const limiter = createRateLimiter({ windowMs: 1000, max: 2, message: 'Demasiadas peticiones' });
        const app = appWith(limiter);

        expect((await request(app).get('/')).status).toBe(200);
        expect((await request(app).get('/')).status).toBe(200);

        const blocked = await request(app).get('/');
        expect(blocked.status).toBe(429);
        expect(blocked.body).toEqual({ error: 'Demasiadas peticiones' });
    });

    test('bypass cuando NEUBAT_DISABLE_RATE_LIMIT=1', async () => {
        process.env.NEUBAT_DISABLE_RATE_LIMIT = '1';
        const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
        const app = appWith(limiter);

        for (let i = 0; i < 5; i += 1) {
            expect((await request(app).get('/')).status).toBe(200);
        }
    });

    test('reset() reinicia el contador del limitador', async () => {
        const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
        const app = appWith(limiter);

        expect((await request(app).get('/')).status).toBe(200);
        expect((await request(app).get('/')).status).toBe(429);

        limiter.reset();

        expect((await request(app).get('/')).status).toBe(200);
    });

    test('cada limitador mantiene su propio estado', async () => {
        const first = createRateLimiter({ windowMs: 1000, max: 1 });
        const second = createRateLimiter({ windowMs: 1000, max: 1 });
        const app = appWith(first, second);

        expect((await request(app).get('/')).status).toBe(200);
        expect((await request(app).get('/')).status).toBe(429);
    });
});
