'use strict';
/**
 * Auth de usuario final (registro / login / sesión).
 */

const express = require('express');
const users = require('../lib/users');
const { createRateLimiter } = require('../lib/rate-limit');

const router = express.Router();

const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Demasiados intentos. Inténtalo de nuevo más tarde.'
});

router.post('/register', authLimiter, async (req, res) => {
    try {
        const { email, password, display_name: displayName } = req.body || {};
        const user = await users.createUser(email, password, displayName);
        const sid = await users.createSession(user.id);
        users.setSessionCookie(res, sid);
        res.status(201).json({ success: true, user });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Error interno' });
    }
});

router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const full = await users.findUserByEmail(email);
        if (!full || !users.verifyPassword(password, full.password_salt, full.password_hash)) {
            return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
        }
        const sid = await users.createSession(full.id);
        users.setSessionCookie(res, sid);
        const { password_salt, password_hash, absorb_codes, ...safe } = full;
        res.json({ success: true, user: safe });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Error interno' });
    }
});

router.post('/logout', users.optionalUser, async (req, res) => {
    await users.destroySession(req.sessionId);
    users.clearSessionCookie(res);
    res.json({ success: true });
});

router.get('/me', users.optionalUser, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Sin sesión' });
    res.json({ user: req.user });
});

module.exports = router;
