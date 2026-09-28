import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { FALLBACK_CATALOG } from '@/lib/catalog-fallback';
import { mergeSelection, splitSelection } from '@/lib/catalog';
import { downloadInstallJson } from '@/lib/install-config';
import { pathAnnouncement, pathsFromRecommendations, type Intent } from '@/lib/paths';
import { useAuth } from '@/lib/auth';
import type { CatalogItem, InstallRequest, InstallResponse, Recommendation } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SoftwareSection } from '@/components/SoftwareSection';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle, Copy, History, Shield, Terminal } from 'lucide-react';

const DESKTOPS = [
  { value: 'none', label: 'Sin escritorio' },
  { value: 'kde', label: 'KDE Plasma' },
  { value: 'gnome', label: 'GNOME' },
  { value: 'xfce', label: 'Xfce' },
  { value: 'hyprland', label: 'Hyprland' },
  { value: 'sway', label: 'Sway' },
  { value: 'i3', label: 'i3' },
  { value: 'niri', label: 'niri' },
];

export function ConfigurePage() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InstallResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enableEncryption, setEnableEncryption] = useState(true);
  const [encryptionMethod, setEncryptionMethod] = useState<'keyfile' | 'prompt'>('keyfile');
  const [enableSnapshots, setEnableSnapshots] = useState(true);
  const [desktop, setDesktop] = useState('kde');
  const [profile, setProfile] = useState('production');
  const [selectedPackages, setSelectedPackages] = useState<string[]>(['git', 'htop']);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>(FALLBACK_CATALOG);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [intent, setIntent] = useState<Intent>('daily');
  const [saveName, setSaveName] = useState('');
  const [localBody, setLocalBody] = useState<InstallRequest | null>(null);

  useEffect(() => {
    api
      .catalog()
      .then((items) => {
        setCatalogItems(items);
      })
      .catch(() => {
        setCatalogItems(FALLBACK_CATALOG);
      });
  }, []);

  useEffect(() => {
    api
      .recommendations()
      .then((r) => {
        setRecommendations(r.recommendations);
      })
      .catch(() => {
        setRecommendations([]);
      });
  }, []);

  const paths = useMemo(() => pathsFromRecommendations(recommendations), [recommendations]);
  const activePath = paths.find((item) => item.intent === intent) ?? paths[0];

  useEffect(() => {
    setProfile(activePath.profile);
    setDesktop(activePath.desktop);
    setEnableEncryption(activePath.encryption.enabled);
    setEncryptionMethod(activePath.encryption.method === 'passphrase' ? 'prompt' : 'keyfile');
    setEnableSnapshots(activePath.snapshots.enabled);
    let cancelled = false;
    api
      .profile(activePath.profile)
      .then((profileJson) => {
        if (cancelled) return;
        // Merge acumulativo: el preset suma a lo ya elegido, no lo sobrescribe.
        const preset = [...(profileJson.packages ?? []), ...(profileJson.aur_packages ?? [])];
        if (preset.length) {
          setSelectedPackages((prev) => mergeSelection(prev, preset));
        }
      })
      .catch(() => {
        /* Sin portal se conservan los paquetes ya elegidos. */
      });
    return () => {
      cancelled = true;
    };
  }, [activePath]);

  function togglePackage(pkg: string) {
    setSelectedPackages((prev) =>
      prev.includes(pkg) ? prev.filter((x) => x !== pkg) : [...prev, pkg]
    );
  }

  function applyHyprland() {
    const hyprland = recommendations.find((rec) => rec.id === 'hyprland');
    setProfile('base');
    setDesktop('hyprland');
    setEnableEncryption(false);
    setEnableSnapshots(false);
    if (hyprland?.packages?.length) {
      setSelectedPackages((prev) => mergeSelection(prev, hyprland.packages ?? []));
    }
  }

  function buildBody(form: HTMLFormElement): InstallRequest {
    const data = new FormData(form);
    const extra = ((data.get('packages_extra') as string) || '').split(/\s+/).filter(Boolean);
    const split = splitSelection(catalogItems, selectedPackages);
    const body: InstallRequest = {
      profile: profile || 'base',
      hostname: (data.get('hostname') as string) || undefined,
      username: (data.get('username') as string) || undefined,
      password: (data.get('password') as string) || undefined,
      desktop,
      packages: [...new Set([...split.packages, ...extra])],
      ...(split.aur_packages.length ? { aur_packages: [...new Set(split.aur_packages)] } : {}),
      locale: (data.get('locale') as string) || 'es_ES.UTF-8',
      keyboard: (data.get('keyboard') as string) || 'es',
      timezone: (data.get('timezone') as string) || 'Europe/Madrid',
    };
    if (enableEncryption) {
      const passphrase = (data.get('luks_passphrase') as string) || undefined;
      body.encryption = {
        enabled: true,
        method: encryptionMethod === 'prompt' ? 'interactive' : 'keyfile',
        ...(passphrase ? { passphrase } : {}),
      };
    }
    if (enableSnapshots) body.snapshots = { enabled: true };
    return body;
  }

  function handleDownload(form: HTMLFormElement) {
    const body = buildBody(form);
    setLocalBody(body);
    setError(null);
    downloadInstallJson(body);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    const body = buildBody(e.currentTarget);

    try {
      const data = await api.install(body);
      setResult(data);
      setLocalBody(null);
      if (user && saveName.trim()) {
        try {
          await api.saveConfig({ name: saveName.trim(), ...body });
        } catch {
          setError('La instalación quedó en el portal, pero no se pudo guardar en la cuenta.');
        }
      }
    } catch (err) {
      setResult(null);
      if (err instanceof TypeError) {
        setLocalBody(body);
        downloadInstallJson(body);
      } else {
        setLocalBody(null);
        setError(err instanceof Error ? err.message : 'No se pudo crear la instalación');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
  }

  const base = window.location.origin;

  return (
    <div className="space-y-6">
      <section className="space-y-6" aria-labelledby="config-heading">
        <div className="space-y-2">
          <h1 id="config-heading" className="text-3xl font-bold tracking-tight">
            Configurar instalación
          </h1>
          <p className="text-muted-foreground">
            Elige escritorio, paquetes y opciones. Si el portal responde, registra la instalación. Si no,
            descarga el JSON y úsalo cuando el portal esté en marcha.
          </p>
          <p className="text-sm text-foreground">
            Instalar por iPXE sigue exigiendo el portal. Este asistente no arranca la máquina por sí solo.
          </p>
          {!user && (
            <p className="text-sm text-muted-foreground" role="status">
              Puedes generar una instalación sin sesión.{' '}
              <Link className="text-primary underline-offset-4 hover:underline" to="/cuenta">
                Inicia sesión
              </Link>{' '}
              para guardar configuraciones y absorciones.
            </p>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" aria-hidden />
              Formulario
            </CardTitle>
            <CardDescription>Los campos alimentan archinstall y los scripts NEUBAT.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Para qué es este equipo</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {paths.map((path) => (
                    <label
                      key={path.intent}
                      className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border border-border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                    >
                      <input
                        type="radio"
                        name="intent"
                        value={path.intent}
                        checked={intent === path.intent}
                        onChange={() => setIntent(path.intent)}
                        className="mt-1 h-4 w-4"
                      />
                      <span>
                        <span className="block font-medium">{path.title}</span>
                        <span className="block text-xs text-muted-foreground">{path.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p role="status" className="text-sm text-foreground">
                  {pathAnnouncement(activePath)}
                </p>
                <Button type="button" variant="outline" className="min-h-11" onClick={applyHyprland}>
                  Ajustar: Hyprland
                </Button>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile">Perfil base</Label>
                  <Select value={profile} onValueChange={setProfile}>
                    <SelectTrigger id="profile">
                      <SelectValue placeholder="Perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="production">Producción</SelectItem>
                      <SelectItem value="developer">Desarrollo</SelectItem>
                      <SelectItem value="base">Base</SelectItem>
                      <SelectItem value="minimal">Minimal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desktop">Escritorio / WM</Label>
                  <Select value={desktop} onValueChange={setDesktop}>
                    <SelectTrigger id="desktop">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DESKTOPS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hostname">Hostname</Label>
                  <Input id="hostname" name="hostname" placeholder="mi-equipo" pattern="[a-z0-9-]+" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Usuario</Label>
                  <Input id="username" name="username" placeholder="neubat" pattern="[a-z_][a-z0-9_-]*" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña del usuario</Label>
                <Input id="password" name="password" type="password" autoComplete="new-password" placeholder="No uses neubat si cifras el disco" />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="locale">Locale</Label>
                  <Input id="locale" name="locale" defaultValue="es_ES.UTF-8" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="keyboard">Teclado</Label>
                  <Input id="keyboard" name="keyboard" defaultValue="es" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Zona horaria</Label>
                  <Input id="timezone" name="timezone" defaultValue="Europe/Madrid" />
                </div>
              </div>

              <SoftwareSection
                catalog={catalogItems}
                selected={selectedPackages}
                onToggle={togglePackage}
              />

              <div className="rounded-md border border-border bg-secondary/30 p-4 space-y-4">
                <h2 className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" aria-hidden />
                  Opciones avanzadas
                </h2>
                <div className="flex items-start gap-3">
                  <input
                    id="enable-encryption"
                    type="checkbox"
                    checked={enableEncryption}
                    onChange={(e) => setEnableEncryption(e.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="enable-encryption" className="font-normal">
                      Cifrar disco con LUKS2
                    </Label>
                    {enableEncryption && (
                      <>
                        <Select
                          value={encryptionMethod}
                          onValueChange={(v) => setEncryptionMethod(v as 'keyfile' | 'prompt')}
                        >
                          <SelectTrigger className="w-full sm:w-64" aria-label="Método de cifrado">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="keyfile">Keyfile en /boot</SelectItem>
                            <SelectItem value="prompt">Frase interactiva al arrancar</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          id="luks_passphrase"
                          name="luks_passphrase"
                          type="password"
                          autoComplete="new-password"
                          placeholder="Passphrase LUKS (no uses neubat)"
                        />
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <input
                    id="enable-snapshots"
                    type="checkbox"
                    checked={enableSnapshots}
                    onChange={(e) => setEnableSnapshots(e.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <Label htmlFor="enable-snapshots" className="font-normal flex items-center gap-2">
                    <History className="h-3.5 w-3.5" aria-hidden />
                    Snapshots btrfs
                  </Label>
                </div>
              </div>

              {user && (
                <div className="space-y-2">
                  <Label htmlFor="save-name">Guardar en mi cuenta como (opcional)</Label>
                  <Input
                    id="save-name"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="mi-laptop-hyprland"
                  />
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? 'Generando…' : 'Generar instalación'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={(e) => {
                    const form = e.currentTarget.form;
                    if (form) handleDownload(form);
                  }}
                >
                  Descargar JSON
                </Button>
              </div>
            </form>

            {error && (
              <div role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {localBody && (
              <div role="status" className="mt-4 space-y-3 rounded-md border border-border bg-muted p-4">
                <p className="font-medium">Modo local: el portal no ha registrado esta instalación.</p>
                <p className="text-sm text-muted-foreground">
                  El JSON ya se puede descargar. Instalar por iPXE sigue exigiendo el portal: sin{' '}
                  <code className="font-mono">boot_url</code> la máquina no arranca por red.
                </p>
                <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-3 text-xs">
                  {JSON.stringify(localBody, null, 2)}
                </pre>
              </div>
            )}
            {result && (
              <div role="status" className="mt-4 space-y-3 rounded-md border border-primary/30 bg-primary/10 p-4">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle className="h-5 w-5" aria-hidden />
                  <span className="font-medium">Instalación creada</span>
                </div>
                <CopyField label="Token" value={result.token} onCopy={copy} />
                <CopyField label="URL de arranque iPXE" value={base + result.boot_url} onCopy={copy} />
                <CopyField label="URL de configuración" value={base + result.config_url} onCopy={copy} />
                <p className="text-sm text-muted-foreground">
                  También puedes{' '}
                  <Link className="text-primary underline-offset-4 hover:underline" to="/descargar">
                    descargar la ISO
                  </Link>{' '}
                  con verificación de hash.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

    </div>
  );
}

function CopyField({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 rounded-md border border-border bg-background p-2">
        <code className="flex-1 truncate text-xs font-mono">{value}</code>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onCopy(value)} aria-label={`Copiar ${label}`}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
