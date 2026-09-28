import type {
  CatalogItem,
  HealthResponse,
  InstallRequest,
  InstallResponse,
  Installation,
  Recommendation,
  ReleaseInfo,
  SavedConfig,
  SystemCopy,
  User,
} from '@/types';
import { FALLBACK_CATALOG } from '@/lib/catalog-fallback';

const API_BASE = '';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Error ${res.status}`);
  }
  return data as T;
}

export const api = {
  health: () => fetchJson<HealthResponse>('/api/health'),

  install: (body: InstallRequest) =>
    fetchJson<InstallResponse>('/api/install', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  adminInstallations: (adminToken: string) =>
    fetchJson<Installation[]>('/api/admin/installations', {
      headers: { Authorization: `Bearer ${adminToken}` },
    }),

  complete: (token: string, status: Installation['status'], hostname?: string) =>
    fetchJson<{ success: boolean }>('/api/complete', {
      method: 'POST',
      body: JSON.stringify({ token, status, hostname }),
    }),

  updateStatus: (token: string, status: Installation['status'], adminToken: string) =>
    fetchJson<{ success: boolean }>(`/api/admin/installations/${token}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status }),
    }),

  delete: (token: string, adminToken: string) =>
    fetchJson<{ success: boolean }>(`/api/admin/installations/${token}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    }),

  reset: (token: string, adminToken: string) =>
    fetchJson<{ success: boolean }>(`/api/admin/installations/${token}/reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    }),

  register: (email: string, password: string, display_name?: string) =>
    fetchJson<{ success: boolean; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name }),
    }),

  login: (email: string, password: string) =>
    fetchJson<{ success: boolean; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    fetchJson<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => fetchJson<{ user: User }>('/api/auth/me'),

  recommendations: () =>
    fetchJson<{ recommendations: Recommendation[] }>('/api/account/recommendations'),

  configs: () => fetchJson<{ configs: SavedConfig[] }>('/api/account/configs'),

  saveConfig: (body: Record<string, unknown>) =>
    fetchJson<{ success: boolean; config: SavedConfig }>('/api/account/configs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  copies: () =>
    fetchJson<{ copies: SystemCopy[]; note: string }>('/api/account/copies'),

  absorbCode: () =>
    fetchJson<{ code: string; expires_in_seconds: number; usage: string }>(
      '/api/account/absorb-code',
      { method: 'POST' }
    ),

  confirmCopy: (id: string) =>
    fetchJson<{ success: boolean; copy: SystemCopy }>(`/api/account/copies/${id}/confirm`, {
      method: 'POST',
    }),

  releases: () => fetchJson<ReleaseInfo>('/api/account/releases'),

  profile: (name: string) =>
    fetchJson<{ packages?: string[]; aur_packages?: string[]; disk?: string }>(
      `/api/account/profiles/${encodeURIComponent(name)}`
    ),

  // El catálogo versionado se sirve desde portal/catalog/packages.json.
  // Si el portal no responde (modo local/offline) se usa el mínimo embebido.
  catalog: async (): Promise<CatalogItem[]> => {
    try {
      return await fetchJson<CatalogItem[]>('/api/catalog');
    } catch {
      return FALLBACK_CATALOG;
    }
  },
};
