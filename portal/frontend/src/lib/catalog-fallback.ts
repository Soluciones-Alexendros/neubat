import type { CatalogItem } from '@/types';

/**
 * Catálogo mínimo embebido para el modo local/offline.
 * Es la migración de los antiguos grupos fijos del configurador
 * (base / red / desarrollo / multimedia) al schema del catálogo versionado.
 */
export const FALLBACK_CATALOG: CatalogItem[] = [
  { name: 'base-devel', family: 'desarrollo', role: 'herramienta', functions: ['desarrollo'], origin: 'extra', summary: 'Grupo de herramientas de compilación (gcc, make…)', aur: false },
  { name: 'git', family: 'desarrollo', role: 'herramienta', functions: ['desarrollo'], origin: 'extra', summary: 'Control de versiones distribuido', aur: false },
  { name: 'vim', family: 'desarrollo', role: 'programa', functions: ['desarrollo'], origin: 'extra', summary: 'Editor de texto modal', aur: false },
  { name: 'nodejs', family: 'desarrollo', role: 'programa', functions: ['desarrollo'], origin: 'extra', summary: 'Runtime JavaScript V8', aur: false },
  { name: 'npm', family: 'desarrollo', role: 'herramienta', functions: ['desarrollo'], origin: 'extra', summary: 'Gestor de paquetes de Node.js', aur: false },
  { name: 'python', family: 'desarrollo', role: 'programa', functions: ['desarrollo'], origin: 'extra', summary: 'Lenguaje Python 3', aur: false },
  { name: 'go', family: 'desarrollo', role: 'programa', functions: ['desarrollo'], origin: 'extra', summary: 'Lenguaje Go y toolchain', aur: false },
  { name: 'rust', family: 'desarrollo', role: 'programa', functions: ['desarrollo'], origin: 'extra', summary: 'Lenguaje Rust y toolchain', aur: false },
  { name: 'htop', family: 'sistema', role: 'programa', functions: ['sistema'], origin: 'extra', summary: 'Monitor interactivo de procesos', aur: false },
  { name: 'reflector', family: 'sistema', role: 'herramienta', functions: ['sistema', 'red'], origin: 'extra', summary: 'Optimización de mirrors de pacman', aur: false },
  { name: 'networkmanager', family: 'red', role: 'servicio', functions: ['red'], origin: 'extra', summary: 'Gestión de conexiones de red', aur: false },
  { name: 'openssh', family: 'red', role: 'servicio', functions: ['red'], origin: 'extra', summary: 'Servidor y cliente SSH', aur: false },
  { name: 'wireguard-tools', family: 'red', role: 'herramienta', functions: ['red', 'seguridad'], origin: 'extra', summary: 'Herramientas de la VPN WireGuard', aur: false },
  { name: 'firefox', family: 'navegadores', role: 'programa', functions: ['internet'], origin: 'extra', summary: 'Navegador web de Mozilla', aur: false },
  { name: 'vlc', family: 'multimedia', role: 'programa', functions: ['multimedia'], origin: 'extra', summary: 'Reproductor multimedia universal', aur: false },
  { name: 'pipewire', family: 'audio', role: 'servicio', functions: ['audio', 'multimedia'], origin: 'extra', summary: 'Servidor de audio y vídeo moderno', aur: false },
  { name: 'wireplumber', family: 'audio', role: 'servicio', functions: ['audio'], origin: 'extra', summary: 'Gestor de sesiones de PipeWire', aur: false },
];
