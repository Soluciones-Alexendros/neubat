export interface Installation {
  token: string;
  machine_id?: string;
  profile: string;
  status: 'pending' | 'downloaded' | 'completed' | 'failed';
  created_at: string;
  downloaded_at?: string;
  completed_at?: string;
  hostname?: string;
  error?: string;
  user_id?: string | null;
}

export interface InstallRequest {
  profile: string;
  hostname?: string;
  username?: string;
  desktop?: string;
  packages?: string[];
  aur_packages?: string[];
  locale?: string;
  keyboard?: string;
  timezone?: string;
  password?: string;
  encryption?: {
    enabled: boolean;
    method?: 'keyfile' | 'passphrase' | 'interactive';
    passphrase?: string;
  };
  snapshots?: {
    enabled: boolean;
  };
}

export interface InstallResponse {
  success: boolean;
  token: string;
  machine_id: string;
  config_url: string;
  boot_url: string;
  message: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  saved_configs?: SavedConfig[];
  system_copies?: SystemCopy[];
}

export interface SavedConfig {
  id: string;
  name: string;
  created_at: string;
  profile: string;
  hostname?: string;
  username?: string;
  desktop?: string;
  packages?: string[];
  aur_packages?: string[];
  locale?: string;
  keyboard?: string;
  timezone?: string;
}

export interface SystemCopy {
  id: string;
  created_at: string;
  packages: string[];
  desktop: string;
  locale?: string;
  keyboard?: string;
  timezone?: string;
  status: string;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  profile: string;
  desktop?: string;
  packages?: string[];
  intent?: 'daily' | 'develop' | 'server';
  encryption?: { enabled: boolean; method?: 'keyfile' | 'passphrase' | 'interactive' };
  snapshots?: { enabled: boolean };
}

export interface ReleaseInfo {
  neubat: { version: string; iso_url: string; sha256_url: string };
  arch: { iso_url: string; sha256_url: string };
}

export type CatalogRole = 'programa' | 'biblioteca' | 'herramienta' | 'servicio';

export type CatalogOrigin = 'extra' | 'multilib' | 'aur';

/** Taxonomía cerrada de funciones (etiquetas multi-función de cada paquete). */
export type CatalogFunction =
  | 'internet'
  | 'multimedia'
  | 'audio'
  | 'desarrollo'
  | 'seguridad'
  | 'red'
  | 'escritorio'
  | 'graficos'
  | 'sistema'
  | 'contenedores'
  | 'utilidades'
  | 'documentos'
  | 'datos';

export interface CatalogItem {
  name: string;
  /** id de familia en kebab-case; null = paquete suelto (sin familia). */
  family: string | null;
  role: CatalogRole;
  functions: CatalogFunction[];
  origin: CatalogOrigin;
  summary: string;
  aur: boolean;
}
