import { createHash } from 'node:crypto';
import { test, expect, type APIRequestContext } from '../fixtures';

// Nunca se toca la red externa: se sirven stubs de bytes cuyo SHA-256 conocemos.
const STUB_ISO = 'NEUBAT-E2E-ISO-STUB\n';
const STUB_SHA256 = createHash('sha256').update(STUB_ISO).digest('hex');

interface ReleaseInfo {
  neubat: { version: string; iso_url: string; sha256_url: string };
  arch: { iso_url: string; sha256_url: string };
}

async function releases(request: APIRequestContext): Promise<ReleaseInfo> {
  const res = await request.get('/api/account/releases');
  expect(res.status()).toBe(200);
  return res.json();
}

function sumas(hash: string, fichero: string): string {
  return `${hash} *${fichero}\n`;
}

test('descarga verificada con hash correcto: éxito y guardado', async ({ page, request }) => {
  const rel = await releases(request);
  const fichero = `neubat-${rel.neubat.version}-x86_64.iso`;

  await page.route(rel.neubat.sha256_url, (route) =>
    route.fulfill({ contentType: 'text/plain', body: sumas(STUB_SHA256, fichero) })
  );
  await page.route(rel.neubat.iso_url, (route) =>
    route.fulfill({ contentType: 'application/octet-stream', body: STUB_ISO })
  );

  await page.goto('/descargar');
  const boton = page.getByRole('button', { name: 'Descargar y verificar' });
  await expect(boton).toBeEnabled();

  const [descarga] = await Promise.all([page.waitForEvent('download'), boton.click()]);
  expect(descarga.suggestedFilename()).toBe(fichero);
  await expect(page.getByRole('status').filter({ hasText: 'ISO verificada y guardada.' })).toBeVisible();
});

test('descarga verificada con hash incorrecto: mensaje de fallo', async ({ page, request }) => {
  const rel = await releases(request);
  const fichero = `neubat-${rel.neubat.version}-x86_64.iso`;
  const hashFalso = '0'.repeat(64);

  await page.route(rel.neubat.sha256_url, (route) =>
    route.fulfill({ contentType: 'text/plain', body: sumas(hashFalso, fichero) })
  );
  await page.route(rel.neubat.iso_url, (route) =>
    route.fulfill({ contentType: 'application/octet-stream', body: STUB_ISO })
  );

  await page.goto('/descargar');
  await page.getByRole('button', { name: 'Descargar y verificar' }).click();

  await expect(page.getByRole('alert')).toContainText('Hash no coincide');
  await expect(page.getByRole('status').filter({ hasText: 'ISO verificada y guardada.' })).toBeHidden();
});

test('las descargas apuntan a las URLs configuradas en /api/account/releases', async ({ page, request }) => {
  const rel = await releases(request);
  const solicitadas: string[] = [];
  const registrar = (cuerpo: string, tipo: string) => async (route: import('@playwright/test').Route) => {
    solicitadas.push(route.request().url());
    await route.fulfill({ contentType: tipo, body: cuerpo });
  };

  await page.route(rel.neubat.sha256_url, registrar(sumas(STUB_SHA256, `neubat-${rel.neubat.version}-x86_64.iso`), 'text/plain'));
  await page.route(rel.neubat.iso_url, registrar(STUB_ISO, 'application/octet-stream'));
  await page.route(rel.arch.sha256_url, registrar(sumas(STUB_SHA256, 'archlinux-x86_64.iso'), 'text/plain'));
  await page.route(rel.arch.iso_url, registrar(STUB_ISO, 'application/octet-stream'));

  await page.goto('/descargar');

  const d1p = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar y verificar' }).click();
  await d1p;

  const d2p = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar Arch y verificar' }).click();
  await d2p;

  expect(solicitadas).toContain(rel.neubat.sha256_url);
  expect(solicitadas).toContain(rel.neubat.iso_url);
  expect(solicitadas).toContain(rel.arch.sha256_url);
  expect(solicitadas).toContain(rel.arch.iso_url);
});
