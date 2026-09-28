'use strict';
/**
 * NEUBAT Portal - catálogo de paquetes (portal/catalog/packages.json)
 * GET /api/catalog — público, sin auth.
 * Lee el JSON del disco con caché en memoria; invalida la caché si cambia el mtime.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const ROLES = new Set(['programa', 'biblioteca', 'herramienta', 'servicio']);
const ORIGINS = new Set(['extra', 'multilib', 'aur']);

// Caché en memoria por ruta: path → { mtimeMs, data }
const cache = new Map();

function catalogPath() {
    return process.env.NEUBAT_CATALOG_FILE
        || path.join(__dirname, '..', 'catalog', 'packages.json');
}

function isValidItem(item) {
    return Boolean(item)
        && typeof item.name === 'string' && item.name.length > 0
        && (item.family === null || typeof item.family === 'string')
        && ROLES.has(item.role)
        && ORIGINS.has(item.origin)
        && Array.isArray(item.functions)
        && item.functions.every(f => typeof f === 'string')
        && typeof item.summary === 'string'
        && typeof item.aur === 'boolean'
        && item.aur === (item.origin === 'aur');
}

async function loadCatalog(filePath) {
    const stat = await fs.promises.stat(filePath);
    const hit = cache.get(filePath);
    if (hit && hit.mtimeMs === stat.mtimeMs) {
        return hit.data;
    }
    const parsed = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    if (!Array.isArray(parsed) || !parsed.every(isValidItem)) {
        throw new Error('Catálogo mal formado');
    }
    cache.set(filePath, { mtimeMs: stat.mtimeMs, data: parsed });
    return parsed;
}

// GET /api/catalog — catálogo completo (array de ítems)
router.get('/catalog', async (_req, res) => {
    try {
        const items = await loadCatalog(catalogPath());
        res.json(items);
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            return res.status(404).json({ error: 'Catálogo no disponible' });
        }
        if (err instanceof SyntaxError || (err && err.message === 'Catálogo mal formado')) {
            return res.status(500).json({ error: 'Catálogo mal formado' });
        }
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;
