'use strict';

const fs = require('fs').promises;
const path = require('path');
const request = require('supertest');
const app = require('../../server');
const users = require('../../lib/users');
const { resetAllRateLimiters } = require('../../lib/rate-limit');
const { toArchinstallPair } = require('../../lib/archinstall');

function cookieHeader(res) {
    const raw = res.headers['set-cookie'];
    return Array.isArray(raw) ? raw : [raw];
}

async function register(extra = {}) {
    const email = extra.email || `user${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
    const body = {
        email,
        password: 'secreto123',
        display_name: 'Ada',
        ...extra.body
    };
    const res = await request(app).post('/api/auth/register').send(body).expect(201);
    return { email, user: res.body.user, cookie: cookieHeader(res) };
}

describe('cuenta, sesión y archinstall', () => {
    beforeAll(async () => {
        await users.ensureUsersStore();
    });

    beforeEach(() => {
        resetAllRateLimiters();
    });

    test('registro rechaza correo, contraseña corta y duplicado', async () => {
        await request(app).post('/api/auth/register').send({}).expect(400);
        await request(app)
            .post('/api/auth/register')
            .send({ email: 'sin-arroba', password: 'secreto123' })
            .expect(400);
        await request(app)
            .post('/api/auth/register')
            .send({ email: 'corta@example.com', password: 'corta' })
            .expect(400);

        const email = `dup${Date.now()}@example.com`;
        await request(app)
            .post('/api/auth/register')
            .send({ email, password: 'secreto123' })
            .expect(201);
        await request(app)
            .post('/api/auth/register')
            .send({ email: `  ${email.toUpperCase()}  `, password: 'secreto123' })
            .expect(409);
    });

    test('login incorrecto, cookie rota y /me', async () => {
        await request(app)
            .post('/api/auth/login')
            .send({ email: 'nadie@example.com', password: 'secreto123' })
            .expect(401);

        const { email, cookie } = await register();
        await request(app)
            .post('/api/auth/login')
            .send({ email, password: 'mala-clave-1' })
            .expect(401);

        const me = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
        expect(me.body.user.email).toBe(email);
        await request(app).get('/api/auth/me').expect(401);
        await request(app).get('/api/auth/me').set('Cookie', 'sinigual').expect(401);
    });

    test('cookie Secure en producción y nombre por defecto', async () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: `prod${Date.now()}@example.com`, password: 'secreto123' })
                .expect(201);
            expect(cookieHeader(res).join(';')).toContain('Secure');
            expect(res.body.user.display_name).toMatch(/^prod/);
        } finally {
            if (prev === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = prev;
        }
    });

    test('sesión caducada y sesión huérfana', async () => {
        const expired = await register();
        const sid = decodeURIComponent(expired.cookie[0].split(';')[0].split('=')[1]);
        const sessionsPath = path.join(users.USERS_DIR, 'sessions.json');
        const store = JSON.parse(await fs.readFile(sessionsPath, 'utf8'));
        store.sessions[sid].expires_at = new Date(Date.now() - 1000).toISOString();
        await fs.writeFile(sessionsPath, JSON.stringify(store));
        await request(app).get('/api/auth/me').set('Cookie', expired.cookie).expect(401);

        const orphan = await register();
        await fs.unlink(path.join(users.USERS_DIR, `${orphan.user.id}.json`));
        await request(app).get('/api/auth/me').set('Cookie', orphan.cookie).expect(401);
    });

    test('configs guardadas, perfiles y release', async () => {
        const { cookie } = await register();
        await request(app).get('/api/account/configs').set('Cookie', cookie).expect(200);

        const saved = await request(app)
            .post('/api/account/configs')
            .set('Cookie', cookie)
            .send({
                hostname: 'lab',
                username: 'u',
                password: 'p',
                desktop: 'kde',
                packages: ['git', ''],
                aur_packages: ['yay']
            })
            .expect(201);
        expect(saved.body.config.name).toMatch(/^config-/);
        expect(saved.body.config.archinstall.config.hostname).toBe('lab');
        expect(saved.body.config.archinstall.aur_packages).toEqual(['yay']);

        const list = await request(app).get('/api/account/configs').set('Cookie', cookie).expect(200);
        expect(list.body.configs).toHaveLength(1);

        const profile = await request(app).get('/api/account/profiles/base').expect(200);
        expect(profile.body.hostname).toBeTruthy();
        await request(app).get('/api/account/profiles/no-existe').expect(404);

        const prevTag = process.env.NEUBAT_RELEASE_TAG;
        const prevBase = process.env.NEUBAT_RELEASE_BASE;
        process.env.NEUBAT_RELEASE_TAG = 'v9.9.9';
        process.env.NEUBAT_RELEASE_BASE = 'https://example.test/releases';
        try {
            const rel = await request(app).get('/api/account/releases').expect(200);
            expect(rel.body.neubat.version).toBe('9.9.9');
            expect(rel.body.neubat.iso_url).toContain('https://example.test/releases/');
        } finally {
            if (prevTag === undefined) delete process.env.NEUBAT_RELEASE_TAG;
            else process.env.NEUBAT_RELEASE_TAG = prevTag;
            if (prevBase === undefined) delete process.env.NEUBAT_RELEASE_BASE;
            else process.env.NEUBAT_RELEASE_BASE = prevBase;
        }
    });

    test('absorción, código caducado y confirmación', async () => {
        const { cookie, user } = await register();
        const empty = await request(app).get('/api/account/copies').set('Cookie', cookie).expect(200);
        expect(empty.body.copies).toEqual([]);

        await request(app).post('/api/account/absorb').send({}).expect(400);
        await request(app)
            .post('/api/account/absorb')
            .send({ code: 'inexistente', inventory: { packages: ['vim'] } })
            .expect(401);

        const full = await users.getUserById(user.id);
        full.absorb_codes.push({
            code: 'caducado',
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() - 1000).toISOString(),
            used: false
        });
        await users.saveUser(full);

        const issued = await request(app).post('/api/account/absorb-code').set('Cookie', cookie).expect(200);
        expect(issued.body.expires_in_seconds).toBe(900);
        expect(issued.body.usage).toContain(issued.body.code);

        const absorbed = await request(app)
            .post('/api/account/absorb')
            .send({ code: issued.body.code, inventory: { packages: ['vim'], desktop: 'kde' } })
            .expect(201);

        await request(app)
            .post('/api/account/absorb')
            .send({ code: issued.body.code, inventory: {} })
            .expect(401);
        await request(app)
            .post('/api/account/absorb')
            .send({ code: 'caducado', inventory: { packages: [] } })
            .expect(401);

        const copies = await request(app).get('/api/account/copies').set('Cookie', cookie).expect(200);
        expect(copies.body.copies).toHaveLength(1);

        const confirmed = await request(app)
            .post(`/api/account/copies/${absorbed.body.copy_id}/confirm`)
            .set('Cookie', cookie)
            .expect(200);
        expect(confirmed.body.copy.status).toBe('confirmed');
        await request(app)
            .post('/api/account/copies/no-such/confirm')
            .set('Cookie', cookie)
            .expect(404);
    });

    test('verifyPassword e id de usuario inválido', async () => {
        expect(users.verifyPassword('secreto123', 'aa', 'abcd')).toBe(false);
        expect(await users.getUserById('../etc')).toBeNull();
        expect(await users.findUserByEmail('')).toBeNull();
    });

    test('toArchinstallPair cubre defaults y escritorio desconocido', () => {
        const pair = toArchinstallPair({ desktop: 'DESCONOCIDO', packages: 'git' });
        expect(pair.config.hostname).toBe('neubat');
        expect(pair.config.timezone).toBe('UTC');
        expect(pair.config.disk_config.device).toBe('/dev/sda');
        expect(pair.config.packages).toEqual([]);
        expect(pair.config.profile_config.profile.details).toEqual({});
        expect(pair.creds['!users'][0].username).toBe('neubat');
        expect(pair.creds['!users'][0]['!password']).toBe('');
        expect(pair.creds.root_enc_password).toBe('');
        expect(pair.aur_packages).toEqual([]);
    });

    test('toArchinstallPair no inyecta neubat como contraseña y permite fijar la versión', () => {
        const vacio = toArchinstallPair({ password: '' });
        expect(vacio.creds['!users'][0]['!password']).not.toBe('neubat');
        expect(vacio.creds.root_enc_password).not.toBe('neubat');

        const previo = process.env.NEUBAT_ARCHINSTALL_VERSION;
        process.env.NEUBAT_ARCHINSTALL_VERSION = '3.0.0';
        try {
            expect(toArchinstallPair({}).config.version).toBe('3.0.0');
        } finally {
            if (previo === undefined) {
                delete process.env.NEUBAT_ARCHINSTALL_VERSION;
            } else {
                process.env.NEUBAT_ARCHINSTALL_VERSION = previo;
            }
        }
    });
});
