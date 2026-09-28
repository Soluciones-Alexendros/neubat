import { test, expect } from '../fixtures';

test('la landing renderiza el hero y las CTAs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'NEUBAT', level: 1 })).toBeVisible();
  await expect(page.getByText('Instalación desatendida de Arch Linux', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Configurar instalación', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Descargar ISO', exact: true })).toBeVisible();
});

test('la navegación del menú llega a cada ruta', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Configurar', exact: true }).click();
  await expect(page).toHaveURL(/\/configurar$/);

  await page.getByRole('link', { name: 'Descargar', exact: true }).click();
  await expect(page).toHaveURL(/\/descargar$/);

  await page.getByRole('link', { name: 'Cuenta', exact: true }).click();
  await expect(page).toHaveURL(/\/cuenta$/);

  await page.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('el toggle de tema persiste tras recargar (localStorage neubat-theme)', async ({ page }) => {
  await page.goto('/');
  const theme = () => page.evaluate(() => localStorage.getItem('neubat-theme'));

  const before = await theme();
  const boton = page.getByRole('button', {
    name: before === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro',
  });
  await boton.click();

  const after = await theme();
  expect(after).not.toBe(before);
  expect(after === 'dark' || after === 'light').toBe(true);

  await page.reload();
  // Tras la recarga el tema guardado se aplica al documento y al botón muestra el tema contrario.
  await expect(
    page.getByRole('button', { name: after === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro' })
  ).toBeVisible();
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(dark).toBe(after === 'dark');
});

test('el título del documento cambia por ruta', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('NEUBAT — Arch Linux personalizado');
  await page.goto('/configurar');
  await expect(page).toHaveTitle('Configurar instalación · NEUBAT');
  await page.goto('/cuenta');
  await expect(page).toHaveTitle('Cuenta · NEUBAT');
  await page.goto('/descargar');
  await expect(page).toHaveTitle('Descargar ISO · NEUBAT');
  await page.goto('/admin');
  await expect(page).toHaveTitle('Administración · NEUBAT');
});
