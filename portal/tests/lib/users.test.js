'use strict';

const fs = require('fs').promises;
const path = require('path');
const users = require('../../lib/users');

const SESSIONS_PATH = path.join(users.USERS_DIR, 'sessions.json');

async function readSessionsFile() {
    return JSON.parse(await fs.readFile(SESSIONS_PATH, 'utf8'));
}

describe('lib/users sesiones', () => {
    beforeAll(async () => {
        await users.ensureUsersStore();
    });

    beforeEach(async () => {
        await fs.writeFile(SESSIONS_PATH, JSON.stringify({ sessions: {} }));
    });

    test('createSession y destroySession mantienen el store válido y sin temporales', async () => {
        const sid = await users.createSession('a'.repeat(16));
        const store = await readSessionsFile();
        expect(store.sessions[sid]).toBeTruthy();

        await users.destroySession(sid);
        const after = await readSessionsFile();
        expect(after.sessions[sid]).toBeUndefined();

        const leftovers = (await fs.readdir(users.USERS_DIR)).filter((name) => name.endsWith('.tmp'));
        expect(leftovers).toEqual([]);
    });

    test('purga las sesiones caducadas al leer el store', async () => {
        await fs.writeFile(SESSIONS_PATH, JSON.stringify({
            sessions: {
                vieja: { user_id: 'a'.repeat(16), expires_at: new Date(Date.now() - 1000).toISOString() },
                viva: { user_id: 'b'.repeat(16), expires_at: new Date(Date.now() + 60000).toISOString() }
            }
        }));

        expect(await users.resolveSession('vieja')).toBeNull();
        const store = await readSessionsFile();
        expect(store.sessions.vieja).toBeUndefined();
        expect(store.sessions.viva).toBeTruthy();
    });

    test('purgeExpiredSessions elimina solo las caducadas o inválidas', () => {
        const store = {
            sessions: {
                a: { expires_at: new Date(Date.now() - 1).toISOString() },
                b: { expires_at: new Date(Date.now() + 100000).toISOString() },
                c: null
            }
        };

        expect(users.purgeExpiredSessions(store)).toBe(2);
        expect(Object.keys(store.sessions)).toEqual(['b']);
    });

    test('escrituras concurrentes no corrompen el JSON', async () => {
        const ids = await Promise.all(
            Array.from({ length: 20 }, () => users.createSession('c'.repeat(16)))
        );
        expect(ids).toHaveLength(20);

        const store = await readSessionsFile();
        expect(typeof store.sessions).toBe('object');
        expect(Object.keys(store.sessions).length).toBeGreaterThanOrEqual(1);
    });
});
