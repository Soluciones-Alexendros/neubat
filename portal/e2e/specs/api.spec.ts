import { test, expect, ADMIN_TOKEN } from '../fixtures';

const ROLES = ['programa', 'biblioteca', 'herramienta', 'servicio'];
const ORIGINS = ['extra', 'multilib', 'aur'];

function unique(tag: string): string {
  return `e2e-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

test('GET /api/health responde 200', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe('ok');
});

test('GET /api/catalog devuelve 131 ítems con el esquema de routes/catalog.js', async ({ request }) => {
  const res = await request.get('/api/catalog');
  expect(res.status()).toBe(200);
  const items = await res.json();
  expect(Array.isArray(items)).toBe(true);
  expect(items).toHaveLength(131);
  for (const item of items) {
    expect(typeof item.name).toBe('string');
    expect(item.name.length).toBeGreaterThan(0);
    expect(item.family === null || typeof item.family === 'string').toBe(true);
    expect(ROLES).toContain(item.role);
    expect(ORIGINS).toContain(item.origin);
    expect(Array.isArray(item.functions)).toBe(true);
    expect(item.functions.every((f: unknown) => typeof f === 'string')).toBe(true);
    expect(typeof item.summary).toBe('string');
    expect(typeof item.aur).toBe('boolean');
    expect(item.aur).toBe(item.origin === 'aur');
  }
});

test('ciclo de vida completo: install → config → boot → complete', async ({ request }) => {
  const hostname = unique('ciclo');
  const created = await request.post('/api/install', {
    data: { profile: 'base', hostname },
  });
  expect(created.status()).toBe(200);
  const body = await created.json();
  expect(body.token).toMatch(/^[0-9a-f]{32}$/);
  expect(body.config_url).toBe(`/api/config/${body.token}`);
  expect(body.boot_url).toBe(`/boot/${body.token}`);

  const config = await request.get(body.config_url);
  expect(config.status()).toBe(200);
  expect((await config.json()).hostname).toBe(hostname);

  // Descargar la config marca la instalación como 'downloaded'
  const afterDownload = await request.get(`/api/installations/${body.token}`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  expect(afterDownload.status()).toBe(200);
  expect((await afterDownload.json()).status).toBe('downloaded');

  const boot = await request.get(body.boot_url);
  expect(boot.status()).toBe(200);
  const bootText = await boot.text();
  expect(bootText).toContain('#!ipxe');
  expect(bootText).toContain(`neubat_token=${body.token}`);

  const complete = await request.post('/api/complete', {
    data: { token: body.token, status: 'completed' },
  });
  expect(complete.status()).toBe(200);

  const final = await request.get(`/api/installations/${body.token}`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  expect((await final.json()).status).toBe('completed');
});

test('LUKS con la passphrase de ejemplo "neubat" se rechaza; con passphrase fuerte se acepta', async ({ request }) => {
  // routes/install.js#usesPublicLuksSecret: 400 si password o encryption.passphrase === 'neubat'
  const weak = await request.post('/api/install', {
    data: {
      profile: 'base',
      hostname: unique('luks-debil'),
      password: 'E2e-fuerte-123',
      encryption: { enabled: true, method: 'interactive', passphrase: 'neubat' },
    },
  });
  expect(weak.status()).toBe(400);
  expect((await weak.json()).error).toContain('neubat');

  const strong = await request.post('/api/install', {
    data: {
      profile: 'base',
      hostname: unique('luks-fuerte'),
      password: 'E2e-fuerte-123',
      encryption: { enabled: true, method: 'interactive', passphrase: 'E2e-Luks-fuerte-2026!' },
    },
  });
  expect(strong.status()).toBe(200);
  expect((await strong.json()).token).toMatch(/^[0-9a-f]{32}$/);
});

test('ruta API inexistente devuelve 404 JSON', async ({ request }) => {
  const res = await request.get('/api/no-existe');
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(typeof body.error).toBe('string');
  expect(body.error.length).toBeGreaterThan(0);
});

test('POST /api/install anónimo (sin cookie) funciona', async ({ request }) => {
  const res = await request.post('/api/install', {
    data: { profile: 'base', hostname: unique('anon') },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).token).toMatch(/^[0-9a-f]{32}$/);
});

test('/api/installations y /api/metrics exigen Bearer admin', async ({ request }) => {
  expect((await request.get('/api/installations')).status()).toBe(401);
  expect((await request.get('/api/metrics')).status()).toBe(401);

  const inst = await request.get('/api/installations', {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  expect(inst.status()).toBe(200);
  expect(Array.isArray(await inst.json())).toBe(true);

  const metrics = await request.get('/api/metrics', {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  expect(metrics.status()).toBe(200);
  expect(typeof (await metrics.json()).total).toBe('number');
});
