'use strict';

const app = require('../../server');
const db = require('../../lib/db');
const users = require('../../lib/users');

describe('server start() HMAC fail-closed (T2)', () => {
    const OLD_NODE_ENV = process.env.NODE_ENV;
    const OLD_SECRET = process.env.NEUBAT_HMAC_SECRET;
    const OLD_URL = process.env.NEUBAT_PUBLIC_URL;
    let exitSpy;
    let errorSpy;

    beforeEach(() => {
        exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`process.exit:${code}`);
        });
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(db, 'initStorage').mockResolvedValue(undefined);
        jest.spyOn(users, 'ensureUsersStore').mockResolvedValue(undefined);
        jest.spyOn(app, 'listen').mockImplementation((port, cb) => {
            if (typeof cb === 'function') cb();
            return { close() {} };
        });
    });

    afterEach(() => {
        if (OLD_NODE_ENV === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = OLD_NODE_ENV;
        if (OLD_SECRET === undefined) delete process.env.NEUBAT_HMAC_SECRET;
        else process.env.NEUBAT_HMAC_SECRET = OLD_SECRET;
        if (OLD_URL === undefined) delete process.env.NEUBAT_PUBLIC_URL;
        else process.env.NEUBAT_PUBLIC_URL = OLD_URL;
        jest.restoreAllMocks();
    });

    test('start() falla en production sin NEUBAT_HMAC_SECRET', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.NEUBAT_HMAC_SECRET;
        await expect(app.start()).rejects.toThrow('process.exit:1');
        expect(errorSpy).toHaveBeenCalled();
        expect(String(errorSpy.mock.calls[0][0])).toMatch(/NEUBAT_HMAC_SECRET/);
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test('start() OK en production con NEUBAT_HMAC_SECRET válido', async () => {
        process.env.NODE_ENV = 'production';
        process.env.NEUBAT_HMAC_SECRET = 'a'.repeat(64);
        process.env.NEUBAT_PUBLIC_URL = 'https://portal.example.com';
        await expect(app.start()).resolves.toBeUndefined();
        expect(exitSpy).not.toHaveBeenCalled();
    });

    test('start() OK en development sin NEUBAT_HMAC_SECRET', async () => {
        process.env.NODE_ENV = 'development';
        delete process.env.NEUBAT_HMAC_SECRET;
        await expect(app.start()).resolves.toBeUndefined();
        expect(exitSpy).not.toHaveBeenCalled();
    });
});
