'use strict';
/**
 * Traduce un perfil NEUBAT a los JSON que consume archinstall (--config / --creds).
 */

const DESKTOP_MAP = {
    none: null,
    kde: 'plasma',
    plasma: 'plasma',
    gnome: 'gnome',
    xfce: 'xfce',
    hyprland: 'hyprland',
    sway: 'sway',
    i3: 'i3',
    niri: 'niri'
};

function toArchinstallPair(profile) {
    const desktopKey = String(profile.desktop || 'none').toLowerCase();
    const profileName = DESKTOP_MAP[desktopKey];

    const config = {
        version: '2.8.0',
        'archinstall-language': 'Spanish',
        hostname: profile.hostname || 'neubat',
        timezone: profile.timezone || 'Europe/Madrid',
        locale_config: {
            kb_layout: profile.keyboard || 'es',
            sys_lang: (profile.locale || 'es_ES.UTF-8').split('.')[0].replace('_', '-'),
            sys_enc: 'UTF-8'
        },
        disk_config: {
            config_type: 'manual_partitioning',
            device: profile.disk || '/dev/sda'
        },
        network_config: { type: 'nm' },
        packages: Array.isArray(profile.packages) ? profile.packages.filter(Boolean) : [],
        profile_config: profileName
            ? { profile: { details: { [profileName]: {} } } }
            : { profile: { details: {} } },
        bootloader: 'Systemd-boot',
        ntp: true
    };

    const creds = {
        root_enc_password: profile.password || '',
        '!users': [
            {
                username: profile.username || 'neubat',
                '!password': profile.password || '',
                sudo: true
            }
        ]
    };

    return { config, creds, desktop: desktopKey, aur_packages: profile.aur_packages || [] };
}

module.exports = { toArchinstallPair, DESKTOP_MAP };
