'use strict';
/**
 * NEUBAT Portal - panel de administración
 *
 * Protección simple mediante token vía header Authorization: Bearer <ADMIN_TOKEN>.
 * Si ADMIN_TOKEN no está configurado el panel está deshabilitado.
 */

const express = require('express');
const fs = require('fs').promises;
const db = require('../lib/db');
const { requireAdmin } = require('../lib/auth');

const router = express.Router();

// Listado completo de instalaciones
router.get('/installations', requireAdmin, async (req, res) => {
    try {
        const store = await db.readDB();
        res.json(store.installations);
    } catch (err) {
        console.error('Error listando instalaciones:', err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Actualizar estado de una instalación manualmente
router.post('/installations/:token/status', requireAdmin, async (req, res) => {
    try {
        const { token } = req.params;
        const { status, hostname, error } = req.body;

        const store = await db.readDB();
        const install = store.installations.find(i => i.token === token);
        if (!install) return res.status(404).json({ error: 'Instalación no encontrada' });

        if (status) install.status = status;
        if (hostname !== undefined) install.hostname = hostname;
        if (error !== undefined) install.error = error;
        install.updated_at = new Date().toISOString();
        await db.writeDB(store);

        res.json({ success: true, installation: install });
    } catch (err) {
        console.error('Error actualizando instalación:', err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Eliminar una instalación (config + registro)
router.delete('/installations/:token', requireAdmin, async (req, res) => {
    try {
        const { token } = req.params;
        const configPath = db.configPathFor(token);

        const store = await db.readDB();
        const idx = store.installations.findIndex(i => i.token === token);
        if (idx === -1) return res.status(404).json({ error: 'Instalación no encontrada' });

        store.installations.splice(idx, 1);
        await db.writeDB(store);

        if (configPath) {
            // codeql[js/path-injection] configPathFor solo acepta tokens hex de 32 caracteres y devuelve null en otro caso.
            await fs.unlink(configPath).catch(() => {});
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error eliminando instalación:', err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// Regenerar boot_url de una instalación existente (copia config con nuevo token? mejor no)
// Acción útil: forzar re-descarga marcando pending
router.post('/installations/:token/reset', requireAdmin, async (req, res) => {
    try {
        const { token } = req.params;
        const store = await db.readDB();
        const install = store.installations.find(i => i.token === token);
        if (!install) return res.status(404).json({ error: 'Instalación no encontrada' });

        install.status = 'pending';
        install.downloaded_at = undefined;
        install.completed_at = undefined;
        install.updated_at = new Date().toISOString();
        await db.writeDB(store);

        res.json({ success: true, installation: install });
    } catch (err) {
        console.error('Error reseteando instalación:', err);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;
