'use strict';
/**
 * NEUBAT Portal - rutas de creación y entrega de configuraciones de instalación
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const db = require('../lib/db');
const { createRateLimiter } = require('../lib/rate-limit');

const router = express.Router();
const bootRouter = express.Router();

const PUBLIC_EXAMPLE_SECRET = 'neubat';

function usesPublicLuksSecret(config) {
    if (process.env.NEUBAT_ALLOW_DEFAULT_SECRETS === '1') return false;
    const enc = config.encryption;
    if (!enc || enc.enabled !== true) return false;
    return config.password === PUBLIC_EXAMPLE_SECRET || enc.passphrase === PUBLIC_EXAMPLE_SECRET;
}

const HOSTNAME_RE = /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const USERNAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const LOCALE_RE = /^[a-zA-Z]{2,3}(_[A-Za-z]{2,4})?\.(UTF-8|utf8)$/;
const KEYBOARD_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const TIMEZONE_RE = /^[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)*$/;
const PACKAGE_RE = /^[a-zA-Z0-9@._+-]{1,64}$/;
const ALLOWED_DESKTOPS = new Set(['none', 'minimal', 'kde', 'plasma', 'gnome', 'xfce', 'hyprland', 'sway', 'i3', 'niri']);

function isControlFree(value) {
    if (typeof value !== 'string') return false;
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code <= 31 || code === 127) return false;
    }
    return true;
}

function validateConfigValues(config) {
    const invalid = [];
    if (!isControlFree(config.hostname) || !HOSTNAME_RE.test(config.hostname)) invalid.push('hostname');
    if (typeof config.username !== 'string' || !USERNAME_RE.test(config.username)) invalid.push('username');
    if (!isControlFree(config.password)) invalid.push('password');
    if (typeof config.locale !== 'string' || !LOCALE_RE.test(config.locale)) invalid.push('locale');
    if (typeof config.keyboard !== 'string' || !KEYBOARD_RE.test(config.keyboard)) invalid.push('keyboard');
    if (typeof config.timezone !== 'string' || !TIMEZONE_RE.test(config.timezone)) invalid.push('timezone');
    if (typeof config.desktop !== 'string' || !ALLOWED_DESKTOPS.has(config.desktop)) invalid.push('desktop');
    for (const field of ['packages', 'aur_packages']) {
        const list = config[field];
        if (!Array.isArray(list) || list.some((p) => typeof p !== 'string' || !PACKAGE_RE.test(p))) {
            invalid.push(field);
        }
    }
    return invalid;
}

// URL pública del portal reflejada en el script iPXE. Se prioriza
// NEUBAT_PUBLIC_URL y, en su defecto, se valida la cabecera Host para no
// inyectar valores arbitrarios en el parámetro kernel neubat_portal_url.
function resolvePortalPublic(req) {
    if (process.env.NEUBAT_PUBLIC_URL) {
        return process.env.NEUBAT_PUBLIC_URL.replace(/\/+$/, '');
    }
    const host = (req.get('host') || '').replace(/:\d+$/, '');
    if (!HOSTNAME_RE.test(host)) {
        return `http://localhost:${process.env.PORT || 3000}`;
    }
    return `${req.protocol}://${req.get('host')}`;
}

// Mirror base para el netboot iPXE (configurable para mirrors/cachés locales;
// útil cuando el firmware iPXE no tiene HTTPS compilado)
const BOOT_BASE_URL = process.env.NEUBAT_MIRROR_BASE || 'https://geo.mirror.pkgbuild.com/iso/latest';

// POST /api/install — crear nueva instalación
router.post('/install', async (req, res) => {
    try {
        const {
            profile = 'production',
            hostname,
            username,
            password,
            desktop,
            packages = [],
            aur_packages = [],
            encryption,
            snapshots,
            locale,
            keyboard,
            timezone
        } = req.body;

        const token = db.generateToken();
        const machineId = db.generateMachineId();

        let baseProfile;
        try {
            baseProfile = await db.loadProfile(profile);
        } catch {
            return res.status(400).json({ error: `Perfil desconocido: ${profile}` });
        }

        const { toArchinstallPair } = require('../lib/archinstall');

        // Los perfiles base no contienen contraseñas; el portal genera una aleatoria al crear la instalación.
        const effectivePassword = password || baseProfile.password || crypto.randomBytes(16).toString('hex');

        const config = {
            ...baseProfile,
            token,
            machine_id: machineId,
            hostname: hostname || `${baseProfile.hostname}-${machineId}`,
            username: username || baseProfile.username,
            password: effectivePassword,
            desktop: desktop || baseProfile.desktop,
            packages: [...new Set([...(baseProfile.packages || []), ...packages])],
            aur_packages: [...new Set([...(baseProfile.aur_packages || []), ...aur_packages])],
            locale: locale || baseProfile.locale,
            keyboard: keyboard || baseProfile.keyboard,
            timezone: timezone || baseProfile.timezone,
            created_at: new Date().toISOString(),
            status: 'pending'
        };

        if (encryption && typeof encryption === 'object') {
            const method = encryption.method === 'interactive' ? 'passphrase' : encryption.method;
            config.encryption = {
                ...(baseProfile.encryption || {}),
                ...encryption,
                ...(method ? { method } : {})
            };
        }

        if (snapshots && typeof snapshots === 'object') {
            config.snapshots = {
                ...(baseProfile.snapshots || {}),
                ...snapshots
            };
        }

        const invalid = validateConfigValues(config);
        if (invalid.length > 0) {
            return res.status(400).json({
                error: `Valores de configuración inválidos: ${invalid.join(', ')}`
            });
        }

        config.archinstall = toArchinstallPair(config);

        if (usesPublicLuksSecret(config)) {
            return res.status(400).json({
                error: 'Cifrado activo con la contraseña o la passphrase de ejemplo "neubat". Elige otra. En un laboratorio exporta NEUBAT_ALLOW_DEFAULT_SECRETS=1.'
            });
        }

        // Firma HMAC de la configuración (solo si el portal tiene secreto)
        const signature = db.signConfig(config);
        if (signature) {
            config.signature = signature;
        }

        const configPath = db.configPathFor(token);
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
        await fs.chmod(configPath, 0o600).catch(() => {});

        const store = await db.readDB();
        store.installations.push({
            token,
            machine_id: machineId,
            profile,
            status: 'pending',
            created_at: config.created_at,
            user_id: req.user ? req.user.id : null
        });
        await db.writeDB(store);

        res.json({
            success: true,
            token,
            machine_id: machineId,
            config_url: `/api/config/${token}`,
            boot_url: `/boot/${token}`,
            message: 'Configuración creada. Use boot_url para iniciar la instalación por red.'
        });
    } catch (error) {
        console.error('Error creando instalación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// GET /api/config/:token — configuración consumida por el instalador.
// El token es un bearer de un solo uso con TTL: quien lo posee puede
// descargar la configuración (incluye secretos que el instalador necesita).
// En producción se exige TLS y la respuesta nunca debe cachearse.
router.get('/config/:token', async (req, res) => {
    res.set('Cache-Control', 'no-store, private');
    const publicUrl = process.env.NEUBAT_PUBLIC_URL || '';
    const requiresTls = process.env.NODE_ENV === 'production' && publicUrl.startsWith('https://');
    // req.secure es true con TLS directo o con X-Forwarded-Proto: https
    // cuando trust proxy está habilitado (ver NEUBAT_TRUST_PROXY en server.js).
    if (requiresTls && !req.secure) {
        return res.status(400).json({ error: 'TLS requerido para descargar la configuración en producción' });
    }
    try {
        const configPath = db.configPathFor(req.params.token);
        if (!configPath) return res.status(400).json({ error: 'Token inválido' });

        // codeql[js/path-injection] configPathFor solo acepta tokens hex de 32 caracteres y devuelve null en otro caso.
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

        const store = await db.readDB();
        const install = store.installations.find(i => i.token === req.params.token);
        if (install && install.status === 'pending') {
            install.status = 'downloaded';
            install.downloaded_at = new Date().toISOString();
            await db.writeDB(store);
        }

        res.json(config);
    } catch {
        res.status(404).json({ error: 'Configuración no encontrada' });
    }
});

// POST /api/complete — el instalador notifica el resultado
router.post('/complete', async (req, res) => {
    try {
        const { token, status, hostname, duration, error } = req.body;

        if (status && !['completed', 'failed'].includes(status)) {
            return res.status(400).json({
                error: `Estado inválido: ${status}. Valores permitidos: completed, failed`
            });
        }

        const store = await db.readDB();
        const install = store.installations.find(i => i.token === token);
        if (!install) return res.status(404).json({ error: 'Instalación no encontrada' });

        install.status = status || 'completed';
        install.completed_at = new Date().toISOString();
        if (hostname) install.hostname = hostname;
        if (typeof duration === 'number') install.duration = duration;
        if (error) install.error = error;

        await db.writeDB(store);
        res.json({ success: true });
    } catch (err) {
        console.error('Error actualizando estado:', err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /boot/:token — script iPXE personalizado para arranque por red.
// El endpoint lee del FS por token; se limita por IP para mitigar abuso.
const bootLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Demasiadas peticiones'
});

bootRouter.get('/:token', bootLimiter, async (req, res) => {
    const configPath = db.configPathFor(req.params.token);
    let profile = 'production';
    try {
        if (!configPath) throw new Error('token inválido');
        // codeql[js/path-injection] configPathFor solo acepta tokens hex de 32 caracteres y devuelve null en otro caso.
        await fs.access(configPath);
        // Se parsea para validar el JSON (un config corrupto debe dar 404); el perfil se resuelve desde las instalaciones
        // codeql[js/path-injection] configPathFor solo acepta tokens hex de 32 caracteres y devuelve null en otro caso.
        JSON.parse(await fs.readFile(configPath, 'utf8'));
    } catch {
        return res.status(404).type('text/plain').send('#!ipxe\necho Configuracion no encontrada\nshell\n');
    }

    try {
        const store = await db.readDB();
        const install = store.installations.find((i) => i.token === req.params.token);
        if (install && install.profile) profile = install.profile;
    } catch {
        /* ignore */
    }

    // Live NEUBAT (con hook) si NEUBAT_LIVE_BASE está definido; si no, mirror Arch.
    const portalPublic = resolvePortalPublic(req);
    const liveBase = process.env.NEUBAT_LIVE_BASE || `${portalPublic}/live`;
    const useNeubatLive = Boolean(process.env.NEUBAT_LIVE_BASE) || process.env.NEUBAT_USE_LIVE === '1';
    const baseUrl = useNeubatLive ? liveBase : BOOT_BASE_URL;
    const archSrv = useNeubatLive ? `${liveBase}/` : `${BOOT_BASE_URL}/arch/`;

    const script = `#!ipxe
dhcp
set base-url ${baseUrl}
set portal-url ${portalPublic}
kernel \${base-url}${useNeubatLive ? '/boot/x86_64/vmlinuz-linux' : '/arch/boot/x86_64/vmlinuz-linux'} initrd=initramfs-linux.img archiso_http_srv=${archSrv} ip=dhcp net.ifnames=0 console=ttyS0 neubat_token=${req.params.token} neubat_profile=${profile} neubat_portal_url=\${portal-url}
initrd \${base-url}${useNeubatLive ? '/boot/x86_64/initramfs-linux.img' : '/arch/boot/x86_64/initramfs-linux.img'}
boot
`;
    // codeql[js/reflected-xss] El token está validado como hex por configPathFor, el perfil procede del registro almacenado y la respuesta es text/plain.
    res.type('text/plain').send(script);
});

module.exports = { router, bootRouter };
