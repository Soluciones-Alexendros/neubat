import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import { Layout } from '@/components/Layout';
import { AuthProvider } from '@/lib/auth';
import { LandingPage } from '@/pages/LandingPage';
import { ConfigurePage } from '@/pages/ConfigurePage';
import { AccountPage } from '@/pages/AccountPage';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function renderShell(path: string, page: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Layout>{page}</Layout>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function seriousViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: tags },
    rules: {
      // jsdom no calcula el contraste real. Ese gate vive en make smoke (tokens OKLCH).
      'color-contrast': { enabled: false },
    },
  });
  return results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
}

describe('axe sobre el árbol real', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/account/recommendations')) {
        return { ok: true, json: async () => ({ recommendations: [] }) } as Response;
      }
      if (url.includes('/api/account/releases')) {
        return {
          ok: true,
          json: async () => ({
            neubat: { version: '2.0.0', iso_url: '/iso', sha256_url: '/iso.sha256' },
            arch: { iso_url: '/arch', sha256_url: '/arch.sha256' },
          }),
        } as Response;
      }
      return { ok: false, status: 401, json: async () => ({ error: 'Sin sesión' }) } as Response;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('landing dentro de Layout', async () => {
    const { container } = renderShell('/', <LandingPage />);
    await waitFor(() => {
      expect(container.querySelector('#contenido')).toBeTruthy();
    });
    expect(await seriousViolations(container)).toEqual([]);
  });

  it('configurar dentro de Layout', async () => {
    const { container } = renderShell('/configurar', <ConfigurePage />);
    await waitFor(() => {
      expect(container.querySelector('#config-heading')).toBeTruthy();
    });
    expect(await seriousViolations(container)).toEqual([]);
  });

  it('cuenta dentro de Layout', async () => {
    const { container } = renderShell('/cuenta', <AccountPage />);
    await waitFor(() => {
      expect(container.querySelector('#contenido')).toBeTruthy();
    });
    expect(await seriousViolations(container)).toEqual([]);
  });
});
