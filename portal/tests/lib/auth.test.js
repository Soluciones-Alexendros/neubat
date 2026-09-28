'use strict';

const auth = require('../../lib/auth');

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        set(key, value) {
            this.headers[key] = value;
            return this;
        }
    };
}

describe('lib/auth requireAdmin', () => {
    const token = 'secreto-admin';
    const previous = process.env.ADMIN_TOKEN;

    beforeEach(() => {
        process.env.ADMIN_TOKEN = token;
    });

    afterAll(() => {
        if (previous === undefined) delete process.env.ADMIN_TOKEN;
        else process.env.ADMIN_TOKEN = previous;
    });

    test('sin ADMIN_TOKEN responde 503', () => {
        delete process.env.ADMIN_TOKEN;
        const res = mockRes();
        let called = false;

        auth.requireAdmin({ headers: {} }, res, () => { called = true; });

        expect(called).toBe(false);
        expect(res.statusCode).toBe(503);
    });

    test('token correcto continúa', () => {
        const res = mockRes();
        let called = false;

        auth.requireAdmin({ headers: { authorization: `Bearer ${token}` } }, res, () => { called = true; });

        expect(called).toBe(true);
        expect(res.statusCode).toBe(200);
    });

    test('token incorrecto de la misma longitud responde 401', () => {
        const res = mockRes();

        auth.requireAdmin({ headers: { authorization: 'Bearer xxxxxxxxxxxxx' } }, res, () => {});

        expect(res.statusCode).toBe(401);
        expect(res.headers['WWW-Authenticate']).toBe('Bearer');
    });

    test('token de longitud distinta responde 401 sin lanzar', () => {
        const res = mockRes();

        auth.requireAdmin({ headers: { authorization: 'Bearer corto' } }, res, () => {});

        expect(res.statusCode).toBe(401);
    });

    test('cabecera ausente responde 401', () => {
        const res = mockRes();

        auth.requireAdmin({ headers: {} }, res, () => {});

        expect(res.statusCode).toBe(401);
    });
});
