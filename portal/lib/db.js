'use strict';
/**
 * NEUBAT Portal - persistencia JSON y utilidades compartidas
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const PORTAL_ROOT = path.join(__dirname, '..');
const CONFIG_DIR = process.env.NEUBAT_CONFIGS_DIR || path.join(PORTAL_ROOT, 'configs', 'generated');
const PROFILES_DIR = process.env.NEUBAT_PROFILES_DIR || path.join(PORTAL_ROOT, '..', 'configs');
const DB_PATH = process.env.NEUBAT_DATA_DIR
    ? path.join(process.env.NEUBAT_DATA_DIR, 'installations.json')
    : path.join(PORTAL_ROOT, 'data', 'installations.json');

async function initStorage() {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    try {
        await fs.access(DB_PATH);
    } catch {
        await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
        await writeDB({ installations: [] });
    }
}

function generateToken() {
    return crypto.randomBytes(16).toString('hex');
}

function generateMachineId() {
    return crypto.randomBytes(4).toString('hex');
}

async function readDB() {
    const data = await fs.readFile(DB_PATH, 'utf8');
    return JSON.parse(data);
}

async function writeDB(data) {
    const tmp = `${DB_PATH}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, DB_PATH);
}

async function loadProfile(profile) {
    const profilePath = path.join(PROFILES_DIR, `${profile}.json`);
    return JSON.parse(await fs.readFile(profilePath, 'utf8'));
}

function configPathFor(token) {
    // Defensa contra path traversal: el token es hex de 32 chars
    if (!/^[0-9a-f]{32}$/.test(token)) return null;
    return path.join(CONFIG_DIR, `${token}.json`);
}

// Carga el secreto HMAC desde el entorno. Si no está definido, la firma
// queda deshabilitada (modo desarrollo o despliegues sin verificación).
function hmacSecret() {
    return process.env.NEUBAT_HMAC_SECRET || '';
}

// Serialización JSON canónica y recursiva: claves ordenadas en todos los
// niveles, sin espacios. Es la base estable de la firma HMAC y debe producir
// exactamente lo mismo que json.dumps(value, sort_keys=True, separators=(',',':'))
// en scripts/20-archinstall.sh (verify_config_signature).
function canonicalJson(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

// Forma canónica de un objeto (claves ordenadas, recursivo). Ausente → ''.
// Un objeto vacío produce '{}' (distinto de ausente).
function canonicalObject(value) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        return '';
    }
    return canonicalJson(value);
}

// Payload determinista usado para la firma. Debe coincidir exactamente con
// la reconstrucción que hace el instalador en scripts/20-archinstall.sh:
// token|machine_id|hostname|username|desktop|password|disk|timezone|locale|
// keyboard|packages(order)|aur_packages(order)|services(order)|encryption|snapshots|features
function signingPayload(config) {
    const parts = [
        String(config.token || ''),
        String(config.machine_id || ''),
        String(config.hostname || ''),
        String(config.username || ''),
        String(config.desktop || ''),
        String(config.password || ''),
        String(config.disk || ''),
        String(config.timezone || ''),
        String(config.locale || ''),
        String(config.keyboard || ''),
        ...(Array.isArray(config.packages) ? [...config.packages].sort() : []),
        ...(Array.isArray(config.aur_packages) ? [...config.aur_packages].sort() : []),
        ...(Array.isArray(config.services) ? [...config.services].sort() : []),
        canonicalObject(config.encryption),
        canonicalObject(config.snapshots),
        canonicalObject(config.features)
    ];
    return parts.join('|');
}

function signConfig(config) {
    const secret = hmacSecret();
    if (!secret) return null;
    return crypto.createHmac('sha256', secret)
        .update(signingPayload(config))
        .digest('hex');
}

module.exports = {
    PORTAL_ROOT,
    CONFIG_DIR,
    DB_PATH,
    initStorage,
    generateToken,
    generateMachineId,
    readDB,
    writeDB,
    loadProfile,
    configPathFor,
    hmacSecret,
    canonicalObject,
    signingPayload,
    signConfig
};
