'use strict';
/**
 * security-scan: comprobaciones de seguridad estáticas del repositorio.
 * Solo usa módulos nativos de Node (no requiere gitleaks/trivy localmente).
 *
 * Cubre:
 *  1. Secretos hardcodeados (gitleaks-lite sobre archivos del repo)
 *  2. TLS: instalador https-only + portal exige TLS en producción
 *  3. HMAC fail-closed: portal e instalador rechazan config sin firma
 *  4. Patrones peligrosos (eval, child_process, dangerouslySetInnerHTML)
 *  5. Secretos por defecto del repositorio (.env.example / 'neubat')
 *  6. Cabeceras: helmet + CSP frame-ancestors + rate limiting
 *  7. Dependencias: npm audit (si hay red; si no, SKIP)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORTAL = path.join(ROOT, 'portal');

let failures = 0;
let warnings = 0;
function ok(msg) {
    console.log(`OK ${msg}`);
}
function fail(msg) {
    failures += 1;
    console.error(`FAIL ${msg}`);
}
function warn(msg) {
    warnings += 1;
    console.log(`WARN ${msg}`);
}
function skip(msg) {
    console.log(`SKIP ${msg}`);
}

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function readIf(rel) {
    const p = path.join(ROOT, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
function exists(rel) {
    return fs.existsSync(path.join(ROOT, rel));
}

// ---------------------------------------------------------------------------
// 1. Secretos hardcodeados
// ---------------------------------------------------------------------------

const EXCLUDE_DIRS = new Set([
    '.git', 'node_modules', 'out', 'coverage', 'dist', 'build',
    'portal/public', 'portal/data', '.cache', '.vite', '.turbo'
]);
const EXCLUDE_FILES = new Set(['package-lock.json', '.env', '.gitleaks.toml', '.gitguardian.yaml']);
const BINARY_EXT = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.pdf', '.gz', '.tgz',
    '.zip', '.tar', '.iso', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.wasm'
]);
// Rutas con credenciales ficticias de pruebas / plantillas (espejo de gitleaks.toml)
const ALLOWLIST = [
    /(^|\/)configs\//,
    /(^|\/)tests\//,
    /(^|\/)portal\/tests\//,
    /(^|\/)portal\/e2e\//,
    /(^|\/)docs\//,
    /(^|\/)schemas\//,
    /\.env\.example$/,
    /\.md$/,
    /(^|\/)portal\/lib\/db\.js$/
];

function walk(dir, list) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
            if (EXCLUDE_DIRS.has(entry.name)) continue;
            walk(path.join(dir, entry.name), list);
        } else if (entry.isFile()) {
            list.push(path.join(dir, entry.name));
        }
    }
    return list;
}

const SECRET_PATTERNS = [
    { name: 'clave privada PEM', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
    { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
    { name: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/ },
    { name: 'GitHub PAT', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
    { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
    { name: 'clave API OpenAI', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
    { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
    {
        name: 'asignación de secreto',
        re: /(?:secret|passwd|password|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[:=]\s*['"][^'"\n]{16,}['"]/i
    }
];
const PLACEHOLDER = /(test|example|placeholder|cambia|changeme|dummy|fixture|redacted|sample|xxxx|your[-_ ]|<[a-z_]+>|\$\{|\{\{|process\.env|neubat-fixture)/i;

function scanSecrets() {
    const files = walk(ROOT, []);
    let findings = 0;
    for (const file of files) {
        const rel = path.relative(ROOT, file);
        if (EXCLUDE_FILES.has(path.basename(file))) continue;
        if (BINARY_EXT.has(path.extname(file).toLowerCase())) continue;
        let stat;
        try {
            stat = fs.statSync(file);
        } catch {
            continue;
        }
        if (stat.size > 1536 * 1024) continue;
        if (ALLOWLIST.some((re) => re.test(rel))) continue;
        let text;
        try {
            text = fs.readFileSync(file, 'utf8');
        } catch {
            continue;
        }
        if (text.includes('\u0000')) continue;
        for (const { name, re } of SECRET_PATTERNS) {
            const m = text.match(re);
            if (m && !PLACEHOLDER.test(m[0])) {
                fail(`secreto (${name}) en ${rel}: ${m[0].slice(0, 40)}...`);
                findings += 1;
            }
        }
    }
    if (findings === 0) ok(`sin secretos hardcodeados en ${files.length} archivos`);
}

// ---------------------------------------------------------------------------
// 2. TLS
// ---------------------------------------------------------------------------

function checkTls() {
    const arch = readIf('scripts/20-archinstall.sh') || '';
    if (/--proto '=https'/.test(arch) && /--tlsv1\.2/.test(arch)) {
        ok('instalador fuerza https + TLS 1.2 (--proto/--tlsv1.2)');
    } else {
        fail('scripts/20-archinstall.sh no fuerza --proto https y --tlsv1.2');
    }
    if (/curl\s+[^\n]*-s[^\n]*[^\n]-o/.test(arch) && !/--proto '=https'/.test(arch)) {
        fail('descarga de configuración sin restricción de protocolo https');
    }

    const install = readIf('portal/routes/install.js') || '';
    if (/requiresTls/.test(install) && /req\.secure/.test(install)) {
        ok('portal exige TLS (req.secure) en producción para /api/config');
    } else {
        fail('portal/routes/install.js no exige TLS (req.secure) para /api/config');
    }

    const server = readIf('portal/server.js') || '';
    if (/publicUrl\.startsWith\('https:\/\/'\)/.test(server)) {
        ok('portal aborta en producción si NEUBAT_PUBLIC_URL no es https://');
    } else {
        fail('portal/server.js no exige NEUBAT_PUBLIC_URL https:// en producción');
    }
}

// ---------------------------------------------------------------------------
// 3. HMAC fail-closed
// ---------------------------------------------------------------------------

function checkHmac() {
    const db = readIf('portal/lib/db.js') || '';
    if (/NEUBAT_HMAC_SECRET/.test(db) && /if\s*\(\s*!secret\s*\)\s*return null/.test(db.replace(/\n/g, ' '))) {
        ok('db.signConfig devuelve null sin secreto (fail-closed)');
    } else if (/NEUBAT_HMAC_SECRET/.test(db)) {
        warn('db.js usa NEUBAT_HMAC_SECRET pero no se pudo confirmar el retorno null');
    } else {
        fail('portal/lib/db.js no integra NEUBAT_HMAC_SECRET');
    }

    const server = readIf('portal/server.js') || '';
    if (/length\s*<\s*32/.test(server) && /cambia-este-secreto-por-una-cadena-larga-y-aleatoria/.test(server)) {
        ok('portal rechaza secretos HMAC débiles/placeholder en producción');
    } else {
        fail('portal/server.js no rechaza secretos HMAC débiles o el placeholder');
    }

    const arch = readIf('scripts/20-archinstall.sh') || '';
    if (/Firma HMAC inválida/.test(arch) && /sin firma HMAC/.test(arch)) {
        ok('instalador rechaza firma inválida y config sin firma con secreto');
    } else {
        fail('scripts/20-archinstall.sh no es fail-closed ante firma inválida/ausente');
    }
}

// ---------------------------------------------------------------------------
// 4. Patrones peligrosos
// ---------------------------------------------------------------------------

function scanDangerous() {
    const targets = [];
    for (const dir of ['portal/lib', 'portal/routes', 'portal/server.js']) {
        const full = path.join(PORTAL, dir.replace('portal/', ''));
        if (fs.existsSync(full)) {
            const stat = fs.statSync(full);
            if (stat.isDirectory()) walk(full, targets);
            else targets.push(full);
        }
    }
    const checks = [
        { name: 'eval()', re: /(^|[^.\w])eval\s*\(/ },
        { name: 'new Function()', re: /new\s+Function\s*\(/ },
        { name: 'child_process', re: /require\(\s*['"]child_process['"]\s*\)/ },
        { name: 'dangerouslySetInnerHTML', re: /dangerouslySetInnerHTML/ }
    ];
    let findings = 0;
    for (const file of targets) {
        const rel = path.relative(ROOT, file);
        const text = fs.readFileSync(file, 'utf8');
        for (const { name, re } of checks) {
            if (re.test(text)) {
                fail(`patrón peligroso (${name}) en ${rel}`);
                findings += 1;
            }
        }
    }
    if (findings === 0) ok(`sin eval/child_process/HTML sin escapar en portal (${targets.length} archivos)`);
}

// ---------------------------------------------------------------------------
// 5. Secretos por defecto
// ---------------------------------------------------------------------------

function checkDefaults() {
    const envExample = readIf('.env.example');
    if (envExample && /NEUBAT_HMAC_SECRET=cambia-este-secreto/.test(envExample)) {
        ok('.env.example solo contiene placeholder (no secreto real)');
    } else if (envExample) {
        warn('.env.example no usa el placeholder esperado para NEUBAT_HMAC_SECRET');
    }

    const server = readIf('portal/server.js') || '';
    if (/length\s*<\s*32/.test(server)) {
        ok('portal aplica longitud mínima (>=32) al secreto HMAC');
    } else {
        fail('portal no valida longitud mínima del secreto HMAC');
    }
}

// ---------------------------------------------------------------------------
// 6. Cabeceras y rate limiting
// ---------------------------------------------------------------------------

function checkHeaders() {
    const server = readIf('portal/server.js') || '';
    if (/helmet\(/.test(server)) ok('helmet activo (cabeceras de seguridad)');
    else fail('portal/server.js no usa helmet');

    if (/frameAncestors:\s*\[['"]'none'['"]\]/.test(server)) {
        ok('CSP frame-ancestors none (anti clickjacking)');
    } else {
        fail("CSP sin frame-ancestors 'none'");
    }

    if (/createRateLimiter/.test(server) && /app\.use\('\/api',\s*apiLimiter\)/.test(server)) {
        ok('rate limiting aplicado a /api');
    } else {
        fail('rate limiting no aplicado a /api');
    }
}

// ---------------------------------------------------------------------------
// 7. Dependencias (npm audit) — best-effort
// ---------------------------------------------------------------------------

function auditDeps() {
    if (!exists('portal/node_modules')) {
        skip('npm audit: portal/node_modules no instalado');
        return;
    }
    let out;
    try {
        out = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
            cwd: PORTAL,
            encoding: 'utf8',
            timeout: 60000,
            stdio: ['ignore', 'pipe', 'pipe']
        });
    } catch (e) {
        // npm audit devuelve exit != 0 si hay vulnerabilidades; el JSON va en stdout.
        if (e.stdout) {
            out = e.stdout;
        } else {
            skip(`npm audit no disponible (sin red o fallo): ${String(e.message).split('\n')[0]}`);
            return;
        }
    }
    let report;
    try {
        report = JSON.parse(out);
    } catch {
        skip('npm audit: salida no parseable');
        return;
    }
    if (report.error) {
        skip(`npm audit: ${report.error.summary || 'error de red'}`);
        return;
    }
    const v = (report.metadata && report.metadata.vulnerabilities) || {};
    const high = (v.high || 0) + (v.critical || 0);
    if (high > 0) {
        fail(`npm audit: ${v.critical || 0} críticas, ${v.high || 0} altas en dependencias de producción`);
    } else {
        ok(`npm audit: sin vulnerabilidades altas/críticas (${v.moderate || 0} moderadas, ${v.low || 0} bajas)`);
    }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

ok(`security-scan sobre ${ROOT}`);
scanSecrets();
checkTls();
checkHmac();
scanDangerous();
checkDefaults();
checkHeaders();
auditDeps();

if (failures > 0) {
    console.error(`security-scan: ${failures} fallo(s), ${warnings} aviso(s)`);
    process.exit(1);
}
console.log(`security-scan: OK (${warnings} aviso(s))`);
