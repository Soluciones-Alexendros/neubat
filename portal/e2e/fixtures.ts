import { test as base, expect } from '@playwright/test';

export { expect };

export const ADMIN_TOKEN = 'test-admin-token';

export type UserCreds = { email: string; password: string };

function randomEmail(tag: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `e2e-${tag}-${rand}@example.com`;
}

// Usuario fresco registrado vía API (la UI de login/registro se ejercita en cuenta.spec.ts).
export const test = base.extend<{ registeredUser: UserCreds }>({
  registeredUser: async ({ request }, use) => {
    const creds: UserCreds = {
      email: randomEmail('user'),
      password: 'E2e-contrasegura-123',
    };
    const res = await request.post('/api/auth/register', { data: creds });
    if (!res.ok()) {
      throw new Error(`Registro E2E falló: ${res.status()} ${await res.text()}`);
    }
    await use(creds);
  },
});

export type { TestInfo } from '@playwright/test';
