'use strict';

const { createRateLimiter, resetAllRateLimiters } = require('../../lib/rate-limit');

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

describe('lib/rate-limit', () => {
    afterEach(() => {
        delete process.env.NEUBAT_DISABLE_RATE_LIMIT;
        resetAllRateLimiters();
    });

    test('bloquea con 429 al superar el máximo', () => {
        const limiter = createRateLimiter({ windowMs: 1000, max: 2, message: 'Demasiadas peticiones' });
        const req = { ip: '10.0.0.1' };
        let nexts = 0;

        const first = mockRes();
        const second = mockRes();
        const third = mockRes();
        limiter(req, first, () => { nexts += 1; });
        limiter(req, second, () => { nexts += 1; });
        limiter(req, third, () => { nexts += 1; });

        expect(nexts).toBe(2);
        expect(first.statusCode).toBe(200);
        expect(third.statusCode).toBe(429);
        expect(third.body).toEqual({ error: 'Demasiadas peticiones' });
    });

    test('bypass cuando NEUBAT_DISABLE_RATE_LIMIT=1', () => {
        process.env.NEUBAT_DISABLE_RATE_LIMIT = '1';
        const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
        const req = { ip: '10.0.0.2' };
        let nexts = 0;

        for (let i = 0; i < 5; i += 1) {
            limiter(req, mockRes(), () => { nexts += 1; });
        }

        expect(nexts).toBe(5);
        expect(limiter.hits.size).toBe(0);
    });

    test('la poda elimina las entradas caducadas', () => {
        const limiter = createRateLimiter({ windowMs: 1000, max: 5 });
        limiter({ ip: '10.0.0.3' }, mockRes(), () => {});
        expect(limiter.hits.size).toBe(1);

        limiter.prune(Date.now() + 2000);
        expect(limiter.hits.size).toBe(0);
    });

    test('el estado acotado no crece indefinidamente', () => {
        const limiter = createRateLimiter({ windowMs: 1000, max: 5 });
        for (let i = 0; i < 50; i += 1) {
            limiter({ ip: `10.0.0.${i}` }, mockRes(), () => {});
        }
        expect(limiter.hits.size).toBe(50);

        limiter.prune(Date.now() + 2000);
        expect(limiter.hits.size).toBe(0);
    });
});
