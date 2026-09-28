'use strict';
/**
 * Perfil de usuario: configs guardadas, recomendaciones, códigos de absorción.
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const users = require('../lib/users');
const db = require('../lib/db');
const { toArchinstallPair } = require('../lib/archinstall');

const router = express.Router();

const RECOMMENDATIONS = [
    {
        id: 'production',
        intent: 'daily',
        title: 'Uso diario',
        description: 'Escritorio KDE y disco cifrado.',
        profile: 'production',
        desktop: 'kde',
        encryption: { enabled: true, method: 'keyfile' },
        snapshots: { enabled: true }
    },
    {
        id: 'developer',
        intent: 'develop',
        title: 'Desarrollo',
        description: 'Escritorio GNOME, sin cifrar el disco.',
        profile: 'developer',
        desktop: 'gnome',
        encryption: { enabled: false, method: 'keyfile' },
        snapshots: { enabled: true }
    },
    {
        id: 'base',
        intent: 'server',
        title: 'Servidor mínimo',
        description: 'Sin escritorio y sin cifrado.',
        profile: 'base',
        desktop: 'none',
        encryption: { enabled: false, method: 'keyfile' },
        snapshots: { enabled: false }
    },
    {
        id: 'hyprland',
        title: 'Hyprland',
        description: 'Compositor Wayland tiling; ajuste sobre el perfil base, no un camino principal.',
        profile: 'base',
        desktop: 'hyprland',
        packages: ['hyprland', 'waybar', 'kitty', 'xdg-desktop-portal-hyprland']
    }
];

router.get('/recommendations', (_req, res) => {
    res.json({ recommendations: RECOMMENDATIONS });
});

router.get('/configs', users.requireUser, async (req, res) => {
    const full = await users.getUserById(req.user.id);
    res.json({ configs: full.saved_configs || [] });
});

router.post('/configs', users.requireUser, async (req, res) => {
    try {
        const full = await users.getUserById(req.user.id);
        const body = req.body || {};
        const id = crypto.randomBytes(8).toString('hex');
        const entry = {
            id,
            name: body.name || `config-${id.slice(0, 6)}`,
            created_at: new Date().toISOString(),
            profile: body.profile || 'base',
            hostname: body.hostname,
            username: body.username,
            desktop: body.desktop,
            packages: body.packages || [],
            aur_packages: body.aur_packages || [],
            locale: body.locale,
            keyboard: body.keyboard,
            timezone: body.timezone,
            encryption: body.encryption,
            snapshots: body.snapshots,
            archinstall: toArchinstallPair(body)
        };
        full.saved_configs = full.saved_configs || [];
        full.saved_configs.push(entry);
        await users.saveUser(full);
        res.status(201).json({ success: true, config: entry });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Error interno' });
    }
});

router.get('/copies', users.requireUser, async (req, res) => {
    const full = await users.getUserById(req.user.id);
    res.json({
        copies: full.system_copies || [],
        note: 'El contenido de documentos personales no se clona en el instalador; solo paquetes y dotfiles allowlist.'
    });
});

router.post('/absorb-code', users.requireUser, async (req, res) => {
    const full = await users.getUserById(req.user.id);
    const code = crypto.randomBytes(16).toString('hex');
    full.absorb_codes = (full.absorb_codes || []).filter((c) => new Date(c.expires_at) > new Date());
    full.absorb_codes.push({
        code,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        used: false
    });
    await users.saveUser(full);
    res.json({
        code,
        expires_in_seconds: 900,
        usage: `neubat-absorb.sh --code ${code} --portal ${req.protocol}://${req.get('host')}`
    });
});

router.post('/absorb', async (req, res) => {
    try {
        const { code, inventory } = req.body || {};
        if (!code || !inventory) {
            return res.status(400).json({ error: 'Faltan code o inventory' });
        }

        const index = JSON.parse(
            await fs.readFile(path.join(users.USERS_DIR, 'index.json'), 'utf8').catch(() => '{"users":[]}')
        );
        let owner = null;
        for (const entry of index.users || []) {
            const u = await users.getUserById(entry.id);
            if (!u) continue;
            const match = (u.absorb_codes || []).find((c) => c.code === code && !c.used && new Date(c.expires_at) > new Date());
            if (match) {
                owner = u;
                match.used = true;
                break;
            }
        }
        if (!owner) {
            return res.status(401).json({ error: 'Código de absorción inválido o caducado' });
        }

        const copy = {
            id: crypto.randomBytes(8).toString('hex'),
            created_at: new Date().toISOString(),
            packages: inventory.packages || [],
            desktop: inventory.desktop || 'none',
            locale: inventory.locale,
            keyboard: inventory.keyboard,
            timezone: inventory.timezone,
            dotfiles: inventory.dotfiles || [],
            status: 'pending_confirmation'
        };
        owner.system_copies = owner.system_copies || [];
        owner.system_copies.push(copy);
        await users.saveUser(owner);
        res.status(201).json({ success: true, copy_id: copy.id, message: 'Copia recibida. Confírmala en /cuenta.' });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Error interno' });
    }
});

router.post('/copies/:id/confirm', users.requireUser, async (req, res) => {
    const full = await users.getUserById(req.user.id);
    const copy = (full.system_copies || []).find((c) => c.id === req.params.id);
    if (!copy) return res.status(404).json({ error: 'Copia no encontrada' });
    copy.status = 'confirmed';
    copy.confirmed_at = new Date().toISOString();
    await users.saveUser(full);
    res.json({ success: true, copy });
});

router.get('/releases', async (_req, res) => {
    const tag = process.env.NEUBAT_RELEASE_TAG || 'v2.0.0';
    const version = tag.replace(/^v/, '');
    const base = process.env.NEUBAT_RELEASE_BASE
        || `https://github.com/Soluciones-Alexendros/neubat/releases/download/${tag}`;
    res.json({
        neubat: {
            version,
            iso_url: `${base}/neubat-${version}-x86_64.iso`,
            sha256_url: `${base}/neubat-${version}-x86_64.iso.sha256`
        },
        arch: {
            iso_url: 'https://geo.mirror.pkgbuild.com/iso/latest/archlinux-x86_64.iso',
            sha256_url: 'https://geo.mirror.pkgbuild.com/iso/latest/sha256sums.txt'
        }
    });
});

router.get('/profiles/:name', async (req, res) => {
    try {
        const profile = await db.loadProfile(req.params.name);
        res.json(profile);
    } catch {
        res.status(404).json({ error: 'Perfil no encontrado' });
    }
});

module.exports = router;
