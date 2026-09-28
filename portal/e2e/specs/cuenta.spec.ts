import { test, expect, type Page } from '../fixtures';

function emailUnico(tag: string): string {
  return `e2e-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function registrarPorUi(page: Page, email: string): Promise<void> {
  await page.goto('/cuenta');
  await page.getByRole('button', { name: '¿No tienes cuenta? Regístrate' }).click();
  await page.getByLabel('Nombre').fill('E2E Tester');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill('E2e-contrasegura-123');
  await page.getByRole('button', { name: 'Registrarme' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, E2E Tester' })).toBeVisible();
}

test('el registro por UI funciona y deja la sesión iniciada', async ({ page }) => {
  const email = emailUnico('registro');
  await registrarPorUi(page, email);

  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  expect((await me.json()).user.email).toBe(email);
  await expect(page.getByText(email)).toBeVisible();
});

test('el login con contraseña incorrecta muestra un error', async ({ page, registeredUser }) => {
  await page.goto('/cuenta');
  await page.getByLabel('Correo').fill(registeredUser.email);
  await page.getByLabel('Contraseña').fill('contraseña-incorrecta-1');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos');
  await expect(page.getByRole('heading', { name: 'Cuenta NEUBAT' })).toBeVisible();
});

test('la sesión persiste entre recargas con la cookie HttpOnly neubat_session', async ({ page }) => {
  await registrarPorUi(page, emailUnico('sesion'));

  const cookies = await page.context().cookies('http://127.0.0.1:3101');
  const sesion = cookies.find((c) => c.name === 'neubat_session');
  expect(sesion).toBeDefined();
  expect(sesion!.httpOnly).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hola, E2E Tester' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
});

test('con sesión, /configurar guarda la configuración y aparece en la lista de la cuenta', async ({ page }) => {
  await registrarPorUi(page, emailUnico('guardar'));

  await page.goto('/configurar');
  const nombre = `e2e-guardar-${Math.random().toString(36).slice(2, 8)}`;
  await page.getByLabel('Guardar en mi cuenta como (opcional)').fill(nombre);
  await page.getByLabel('Hostname').fill(`e2e-host-${Math.random().toString(36).slice(2, 8)}`);
  await page.getByRole('radio', { name: /Servidor mínimo/ }).check();
  await page.getByRole('button', { name: 'Generar instalación' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Instalación creada' })).toBeVisible();

  await page.goto('/cuenta');
  await expect(page.getByText('Configuraciones guardadas')).toBeVisible();
  await expect(page.getByText(nombre)).toBeVisible();
});

test('la sección de copias del sistema es visible y genera un código de absorción', async ({ page }) => {
  await registrarPorUi(page, emailUnico('absorber'));

  await expect(page.getByText('Copias del sistema')).toBeVisible();
  await page.getByRole('button', { name: 'Generar código de absorción' }).click();

  const uso = page.getByRole('status').filter({ hasText: 'neubat-absorb.sh' });
  await expect(uso).toBeVisible();
  await expect(uso).toContainText('--code');
  await expect(uso).toContainText('127.0.0.1:3101');
});
