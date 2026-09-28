'use strict';
/**
 * NEUBAT Portal - rutas de creación y entrega de configuraciones de instalación
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const db = require('../lib/db');

const router = express.Router();
const bootRouter = express.Router();

const PUBLIC_EXAMPLE_SECRET = 'neubat';

function usesPublicLuksSecret(config) {
    if (process.env.NEUBAT_ALLOW_DEFAULT_SECRETS === '1') return false;
    const enc = config.encryption;
    if (!enc || enc.enabled !== true) return false;
    return config.password === PUBLIC_EXAMPLE_SECRET || enc.passphrase === PUBLIC_EXAMPLE_SECRET;
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

        const config = {
            ...baseProfile,
            token,
            machine_id: machineId,
            hostname: hostname || `${baseProfile.hostname}-${machineId}`,
            username: username || baseProfile.username,
            password: password || baseProfile.password,
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
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));

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

// GET /api/config/:token — configuración consumida por el instalador
router.get('/config/:token', async (req, res) => {
    try {
        const configPath = db.configPathFor(req.params.token);
        if (!configPath) return res.status(400).json({ error: 'Token inválido' });

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

// GET /boot/:token — script iPXE personalizado para arranque por red
bootRouter.get('/:token', async (req, res) => {
    const configPath = db.configPathFor(req.params.token);
    let profile = 'production';
    try {
        if (!configPath) throw new Error('token inválido');
        await fs.access(configPath);
        // Se parsea para validar el JSON (un config corrupto debe dar 404); el perfil se resuelve desde las instalaciones
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
    const portalPublic = process.env.NEUBAT_PUBLIC_URL
        || `${req.protocol}://${req.get('host')}`;
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
    res.type('text/plain').send(script);
});

module.exports = { router, bootRouter };
