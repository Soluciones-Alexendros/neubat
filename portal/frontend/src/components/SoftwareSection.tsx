import { useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import type { CatalogFunction, CatalogItem, CatalogOrigin } from '@/types';
import {
  countOrigins,
  filterCatalog,
  groupByFamily,
  highlightParts,
  searchCatalog,
  FUNCTION_LABELS,
  LOOSE_LABEL,
} from '@/lib/catalog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SoftwareSectionProps {
  catalog: CatalogItem[];
  selected: string[];
  onToggle: (name: string) => void;
}

const ORIGIN_OPTIONS: { value: CatalogOrigin | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos los orígenes' },
  { value: 'extra', label: 'Oficiales (extra/multilib)' },
  { value: 'aur', label: 'AUR' },
];

export function SoftwareSection({ catalog, selected, onToggle }: SoftwareSectionProps) {
  const [query, setQuery] = useState('');
  const [functionFilter, setFunctionFilter] = useState<CatalogFunction[]>([]);
  const [originFilter, setOriginFilter] = useState<CatalogOrigin | 'all'>('all');
  const [openFamily, setOpenFamily] = useState<string | null>(null);

  const searching = query.trim().length > 0;

  const filtered = useMemo(
    () =>
      filterCatalog(searchCatalog(catalog, query), {
        functions: functionFilter,
        origin: originFilter,
      }),
    [catalog, query, functionFilter, originFilter]
  );

  const groups = useMemo(() => groupByFamily(filtered), [filtered]);
  const origins = useMemo(() => countOrigins(catalog, selected), [catalog, selected]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggleFunction(fn: CatalogFunction) {
    setFunctionFilter((prev) =>
      prev.includes(fn) ? prev.filter((f) => f !== fn) : [...prev, fn]
    );
  }

  function isOpen(id: string) {
    return searching || openFamily === id;
  }

  function selectedIn(items: CatalogItem[]) {
    return items.filter((item) => selectedSet.has(item.name)).length;
  }

  return (
    <fieldset className="space-y-4 rounded-md border border-border p-4">
      <legend className="px-1 text-sm font-medium">Software</legend>

      <div className="space-y-2">
        <Label htmlFor="pkg-search">Buscar en el catálogo</Label>
        <Input
          id="pkg-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="firefox, editor de imágenes…"
        />
      </div>

      <div className="space-y-2">
        <p id="funciones-leyenda" className="text-xs font-medium text-muted-foreground">
          Funciones (un paquete puede tener varias)
        </p>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-labelledby="funciones-leyenda"
        >
          {(Object.entries(FUNCTION_LABELS) as [CatalogFunction, string][]).map(
            ([id, label]) => {
              const active = functionFilter.includes(id);
              return (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  aria-pressed={active}
                  onClick={() => toggleFunction(id)}
                >
                  {label}
                </Button>
              );
            }
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p id="origen-leyenda" className="text-xs font-medium text-muted-foreground">
          Orígenes: extra y multilib son repositorios oficiales de Arch; los paquetes AUR se
          instalan con yay tras el primer arranque si fallan en la instalación desatendida.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="origen-leyenda">
          {ORIGIN_OPTIONS.map((option) => {
            const active = originFilter === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                aria-pressed={active}
                onClick={() => setOriginFilter(option.value)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
        <p className="text-sm font-medium">
          Orígenes de la selección
          {origins.total > 0 && <span className="text-muted-foreground"> ({origins.total})</span>}
        </p>
        {origins.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no has elegido paquetes del catálogo.
          </p>
        ) : (
          <>
            <OriginMeter
              label="Oficiales (extra/multilib)"
              value={origins.official}
              pct={origins.officialPct}
            />
            <OriginMeter label="AUR" value={origins.aur} pct={origins.aurPct} />
            {origins.other > 0 && (
              <p className="text-xs text-muted-foreground">
                +{origins.other} sin clasificar: se envían como oficiales.
              </p>
            )}
          </>
        )}
      </div>

      <p className="text-sm text-muted-foreground" role="status">
        Mostrando {filtered.length} de {catalog.length} paquetes.
      </p>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Familias del catálogo" className="space-y-1 lg:sticky lg:top-4 lg:self-start">
          {groups.families.map((family) => {
            const open = isOpen(family.id);
            return (
              <button
                key={family.id}
                type="button"
                aria-current={open && !searching ? 'true' : undefined}
                onClick={() => setOpenFamily(open && !searching ? null : family.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring aria-current:bg-secondary aria-current:font-medium"
              >
                <span>{family.label}</span>
                <Badge variant="secondary">
                  {selectedIn(family.items)}/{family.items.length}
                </Badge>
              </button>
            );
          })}
          {groups.loose.length > 0 && (
            <button
              type="button"
              aria-current={isOpen('sueltos') && !searching ? 'true' : undefined}
              onClick={() =>
                setOpenFamily(isOpen('sueltos') && !searching ? null : 'sueltos')
              }
              className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring aria-current:bg-secondary aria-current:font-medium"
            >
              <span>{LOOSE_LABEL}</span>
              <Badge variant="secondary">
                {selectedIn(groups.loose)}/{groups.loose.length}
              </Badge>
            </button>
          )}
        </nav>

        <div className="space-y-3">
          {groups.families.map((family) => (
            <FamilyAccordion
              key={family.id}
              id={family.id}
              label={family.label}
              items={family.items}
              open={isOpen(family.id)}
              selectedSet={selectedSet}
              query={query}
              onToggle={onToggle}
              onToggleOpen={() =>
                setOpenFamily(openFamily === family.id ? null : family.id)
              }
            />
          ))}
          {groups.loose.length > 0 && (
            <FamilyAccordion
              id="sueltos"
              label={LOOSE_LABEL}
              items={groups.loose}
              open={isOpen('sueltos')}
              selectedSet={selectedSet}
              query={query}
              onToggle={onToggle}
              onToggleOpen={() =>
                setOpenFamily(openFamily === 'sueltos' ? null : 'sueltos')
              }
            />
          )}
          {filtered.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Sin resultados para «{query.trim()}». Prueba con otra búsqueda o quita filtros.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="packages_extra">Paquetes adicionales (separados por espacio)</Label>
        <Input id="packages_extra" name="packages_extra" placeholder="btop ripgrep" />
        <p className="text-xs text-muted-foreground">
          Se suman a los paquetes del catálogo y van siempre a los repositorios oficiales.
        </p>
      </div>
    </fieldset>
  );
}

interface FamilyAccordionProps {
  id: string;
  label: string;
  items: CatalogItem[];
  open: boolean;
  selectedSet: Set<string>;
  query: string;
  onToggle: (name: string) => void;
  onToggleOpen: () => void;
}

function FamilyAccordion({
  id,
  label,
  items,
  open,
  selectedSet,
  query,
  onToggle,
  onToggleOpen,
}: FamilyAccordionProps) {
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        id={`fam-${id}-cabecera`}
        aria-expanded={open}
        aria-controls={`fam-${id}-panel`}
        onClick={onToggleOpen}
        className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-medium hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" aria-hidden />
          {label}
        </span>
        <Badge variant="secondary">
          {items.filter((item) => selectedSet.has(item.name)).length}/{items.length}
        </Badge>
      </button>
      {open && (
        <div
          id={`fam-${id}-panel`}
          role="region"
          aria-labelledby={`fam-${id}-cabecera`}
          className="space-y-1 border-t border-border p-3"
        >
          {items.map((item) => (
            <PackageRow
              key={item.name}
              item={item}
              checked={selectedSet.has(item.name)}
              query={query}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PackageRowProps {
  item: CatalogItem;
  checked: boolean;
  query: string;
  onToggle: (name: string) => void;
}

function PackageRow({ item, checked, query, onToggle }: PackageRowProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={checked}
        onChange={() => onToggle(item.name)}
      />
      <span className="flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          <Highlight text={item.name} query={query} className="font-mono" />
          {item.aur && (
            <Badge variant="outline" title="Arch User Repository">
              AUR
            </Badge>
          )}
        </span>
        <span className="block text-xs text-muted-foreground">
          <Highlight text={item.summary} query={query} />
        </span>
        <span className="flex flex-wrap gap-1">
          {item.functions.map((fn) => (
            <Badge key={fn} variant="secondary" className="text-[10px]">
              {FUNCTION_LABELS[fn]}
            </Badge>
          ))}
        </span>
      </span>
    </label>
  );
}

function Highlight({ text, query, className }: { text: string; query: string; className?: string }) {
  const parts = highlightParts(text, query);
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="rounded-sm bg-primary/20 px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </span>
  );
}

function OriginMeter({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {value} · {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${label}: ${pct}%`}
        className="h-2 overflow-hidden rounded-full bg-secondary"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
