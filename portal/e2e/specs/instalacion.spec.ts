import { test, expect, ADMIN_TOKEN } from '../fixtures';

test('/instalar: el formulario clásico genera token y boot_url válidos', async ({ page, request }) => {
  const hostname = `e2e-inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto('/instalar');

  // El perfil más ligero del formulario clásico es "Base (mínimo, sin GUI)" (no existe "minimal" aquí).
  await page.getByLabel('Perfil', { exact: true }).click();
  await page.getByRole('option', { name: /Base \(mínimo, sin GUI\)/ }).click();

  await page.getByLabel('Hostname').fill(hostname);
  await page.getByLabel('Usuario', { exact: true }).fill('neubat');
  await page.getByLabel('Contraseña del usuario').fill('E2e-fuerte-123');

  await page.getByRole('button', { name: 'Generar instalación' }).click();

  const resultado = page.getByRole('status').filter({ hasText: 'Instalación creada' });
  await expect(resultado).toBeVisible();
  const [token, bootUrl, configUrl] = await resultado.locator('code').allTextContents();
  expect(token).toMatch(/^[0-9a-f]{32}$/);
  expect(bootUrl).toContain(`/boot/${token}`);
  expect(configUrl).toContain(`/api/config/${token}`);

  const auth = { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } };
  const inst = await request.get(`/api/installations/${token}`, auth);
  expect(inst.status()).toBe(200);
  expect((await inst.json()).status).toBe('pending');

  const boot = await request.get(bootUrl);
  expect(boot.status()).toBe(200);
  const bootText = await boot.text();
  expect(bootText).toContain('#!ipxe');
  expect(bootText).toContain(`neubat_token=${token}`);

  const config = await (await request.get(`/api/config/${token}`)).json();
  expect(config.hostname).toBe(hostname);
});
