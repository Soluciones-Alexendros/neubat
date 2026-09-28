import type { CatalogFunction, CatalogItem, CatalogOrigin } from '@/types';

/** Etiquetas legibles de la taxonomía cerrada de funciones. */
export const FUNCTION_LABELS: Record<CatalogFunction, string> = {
  internet: 'Internet',
  multimedia: 'Multimedia',
  audio: 'Audio',
  desarrollo: 'Desarrollo',
  seguridad: 'Seguridad',
  red: 'Red',
  escritorio: 'Escritorio',
  graficos: 'Gráficos',
  sistema: 'Sistema',
  contenedores: 'Contenedores',
  utilidades: 'Utilidades',
  documentos: 'Documentos',
  datos: 'Bases de datos',
};

/** Nombres visibles de las familias (los ids del catálogo son kebab-case en español). */
export const FAMILY_LABELS: Record<string, string> = {
  navegadores: 'Navegadores',
  escritorio: 'Escritorio y ventanas',
  desarrollo: 'Desarrollo',
  contenedores: 'Contenedores',
  red: 'Red y servicios',
  multimedia: 'Multimedia',
  audio: 'Audio',
  graficos: 'Gráficos',
  ofimatica: 'Ofimática y documentos',
  seguridad: 'Seguridad',
  sistema: 'Sistema',
  utilidades: 'Utilidades',
};

export const LOOSE_LABEL = 'Sueltos';

export interface OriginFilter {
  functions: CatalogFunction[];
  origin: CatalogOrigin | 'all';
}

/** Búsqueda por nombre y resumen (insensible a mayúsculas y acentos de la consulta). */
export function searchCatalog(items: CatalogItem[], query: string): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q)
  );
}

export interface HighlightPart {
  text: string;
  hit: boolean;
}

/** Trocea un texto para resaltar los fragmentos que coinciden con la búsqueda. */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const parts: HighlightPart[] = [];
  let index = 0;
  while (index <= lower.length) {
    const found = lower.indexOf(q, index);
    if (found === -1) {
      parts.push({ text: text.slice(index), hit: false });
      break;
    }
    if (found > index) parts.push({ text: text.slice(index, found), hit: false });
    parts.push({ text: text.slice(found, found + q.length), hit: true });
    index = found + q.length;
  }
  return parts.filter((part) => part.text.length > 0);
}

/** Filtro por funciones (multi-etiqueta) y por origen. */
export function filterCatalog(items: CatalogItem[], filter: OriginFilter): CatalogItem[] {
  return items.filter((item) => {
    if (filter.origin !== 'all' && item.origin !== filter.origin) return false;
    if (filter.functions.length === 0) return true;
    return filter.functions.every((fn) => item.functions.includes(fn));
  });
}

export interface FamilyGroup {
  id: string;
  label: string;
  items: CatalogItem[];
}

export interface CatalogGroups {
  families: FamilyGroup[];
  /** Paquetes sin familia, en el orden recibido. */
  loose: CatalogItem[];
}

/** Agrupa por familia ordenada por nombre visible; los sueltos van aparte. */
export function groupByFamily(items: CatalogItem[]): CatalogGroups {
  const byFamily = new Map<string, CatalogItem[]>();
  const loose: CatalogItem[] = [];
  for (const item of items) {
    if (item.family === null) {
      loose.push(item);
    } else {
      const list = byFamily.get(item.family) ?? [];
      list.push(item);
      byFamily.set(item.family, list);
    }
  }
  const families = Array.from(byFamily.entries())
    .map(([id, familyItems]) => ({
      id,
      label: FAMILY_LABELS[id] ?? id,
      items: [...familyItems].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  return { families, loose };
}

export interface OriginCount {
  official: number;
  aur: number;
  /** Seleccionados que no están en el catálogo (se tratan como oficiales al enviar). */
  other: number;
  total: number;
  officialPct: number;
  aurPct: number;
}

/** Reparte una selección de nombres entre repositorios oficiales y AUR. */
export function countOrigins(items: CatalogItem[], selection: string[]): OriginCount {
  const byName = new Map(items.map((item) => [item.name, item]));
  let official = 0;
  let aur = 0;
  let other = 0;
  for (const name of selection) {
    const item = byName.get(name);
    if (!item) other += 1;
    else if (item.origin === 'aur') aur += 1;
    else official += 1;
  }
  const total = selection.length;
  return {
    official,
    aur,
    other,
    total,
    officialPct: total === 0 ? 0 : Math.round((official / total) * 100),
    aurPct: total === 0 ? 0 : Math.round((aur / total) * 100),
  };
}

/** Unión acumulativa: añade los del preset conservando los ya elegidos, sin duplicados. */
export function mergeSelection(current: string[], preset: string[]): string[] {
  const merged = [...current];
  for (const name of preset) {
    if (!merged.includes(name)) merged.push(name);
  }
  return merged;
}

/** Separa la selección en packages (oficiales) y aur_packages según el origen. */
export function splitSelection(
  items: CatalogItem[],
  selection: string[]
): { packages: string[]; aur_packages: string[] } {
  const byName = new Map(items.map((item) => [item.name, item]));
  const packages: string[] = [];
  const aur_packages: string[] = [];
  for (const name of selection) {
    if (byName.get(name)?.origin === 'aur') aur_packages.push(name);
    else packages.push(name);
  }
  return { packages, aur_packages };
}
