'use strict';
/**
 * Autenticación de operador (ADMIN_TOKEN).
 */

const crypto = require('crypto');

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdmin(req, res, next) {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) {
        return res.status(503).json({ error: 'Panel de administración no configurado (falta ADMIN_TOKEN)' });
    }
    const header = req.headers.authorization || '';
    const token = header.replace(/^Bearer\s+/i, '');
    if (!safeEqual(token, expected)) {
        res.set('WWW-Authenticate', 'Bearer');
        return res.status(401).json({ error: 'No autorizado' });
    }
    next();
}

module.exports = { requireAdmin };
