'use strict';

const request = require('supertest');

describe('server.js error handlers', () => {
    test('error handler devuelve JSON 500 en rutas API', async () => {
        // Cargar app con rate limiting deshabilitado
        process.env.NEUBAT_DISABLE_RATE_LIMIT = '1';
        const app = require('../server');
        
        // El error handler es el último middleware (4 args)
        const errorHandler = app._router.stack.find(l => l.handle && l.handle.length === 4).handle;
        
        if (errorHandler) {
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
                headersSent: false
            };
            const req = { originalUrl: '/api/test' };
            const next = jest.fn();
            
            errorHandler(new Error('test error'), req, res, next);
            
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Error interno del servidor' });
        }
    });

    test('error handler devuelve texto 500 en rutas no-API', async () => {
        process.env.NEUBAT_DISABLE_RATE_LIMIT = '1';
        const app = require('../server');
        
        const errorHandler = app._router.stack.find(l => l.handle && l.handle.length === 4).handle;
        
        if (errorHandler) {
            const res = {
                status: jest.fn().mockReturnThis(),
                type: jest.fn().mockReturnThis(),
                send: jest.fn(),
                headersSent: false
            };
            const req = { originalUrl: '/test' };
            const next = jest.fn();
            
            errorHandler(new Error('test error'), req, res, next);
            
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.type).toHaveBeenCalledWith('text/plain');
            expect(res.send).toHaveBeenCalledWith('Error interno del servidor');
        }
    });

    test('res.headersSent path llama next(err) sin crash', async () => {
        process.env.NEUBAT_DISABLE_RATE_LIMIT = '1';
        const app = require('../server');
        
        const errorHandler = app._router.stack.find(l => l.handle && l.handle.length === 4).handle;
        
        if (errorHandler) {
            const res = { headersSent: true, end: jest.fn() };
            const req = { originalUrl: '/api/test' };
            const next = jest.fn();
            
            errorHandler(new Error('test'), req, res, next);
            expect(next).toHaveBeenCalled();
        }
    });
});