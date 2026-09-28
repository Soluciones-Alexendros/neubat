'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const app = require('../server');

const ROLES = ['programa', 'biblioteca', 'herramienta', 'servicio'];
const ORIGINS = ['extra', 'multilib', 'aur'];

describe('routes/catalog', () => {
    let tmpDir;
    let savedEnv;

    const validItem = {
        name: 'firefox',
        family: 'navegadores',
        role: 'programa',
        functions: ['internet'],
        origin: 'extra',
        summary: 'Navegador web de Mozilla',
        aur: false
    };

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neubat-catalog-test-'));
        savedEnv = process.env.NEUBAT_CATALOG_FILE;
    });

    afterAll(() => {
        if (savedEnv === undefined) {
            delete process.env.NEUBAT_CATALOG_FILE;
        } else {
            process.env.NEUBAT_CATALOG_FILE = savedEnv;
        }
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeCatalog(name, content) {
        const file = path.join(tmpDir, name);
        fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
        return file;
    }

    test('GET /api/catalog sirve el catálogo del repositorio con schema válido', async () => {
        delete process.env.NEUBAT_CATALOG_FILE;
        const res = await request(app).get('/api/catalog').expect(200);

        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(120);
        for (const item of res.body) {
            expect(typeof item.name).toBe('string');
            expect(item.name.length).toBeGreaterThan(0);
            expect(item.family === null || typeof item.family === 'string').toBe(true);
            expect(ROLES).toContain(item.role);
            expect(ORIGINS).toContain(item.origin);
            expect(Array.isArray(item.functions)).toBe(true);
            expect(typeof item.summary).toBe('string');
            expect(typeof item.aur).toBe('boolean');
            if (item.origin === 'aur') expect(item.aur).toBe(true);
        }
        const names = res.body.map(i => i.name);
        for (const required of ['firefox', 'git', 'pipewire', 'code', 'jetbrains-toolbox']) {
            expect(names).toContain(required);
        }
    });

    test('200 con items válidos desde una ruta temporal', async () => {
        process.env.NEUBAT_CATALOG_FILE = writeCatalog('ok.json', [
            validItem,
            { ...validItem, name: 'yay', family: null, origin: 'aur', aur: true }
        ]);

        const res = await request(app).get('/api/catalog').expect(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[1]).toMatchObject({ name: 'yay', family: null, origin: 'aur' });
    });

    test('404 cuando el fichero del catálogo no existe', async () => {
        process.env.NEUBAT_CATALOG_FILE = path.join(tmpDir, 'no-existe.json');

        const res = await request(app).get('/api/catalog').expect(404);
        expect(res.body).toHaveProperty('error');
    });

    test('500 cuando el JSON está mal formado', async () => {
        process.env.NEUBAT_CATALOG_FILE = writeCatalog('roto.json', '{ esto no es json');

        const res = await request(app).get('/api/catalog').expect(500);
        expect(res.body.error).toBe('Catálogo mal formado');
    });

    test('500 cuando el schema no cuadra', async () => {
        process.env.NEUBAT_CATALOG_FILE = writeCatalog('schema.json', [{ name: 'x' }]);

        const res = await request(app).get('/api/catalog').expect(500);
        expect(res.body.error).toBe('Catálogo mal formado');
    });

    test('500 cuando el origen aur no marca aur=true', async () => {
        process.env.NEUBAT_CATALOG_FILE = writeCatalog('aur.json', [
            { ...validItem, name: 'yay', origin: 'aur', aur: false }
        ]);

        await request(app).get('/api/catalog').expect(500);
    });

    test('invalida la caché cuando cambia el mtime', async () => {
        const file = writeCatalog('cache.json', [validItem]);
        process.env.NEUBAT_CATALOG_FILE = file;

        const first = await request(app).get('/api/catalog').expect(200);
        expect(first.body).toHaveLength(1);

        const updated = [{ ...validItem, name: 'chromium', summary: 'Navegador de Google' }];
        fs.writeFileSync(file, JSON.stringify(updated));
        const future = new Date(Date.now() + 2000);
        fs.utimesSync(file, future, future);

        const second = await request(app).get('/api/catalog').expect(200);
        expect(second.body).toHaveLength(1);
        expect(second.body[0].name).toBe('chromium');
    });
});
