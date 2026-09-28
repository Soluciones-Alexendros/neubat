'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const db = require('../../lib/db');

describe('lib/db', () => {
    beforeEach(async () => {
        await db.writeDB({ installations: [] });
    });

    test('generateToken produce 32 chars hex', () => {
        const token = db.generateToken();
        expect(token).toMatch(/^[0-9a-f]{32}$/);
    });

    test('generateMachineId produce 8 chars hex', () => {
        const id = db.generateMachineId();
        expect(id).toMatch(/^[0-9a-f]{8}$/);
    });

    test('configPathFor rechaza tokens inválidos', () => {
        expect(db.configPathFor('aabbccdd00112233445566778899aabb')).toBeTruthy();
        expect(db.configPathFor('../etc/passwd')).toBeNull();
        expect(db.configPathFor('short')).toBeNull();
    });

    test('readDB / writeDB persisten correctamente', async () => {
        await db.writeDB({ installations: [{ token: 'a' }] });
        const data = await db.readDB();
        expect(data.installations).toHaveLength(1);
        expect(data.installations[0].token).toBe('a');
    });

    test('loadProfile carga un perfil existente', async () => {
        const profile = await db.loadProfile('base');
        expect(profile).toHaveProperty('hostname');
        expect(profile).toHaveProperty('packages');
    });

    test('loadProfile falla con perfil inexistente', async () => {
        await expect(db.loadProfile('noexiste')).rejects.toThrow();
    });

    test('signConfig devuelve null sin secreto', () => {
        delete process.env.NEUBAT_HMAC_SECRET;
        const sig = db.signConfig({ token: 'a', hostname: 'h' });
        expect(sig).toBeNull();
    });

    test('signConfig produce firma HMAC determinista', () => {
        process.env.NEUBAT_HMAC_SECRET = 'test-secret';
        const config = {
            token: 'tok',
            machine_id: 'mid',
            hostname: 'host',
            username: 'user',
            desktop: 'none',
            password: 'pass',
            disk: '/dev/sda',
            timezone: 'UTC',
            locale: 'en_US.UTF-8',
            keyboard: 'us',
            packages: ['a', 'b'],
            services: ['sshd']
        };
        const sig1 = db.signConfig(config);
        const sig2 = db.signConfig(config);
        expect(sig1).toMatch(/^[0-9a-f]{64}$/);
        expect(sig1).toBe(sig2);
    });

    test('signingPayload incluye encryption y snapshots canónicos', () => {
        const base = {
            token: 'tok',
            machine_id: 'mid',
            hostname: 'host',
            username: 'user',
            desktop: 'none',
            password: 'pass',
            disk: '/dev/sda',
            timezone: 'UTC',
            locale: 'en_US.UTF-8',
            keyboard: 'us',
            packages: ['b', 'a'],
            services: ['sshd']
        };
        const without = db.signingPayload(base);
        expect(without.endsWith('||')).toBe(true);

        const withEnc = db.signingPayload({
            ...base,
            encryption: { method: 'keyfile', enabled: true },
            snapshots: { enabled: true }
        });
        expect(withEnc).toContain('{"enabled":true,"method":"keyfile"}');
        expect(withEnc).toContain('{"enabled":true}');
        expect(withEnc).not.toBe(without);
    });

    test('firma HMAC JS es verificable por el verificador Python del instalador (con anidados y booleanos)', () => {
        const scriptPath = path.join(__dirname, '..', '..', '..', 'scripts', '20-archinstall.sh');
        const match = fsSync.readFileSync(scriptPath, 'utf8')
            .match(/verify_config_signature\(\)\s*\{[\s\S]*?<<'PYEOF'\n([\s\S]*?)\nPYEOF/);
        expect(match).not.toBeNull();
        const verifier = match[1];

        const secret = 'regression-secret';
        process.env.NEUBAT_HMAC_SECRET = secret;

        const config = {
            token: 'a'.repeat(32),
            machine_id: 'deadbeef',
            hostname: 'host',
            username: 'user',
            desktop: 'kde',
            password: 'secret-password',
            disk: '/dev/nvme0n1',
            timezone: 'Europe/Madrid',
            locale: 'es_ES.UTF-8',
            keyboard: 'es',
            packages: ['b', 'a'],
            aur_packages: ['y', 'x'],
            services: ['sshd', 'NetworkManager'],
            encryption: { enabled: true, method: 'keyfile', cipher: 'aes-xts-plain64', key_size: 512 },
            snapshots: { enabled: true, cleanup: { hourly: 5, daily: 7, weekly: 2, monthly: 2 } },
            features: { ssh: true, firewall: true }
        };

        const signed = { ...config, signature: db.signConfig(config) };
        expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);

        const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'neubat-hmac-'));
        const validPath = path.join(dir, 'valid.json');
        const tamperedPath = path.join(dir, 'tampered.json');
        fsSync.writeFileSync(validPath, JSON.stringify(signed));
        fsSync.writeFileSync(tamperedPath, JSON.stringify({
            ...signed,
            snapshots: { enabled: true, cleanup: { hourly: 99, daily: 7, weekly: 2, monthly: 2 } }
        }));

        try {
            expect(() => execFileSync('python3', ['-', validPath, secret], { input: verifier })).not.toThrow();
            expect(() => execFileSync('python3', ['-', tamperedPath, secret], { input: verifier })).toThrow();
        } finally {
            delete process.env.NEUBAT_HMAC_SECRET;
            fsSync.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('la fixture canónica compartida coincide con la firma JS', () => {
        const fixturePath = path.join(__dirname, '..', '..', '..', 'tests', 'fixtures', 'hmac-canonical.json');
        const fixture = JSON.parse(fsSync.readFileSync(fixturePath, 'utf8'));
        const previous = process.env.NEUBAT_HMAC_SECRET;
        process.env.NEUBAT_HMAC_SECRET = fixture.secret;
        try {
            expect(db.signingPayload(fixture.config)).toBe(fixture.expected_payload);
            expect(db.signConfig(fixture.config)).toBe(fixture.expected_signature);
        } finally {
            if (previous === undefined) delete process.env.NEUBAT_HMAC_SECRET;
            else process.env.NEUBAT_HMAC_SECRET = previous;
        }
    });

    test('alterar encryption invalida la firma HMAC', () => {
        process.env.NEUBAT_HMAC_SECRET = 'test-secret';
        const config = {
            token: 'tok',
            machine_id: 'mid',
            hostname: 'host',
            username: 'user',
            desktop: 'none',
            password: 'pass',
            disk: '/dev/sda',
            timezone: 'UTC',
            locale: 'en_US.UTF-8',
            keyboard: 'us',
            packages: ['a'],
            services: [],
            encryption: { enabled: true, method: 'keyfile' },
            snapshots: { enabled: true }
        };
        const sig = db.signConfig(config);
        const tampered = {
            ...config,
            encryption: { enabled: true, method: 'passphrase' }
        };
        expect(db.signConfig(tampered)).not.toBe(sig);
    });
});
