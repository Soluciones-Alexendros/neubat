#!/usr/bin/env node
'use strict';
/**
 * NEUBAT Portal - Servidor de configuración y despliegue
 * Versión: 2.0.0
 */

const express = require('express');
const path = require('path');
const db = require('./lib/db');
const users = require('./lib/users');
const install = require('./routes/install');
const statusRoutes = require('./routes/status');
const catalogRoutes = require('./routes/catalog');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Rate limiting simple en memoria (100 req / 15 min por IP)
const requestCounts = new Map();
function apiLimiter(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;

    let record = requestCounts.get(ip);
    if (!record || now > record.resetTime) {
        record = { count: 0, resetTime: now + windowMs };
        requestCounts.set(ip, record);
    }
    record.count++;
    if (record.count > 100) {
        return res.status(429).json({ error: 'Demasiadas peticiones' });
    }
    next();
}

// La suite E2E (NEUBAT_DISABLE_RATE_LIMIT=1) supera las 100 req/15 min desde una IP;
// en producción la variable nunca se define.
if (process.env.NEUBAT_DISABLE_RATE_LIMIT !== '1') {
    app.use('/api', apiLimiter);
}
app.use('/api', users.optionalUser);
app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api', install.router);
app.use('/api', statusRoutes);
app.use('/api', catalogRoutes);
app.use('/api/admin', adminRoutes);
app.use('/boot', install.bootRouter);

app.use(express.static(path.join(__dirname, 'public')));

// Live NEUBAT para netboot (si existe out/live o NEUBAT_LIVE_DIR)
const LIVE_DIR = process.env.NEUBAT_LIVE_DIR || path.join(__dirname, '..', 'out', 'live');
app.use('/live', express.static(LIVE_DIR));

// 404 JSON para rutas API no definidas
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Fallback SPA (React app)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
    await db.initStorage();
    await users.ensureUsersStore();
    app.listen(PORT, () => {
        console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║                    NEUBAT Portal v2.0.0                      ║
    ╠══════════════════════════════════════════════════════════════╣
    ║  Servidor iniciado en puerto ${String(PORT).padEnd(32)}║
    ║  Acceso local: http://localhost:${String(PORT).padEnd(27)}║
    ║  API Health:   http://localhost:${String(PORT).padEnd(27)}║
    ╚══════════════════════════════════════════════════════════════╝
        `);
    });
}

if (require.main === module) {
    start().catch(err => {
        console.error('No se pudo inicializar el almacenamiento:', err);
        process.exit(1);
    });
}

module.exports = app;
