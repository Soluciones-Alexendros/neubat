#!/usr/bin/env node
'use strict';
/**
 * NEUBAT Portal - Servidor de configuración y despliegue
 * Versión: 2.1.0
 */

const express = require('express');
const helmet = require('helmet');
const path = require('path');
const db = require('./lib/db');
const users = require('./lib/users');
const { createRateLimiter } = require('./lib/rate-limit');
const install = require('./routes/install');
const statusRoutes = require('./routes/status');
const catalogRoutes = require('./routes/catalog');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

// Detrás de un proxy inverso, habilita la confianza en X-Forwarded-For para que
// req.ip sea la IP real del cliente (afecta al rate limiting). Por defecto OFF:
// confiar en la cabecera sin proxy delante permitiría falsear la IP.
// Valores: NEUBAT_TRUST_PROXY=1|true (todos), o un número de saltos (p. ej. 1),
// o una lista de IPs/subredes separadas por comas.
const TRUST_PROXY = process.env.NEUBAT_TRUST_PROXY;
if (TRUST_PROXY) {
    app.set('trust proxy', TRUST_PROXY === '1' || TRUST_PROXY === 'true' ? true : TRUST_PROXY);
}

// connect-src: la página /descargar verifica la ISO con fetch() contra las URLs
// de /api/account/releases (GitHub Releases y el mirror de Arch), que son de otro
// origen. Sin declararlas, CSP las bloquea. NEUBAT_RELEASE_BASE y
// NEUBAT_CSP_CONNECT_SRC permiten añadir orígenes adicionales.
function connectSources() {
    const sources = new Set(["'self'", 'https://github.com', 'https://objects.githubusercontent.com', 'https://release-assets.githubusercontent.com', 'https://geo.mirror.pkgbuild.com']);
    const releaseBase = process.env.NEUBAT_RELEASE_BASE;
    if (releaseBase) {
        try {
            sources.add(new URL(releaseBase).origin);
        } catch {
            // Base de release inválida: se ignora para no romper el arranque.
        }
    }
    for (const extra of (process.env.NEUBAT_CSP_CONNECT_SRC || '').split(/\s+/)) {
        if (extra) sources.add(extra);
    }
    return [...sources];
}

// CSP con los defaults de helmet. Se permite el script inline de tema de
// index.html mediante su hash y se desactiva upgrade-insecure-requests para no
// romper el portal local servido por HTTP (:3000) en el sistema instalado.
app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                scriptSrc: ["'self'", "'sha256-UO5IFt8KSPLWRe2U3rPhbOy7zYM9mVtQtzmfl7YVhT8='"],
                connectSrc: connectSources(),
                frameAncestors: ["'none'"],
                upgradeInsecureRequests: null
            }
        }
    })
);

app.use(express.json({ limit: '2mb' }));

// Rate limiting simple en memoria (100 req / 15 min por IP)
const apiLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Demasiadas peticiones'
});

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
    // codeql[js/missing-rate-limiting] Esta ruta siempre sirve el mismo public/index.html; no hay acceso al FS sobre entrada del usuario.
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejador de errores global: evita filtrar trazas al cliente.
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    console.error('Error no controlado:', err && err.stack ? err.stack : err);
    if (req.originalUrl.startsWith('/api')) {
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
    res.status(500).type('text/plain').send('Error interno del servidor');
});

async function start() {
    await db.initStorage();
    await users.ensureUsersStore();
    app.listen(PORT, () => {
        console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║                    NEUBAT Portal v2.1.0                      ║
    ╠══════════════════════════════════════════════════════════════╣
    ║  Servidor iniciado en puerto ${String(PORT).padEnd(32)}║
    ║  Acceso local: http://localhost:${String(PORT).padEnd(29)}║
    ║  API Health:   http://localhost:${String(PORT + '/api/health').padEnd(29)}║
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
