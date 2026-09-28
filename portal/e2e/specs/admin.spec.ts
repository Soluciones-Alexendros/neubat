import { test, expect, ADMIN_TOKEN, type Page } from '../fixtures';

interface Semilla {
  token: string;
  hostname: string;
  profile: string;
}

let semillas: Semilla[] = [];

async function entrarComoAdmin(page: Page): Promise<void> {
  await page.goto('/admin');
  await page.getByLabel('Admin token').fill(ADMIN_TOKEN);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Panel de administración' })).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  const run = Date.now().toString(36);
  const crear = async (n: number, profile: string, estado: 'completed' | 'failed' | null): Promise<Semilla> => {
    const hostname = `e2e-adm${n}-${run}`;
    // production trae cifrado activo con los secretos de ejemplo del repo: hay que sobreescribirlos.
    const res = await request.post('/api/install', {
      data: {
        profile,
        hostname,
        password: 'E2e-fuerte-123',
        encryption: { enabled: true, method: 'keyfile', passphrase: 'E2e-Luks-adm-123' },
      },
    });
    expect(res.status()).toBe(200);
    const { token } = await res.json();
    if (estado) {
      const done = await request.post('/api/complete', { data: { token, status: estado, hostname } });
      expect(done.status()).toBe(200);
    }
    return { token, hostname, profile };
  };

  semillas = [
    await crear(1, 'base', 'completed'),
    await crear(2, 'developer', 'failed'),
    await crear(3, 'production', null), // queda pending
  ];
});

test('sin token se pide el token de administrador y la API responde 401', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page.getByText('Acceso al panel')).toBeVisible();
  await expect(
    page.getByText('Introduce el token de administrador configurado en el servidor.')
  ).toBeVisible();
  await expect(page.getByLabel('Admin token')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();

  const res = await request.get('/api/admin/installations');
  expect(res.status()).toBe(401);
});

test('introducir el token carga la tabla y lo persiste en localStorage', async ({ page }) => {
  await entrarComoAdmin(page);

  expect(await page.evaluate(() => localStorage.getItem('neubat-admin-token'))).toBe(ADMIN_TOKEN);
  // Las semillas aparecen en la tabla (hostnames visibles en la columna correspondiente).
  await expect(page.getByRole('cell', { name: semillas[0].hostname })).toBeVisible();
  await expect(page.getByRole('cell', { name: semillas[1].hostname })).toBeVisible();
});

test('el buscador filtra por hostname', async ({ page }) => {
  await entrarComoAdmin(page);

  const buscador = page.getByPlaceholder('Buscar token, hostname o perfil');
  await buscador.fill(semillas[1].hostname);
  await expect(page.getByRole('cell', { name: semillas[1].hostname })).toBeVisible();
  await expect(page.getByRole('cell', { name: semillas[0].hostname })).toBeHidden();

  await buscador.fill('');
  await expect(page.getByRole('cell', { name: semillas[0].hostname })).toBeVisible();
});

test('el filtro por estado reduce la tabla', async ({ page }) => {
  await entrarComoAdmin(page);

  await page.getByText('Todos los estados').click();
  await page.getByRole('option', { name: 'completed', exact: true }).click();

  await expect(page.getByRole('cell', { name: semillas[0].hostname })).toBeVisible();
  await expect(page.getByRole('cell', { name: semillas[1].hostname })).toBeHidden();
});

test('acciones: cambiar estado, resetear y eliminar (con confirm nativo)', async ({ page, request }) => {
  await entrarComoAdmin(page);
  const objetivo = semillas[2]; // pending, sin hostname registrado
  const fila = page.getByRole('row', { name: new RegExp(objetivo.token.slice(0, 12)) });
  const auth = { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } };
  const estadoApi = async () =>
    (await (await request.get(`/api/installations/${objetivo.token}`, auth)).json()).status as string;

  // pending → completed
  await fila.getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Marcar completed' }).click();
  await expect(fila).toContainText('completed');
  expect(await estadoApi()).toBe('completed');

  // reset → vuelve a pending
  await fila.getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Resetear' }).click();
  await expect(fila).toContainText('pending');
  expect(await estadoApi()).toBe('pending');

  // delete con confirm() aceptado
  page.on('dialog', (dialog) => void dialog.accept());
  await fila.getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  await expect(fila).toBeHidden();
  const res = await request.get(`/api/installations/${objetivo.token}`, auth);
  expect(res.status()).toBe(404);
});
