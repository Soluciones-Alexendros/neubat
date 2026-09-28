'use strict';
/**
 * NEUBAT Portal - rutas de estado y seguimiento
 */

const express = require('express');
const db = require('../lib/db');
const { requireAdmin } = require('../lib/auth');

const router = express.Router();

// GET /api/health — health check (público)
router.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// GET /api/installations — últimas 50 (requiere ADMIN_TOKEN)
router.get('/installations', requireAdmin, async (req, res) => {
    try {
        const store = await db.readDB();
        res.json(store.installations.slice(-50).reverse());
    } catch {
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/installations/:token — estado de una instalación (requiere ADMIN_TOKEN)
router.get('/installations/:token', requireAdmin, async (req, res) => {
    try {
        const store = await db.readDB();
        const install = store.installations.find(i => i.token === req.params.token);
        if (!install) return res.status(404).json({ error: 'Instalación no encontrada' });
        res.json(install);
    } catch {
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/metrics — métricas agregadas (requiere ADMIN_TOKEN)
router.get('/metrics', requireAdmin, async (req, res) => {
    try {
        const store = await db.readDB();
        const installs = store.installations || [];
        const total = installs.length;
        const completed = installs.filter(i => i.status === 'completed').length;
        const failed = installs.filter(i => i.status === 'failed').length;
        const pending = installs.filter(i => i.status === 'pending' || i.status === 'downloaded').length;
        const durations = installs
            .filter(i => typeof i.duration === 'number' && i.duration > 0)
            .map(i => i.duration);

        const avgDuration = durations.length
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
            : 0;

        res.json({
            total,
            completed,
            failed,
            pending,
            avg_duration_seconds: avgDuration,
            duration_count: durations.length
        });
    } catch {
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;
