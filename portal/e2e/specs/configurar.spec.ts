import { test, expect, ADMIN_TOKEN } from '../fixtures';

function unique(tag: string): string {
  return `e2e-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// El anuncio del camino activo es el único role=status con texto de cifrado.
const anuncio = (page: import('@playwright/test').Page) =>
  page.getByRole('status').filter({ hasText: /El disco (no )?irá cifrado/ });

const contadorCatalogo = (page: import('@playwright/test').Page) =>
  page.getByRole('status').filter({ hasText: 'Mostrando' });

const panelResultado = (page: import('@playwright/test').Page) =>
  page.getByRole('status').filter({ hasText: 'Instalación creada' });

test('cada intención actualiza el perfil sugerido y el anuncio visible', async ({ page }) => {
  await page.goto('/configurar');
  const perfil = page.getByLabel('Perfil base');

  await expect(anuncio(page)).toHaveText('Escritorio KDE. El disco irá cifrado.');
  await expect(perfil).toHaveText('Producción');

  await page.getByRole('radio', { name: /Desarrollo/ }).check();
  await expect(anuncio(page)).toHaveText('Escritorio GNOME. El disco no irá cifrado.');
  await expect(perfil).toHaveText('Desarrollo');
  await expect(page.getByRole('checkbox', { name: 'Cifrar disco con LUKS2' })).not.toBeChecked();

  await page.getByRole('radio', { name: /Servidor mínimo/ }).check();
  await expect(anuncio(page)).toHaveText('Sin escritorio. El disco no irá cifrado.');
  await expect(perfil).toHaveText('Base');
  await expect(page.getByRole('checkbox', { name: 'Cifrar disco con LUKS2' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Snapshots btrfs' })).not.toBeChecked();

  await page.getByRole('radio', { name: /Uso diario/ }).check();
  await expect(anuncio(page)).toHaveText('Escritorio KDE. El disco irá cifrado.');
  await expect(perfil).toHaveText('Producción');
  await expect(page.getByRole('checkbox', { name: 'Cifrar disco con LUKS2' })).toBeChecked();
});

test('los selects de perfil y escritorio actualizan sus valores visibles', async ({ page }) => {
  await page.goto('/configurar');
  const perfil = page.getByLabel('Perfil base');
  const escritorio = page.getByLabel('Escritorio / WM');

  await perfil.click();
  await page.getByRole('option', { name: 'Minimal' }).click();
  await expect(perfil).toHaveText('Minimal');

  await expect(escritorio).toHaveText('KDE Plasma');
  await escritorio.click();
  await expect(page.getByRole('option')).toHaveCount(8);
  await page.getByRole('option', { name: 'Xfce' }).click();
  await expect(escritorio).toHaveText('Xfce');
});

test('hostname, usuario y contraseña vacíos no bloquean el envío: el servidor aplica los valores del perfil', async ({
  page,
  request,
}) => {
  await page.goto('/configurar');
  // El formulario usa noValidate: el botón nunca se deshabilita por campos vacíos.
  await expect(page.getByRole('button', { name: 'Generar instalación' })).toBeEnabled();

  await page.getByRole('radio', { name: /Servidor mínimo/ }).check();
  await page.getByRole('button', { name: 'Generar instalación' }).click();

  const resultado = panelResultado(page);
  await expect(resultado).toBeVisible();
  const [token] = await resultado.locator('code').allTextContents();

  const config = await (await request.get(`/api/config/${token}`)).json();
  expect(config.hostname).toMatch(/^neubat-base-[0-9a-f]{8}$/);
  expect(config.username).toBe('neubat');
  expect(config.password).toBe('neubat');
});

test('el buscador del catálogo filtra los resultados', async ({ page }) => {
  await page.goto('/configurar');
  await expect(contadorCatalogo(page)).toHaveText('Mostrando 131 de 131 paquetes.');

  await page.getByLabel('Buscar en el catálogo').fill('firefox');
  await expect(contadorCatalogo(page)).toHaveText('Mostrando 1 de 131 paquetes.');

  await page.getByLabel('Buscar en el catálogo').fill('zzz-sin-resultados-e2e');
  await expect(contadorCatalogo(page)).toHaveText('Mostrando 0 de 131 paquetes.');
  await expect(page.getByText(/Sin resultados para/)).toBeVisible();

  await page.getByLabel('Buscar en el catálogo').fill('');
  await expect(contadorCatalogo(page)).toHaveText('Mostrando 131 de 131 paquetes.');
});

test('los filtros por función y por origen reducen el listado', async ({ page }) => {
  await page.goto('/configurar');
  const fnDatos = page.getByRole('button', { name: 'Bases de datos' });

  await fnDatos.click();
  await expect(fnDatos).toHaveAttribute('aria-pressed', 'true');
  await expect(contadorCatalogo(page)).toHaveText('Mostrando 2 de 131 paquetes.');

  // postgresql y redis son extra: al exigir origen AUR el listado queda vacío (filtro AND).
  await page.getByRole('button', { name: 'AUR', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AUR', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(contadorCatalogo(page)).toHaveText('Mostrando 0 de 131 paquetes.');

  await page.reload();
  await page.getByRole('button', { name: 'AUR', exact: true }).click();
  await expect(contadorCatalogo(page)).toHaveText('Mostrando 9 de 131 paquetes.');
});

test('marcar y desmarcar un paquete se refleja en el resumen de selección', async ({ page }) => {
  await page.goto('/configurar');
  const resumen = page.locator('p', { hasText: 'Orígenes de la selección' });
  const total = async () => {
    const m = (await resumen.textContent())!.match(/\((\d+)\)/);
    return Number(m![1]);
  };

  // El preset del perfil sugerido se suma a la selección de forma asíncrona: se espera a que asiente.
  const estable = async () => {
    const a = await total();
    await page.waitForTimeout(300);
    return a === (await total());
  };
  await expect.poll(estable, { timeout: 15_000, intervals: [250, 500, 1000] }).toBe(true);
  const inicial = await total();

  // neovim no forma parte del preset del perfil sugerido: arranca desmarcado.
  await page.getByLabel('Buscar en el catálogo').fill('neovim');
  const checkbox = page.getByRole('checkbox', { name: /neovim/ });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  expect(await total()).toBe(inicial + 1);

  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  expect(await total()).toBe(inicial);
});

test('LUKS2: método interactivo seleccionable; desactivar el cifrado oculta método y passphrase', async ({ page }) => {
  await page.goto('/configurar');
  const metodo = page.getByLabel('Método de cifrado');
  const passphrase = page.getByPlaceholder('Passphrase LUKS (no uses neubat)');

  await expect(metodo).toHaveText('Keyfile en /boot');
  await metodo.click();
  await page.getByRole('option', { name: 'Frase interactiva al arrancar' }).click();
  await expect(metodo).toHaveText('Frase interactiva al arrancar');
  await expect(passphrase).toBeVisible();

  await page.getByRole('checkbox', { name: 'Cifrar disco con LUKS2' }).uncheck();
  await expect(metodo).toBeHidden();
  await expect(passphrase).toBeHidden();

  await page.getByRole('checkbox', { name: 'Cifrar disco con LUKS2' }).check();
  await expect(metodo).toBeVisible();
  await expect(passphrase).toBeVisible();
});

test('la passphrase de ejemplo "neubat" se rechaza al generar (error visible del servidor)', async ({ page }) => {
  await page.goto('/configurar');
  await page.getByLabel('Hostname').fill(unique('luks-debil'));
  await page.getByLabel('Contraseña del usuario').fill('E2e-fuerte-123');
  await page.getByPlaceholder('Passphrase LUKS (no uses neubat)').fill('neubat');
  await page.getByRole('button', { name: 'Generar instalación' }).click();

  const alerta = page.getByRole('alert');
  await expect(alerta).toContainText('neubat');
  await expect(alerta).toContainText('Elige otra');
  await expect(panelResultado(page)).toBeHidden();
});

test('el toggle de snapshots btrfs se puede alternar', async ({ page }) => {
  await page.goto('/configurar');
  const snapshots = page.getByRole('checkbox', { name: 'Snapshots btrfs' });

  await expect(snapshots).toBeChecked();
  await snapshots.uncheck();
  await expect(snapshots).not.toBeChecked();
  await snapshots.check();
  await expect(snapshots).toBeChecked();
});

test('generar una instalación muestra token y boot_url y queda pending en el portal', async ({ page, request }) => {
  const hostname = unique('generar');
  await page.goto('/configurar');
  await page.getByLabel('Hostname').fill(hostname);
  await page.getByLabel('Usuario', { exact: true }).fill('neubat');
  await page.getByLabel('Contraseña del usuario').fill('E2e-fuerte-123');
  await page.getByPlaceholder('Passphrase LUKS (no uses neubat)').fill('E2e-Luks-generar-2026!');

  await page.getByRole('button', { name: 'Generar instalación' }).click();

  const resultado = panelResultado(page);
  await expect(resultado).toBeVisible();
  const [token, bootUrl, configUrl] = await resultado.locator('code').allTextContents();
  expect(token).toMatch(/^[0-9a-f]{32}$/);
  expect(bootUrl).toContain(`/boot/${token}`);
  expect(configUrl).toContain(`/api/config/${token}`);

  const inst = await request.get(`/api/installations/${token}`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  expect(inst.status()).toBe(200);
  const instalacion = await inst.json();
  expect(instalacion.status).toBe('pending');
  expect(instalacion.profile).toBe('production');
});

test('flujo completo: intención → paquetes → LUKS → generar → boot_url sirve el script iPXE', async ({
  page,
  request,
}) => {
  const hostname = unique('flujo');
  await page.goto('/configurar');

  await page.getByRole('radio', { name: /Desarrollo/ }).check();

  await page.getByLabel('Buscar en el catálogo').fill('firefox');
  await page.getByRole('checkbox', { name: /firefox/ }).check();
  await page.getByLabel('Buscar en el catálogo').fill('yay');
  await page.getByRole('checkbox', { name: /yay/ }).check();
  await page.getByLabel('Buscar en el catálogo').fill('');

  await page.getByRole('checkbox', { name: 'Cifrar disco con LUKS2' }).check();
  await page.getByLabel('Método de cifrado').click();
  await page.getByRole('option', { name: 'Frase interactiva al arrancar' }).click();
  await page.getByPlaceholder('Passphrase LUKS (no uses neubat)').fill('E2e-Luks-flujo-2026!');

  await page.getByLabel('Hostname').fill(hostname);
  await page.getByLabel('Contraseña del usuario').fill('E2e-fuerte-123');
  await page.getByRole('button', { name: 'Generar instalación' }).click();

  const resultado = panelResultado(page);
  await expect(resultado).toBeVisible();
  const [token, bootUrl] = await resultado.locator('code').allTextContents();
  expect(token).toMatch(/^[0-9a-f]{32}$/);

  const boot = await request.get(bootUrl);
  expect(boot.status()).toBe(200);
  const bootText = await boot.text();
  expect(bootText).toContain('#!ipxe');
  expect(bootText).toContain(`neubat_token=${token}`);

  const config = await (await request.get(`/api/config/${token}`)).json();
  expect(config.hostname).toBe(hostname);
  expect(config.desktop).toBe('gnome');
  expect(config.packages).toContain('firefox');
  expect(config.aur_packages).toContain('yay');
  expect(config.encryption.method).toBe('passphrase');
  expect(config.encryption.enabled).toBe(true);
});
