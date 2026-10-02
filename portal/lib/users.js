'use strict';
/**
 * Usuarios, sesiones y perfiles guardados (JSON en portal/data/users/).
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { PORTAL_ROOT } = require('./db');

const USERS_DIR = process.env.NEUBAT_USERS_DIR || path.join(PORTAL_ROOT, 'data', 'users');
const USERS_INDEX = path.join(USERS_DIR, 'index.json');
const SESSIONS_PATH = path.join(USERS_DIR, 'sessions.json');
const COOKIE_NAME = 'neubat_session';

async function ensureUsersStore() {
    await fs.mkdir(USERS_DIR, { recursive: true });
    try {
        await fs.access(USERS_INDEX);
    } catch {
        await writeJson(USERS_INDEX, { users: [] });
    }
    try {
        await fs.access(SESSIONS_PATH);
    } catch {
        await writeJson(SESSIONS_PATH, { sessions: {} });
    }
    await readSessions();
}

async function readJson(file, fallback) {
    try {
        return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
        return fallback;
    }
}

async function writeJson(file, data) {
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    fsSync.renameSync(tmp, file);
}

function purgeExpiredSessions(store, now = Date.now()) {
    const sessions = (store && store.sessions) || {};
    let removed = 0;
    for (const sid of Object.keys(sessions)) {
        const session = sessions[sid];
        if (!session || !session.expires_at || new Date(session.expires_at).getTime() <= now) {
            delete sessions[sid];
            removed += 1;
        }
    }
    return removed;
}

async function readSessions() {
    let store = await readJson(SESSIONS_PATH, { sessions: {} });
    if (!store || typeof store !== 'object') {
        store = { sessions: {} };
    }
    if (!store.sessions || typeof store.sessions !== 'object') {
        store.sessions = {};
    }
    if (purgeExpiredSessions(store) > 0) {
        await writeJson(SESSIONS_PATH, store);
    }
    return store;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
}

function verifyPassword(password, salt, hash) {
    try {
        const check = crypto.scryptSync(password, salt, 64).toString('hex');
        if (check.length !== hash.length) return false;
        return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
    } catch {
        return false;
    }
}

function userPath(userId) {
    if (!/^[0-9a-f]{16}$/.test(userId)) return null;
    return path.join(USERS_DIR, `${userId}.json`);
}

async function createUser(email, password, displayName) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
        throw Object.assign(new Error('Correo no válido'), { status: 400 });
    }
    if (!password || String(password).length < 8) {
        throw Object.assign(new Error('La contraseña debe tener al menos 8 caracteres'), { status: 400 });
    }

    const index = await readJson(USERS_INDEX, { users: [] });
    if (index.users.some((u) => u.email === normalized)) {
        throw Object.assign(new Error('Ya existe una cuenta con ese correo'), { status: 409 });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const { salt, hash } = hashPassword(password);
    const user = {
        id,
        email: normalized,
        display_name: displayName || normalized.split('@')[0],
        password_salt: salt,
        password_hash: hash,
        created_at: new Date().toISOString(),
        saved_configs: [],
        system_copies: [],
        absorb_codes: []
    };

    await writeJson(userPath(id), user);
    index.users.push({ id, email: normalized });
    await writeJson(USERS_INDEX, index);

    const { password_salt, password_hash, absorb_codes, ...safe } = user;
    return safe;
}

async function findUserByEmail(email) {
    const index = await readJson(USERS_INDEX, { users: [] });
    const entry = index.users.find((u) => u.email === String(email || '').trim().toLowerCase());
    if (!entry) return null;
    return readJson(userPath(entry.id), null);
}

async function getUserById(id) {
    const p = userPath(id);
    if (!p) return null;
    return readJson(p, null);
}

async function saveUser(user) {
    await writeJson(userPath(user.id), user);
}

async function createSession(userId) {
    const sid = crypto.randomBytes(24).toString('hex');
    const store = await readSessions();
    store.sessions[sid] = {
        user_id: userId,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    await writeJson(SESSIONS_PATH, store);
    return sid;
}

async function destroySession(sid) {
    if (!sid) return;
    const store = await readSessions();
    delete store.sessions[sid];
    await writeJson(SESSIONS_PATH, store);
}

async function resolveSession(sid) {
    if (!sid) return null;
    const store = await readSessions();
    const session = store.sessions[sid];
    if (!session) return null;
    const user = await getUserById(session.user_id);
    if (!user) return null;
    const { password_salt, password_hash, absorb_codes, ...safe } = user;
    return { session, user: safe, fullUser: user };
}

function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        out[k] = decodeURIComponent(v);
    }
    return out;
}

function setSessionCookie(res, sid) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${secure}`
    );
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function optionalUser(req, res, next) {
    try {
        const cookies = parseCookies(req.headers.cookie);
        const resolved = await resolveSession(cookies[COOKIE_NAME]);
        req.user = resolved ? resolved.user : null;
        req.fullUser = resolved ? resolved.fullUser : null;
        req.sessionId = resolved ? cookies[COOKIE_NAME] : null;
        next();
    } catch (err) {
        next(err);
    }
}

async function requireUser(req, res, next) {
    await optionalUser(req, res, () => {
        if (!req.user) {
            return res.status(401).json({ error: 'Debes iniciar sesión' });
        }
        next();
    });
}

module.exports = {
    COOKIE_NAME,
    USERS_DIR,
    ensureUsersStore,
    createUser,
    findUserByEmail,
    getUserById,
    saveUser,
    createSession,
    destroySession,
    resolveSession,
    purgeExpiredSessions,
    verifyPassword,
    parseCookies,
    setSessionCookie,
    clearSessionCookie,
    optionalUser,
    requireUser
};
