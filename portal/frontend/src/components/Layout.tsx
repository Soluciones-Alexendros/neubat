import { Brand } from './Brand';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Download, Moon, Shield, Sun, UserRound, Wand2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useEffect, useState } from 'react';

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('neubat-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('neubat-theme', theme);
  }, [theme]);

  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={theme === 'dark'}
      aria-label={next === 'dark' ? 'Activar tema oscuro' : 'Activar tema claro'}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" aria-hidden /> : <Moon className="mr-2 h-4 w-4" aria-hidden />}
      {theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
    </Button>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const { user } = useAuth();

  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'NEUBAT — Arch Linux personalizado',
      '/configurar': 'Configurar instalación · NEUBAT',
      '/cuenta': 'Cuenta · NEUBAT',
      '/descargar': 'Descargar ISO · NEUBAT',
      '/admin': 'Administración · NEUBAT',
    };
    document.title = titles[location.pathname] || 'NEUBAT';
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Brand admin={isAdmin} />
          <nav className="flex flex-wrap items-center gap-1" aria-label="Principal">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">Inicio</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/configurar">
                <Wand2 className="mr-2 h-4 w-4" aria-hidden />
                Configurar
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/descargar">
                <Download className="mr-2 h-4 w-4" aria-hidden />
                Descargar
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/cuenta">
                <UserRound className="mr-2 h-4 w-4" aria-hidden />
                {user ? user.display_name : 'Cuenta'}
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin">
                <Shield className="mr-2 h-4 w-4" aria-hidden />
                Admin
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href="/wiki.html">
                <BookOpen className="mr-2 h-4 w-4" aria-hidden />
                Wiki
              </a>
            </Button>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        {children}
      </main>

      <footer className="border-t border-border py-4 text-center text-sm text-muted-foreground">
        NEUBAT v2.0.0 · GPL-3.0 ·{' '}
        <a href="/wiki.html" className="text-primary hover:underline">
          Wiki
        </a>
      </footer>
    </div>
  );
}
