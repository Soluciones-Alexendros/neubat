'use strict';

const request = require('supertest');
const app = require('../server');

describe('middleware de error global', () => {
    let errorSpy;

    beforeAll(() => {
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterAll(() => {
        errorSpy.mockRestore();
    });

    test('responde JSON 500 en /api sin filtrar la traza', async () => {
        const res = await request(app)
            .post('/api/install')
            .set('Content-Type', 'application/json')
            .send('{"profile":');

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Error interno del servidor' });
        expect(JSON.stringify(res.body)).not.toMatch(/at |SyntaxError|node_modules/);
    });

    test('responde texto 500 fuera de /api', async () => {
        const res = await request(app)
            .post('/')
            .set('Content-Type', 'application/json')
            .send('{"profile":');

        expect(res.status).toBe(500);
        expect(res.text).toContain('Error interno del servidor');
    });
});
