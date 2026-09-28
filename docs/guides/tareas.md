# Tareas — próximas y objetivos

### Propósito de este documento

- **Objetivos:** Listar las tareas inmediatas derivadas del cierre de las alertas de code-scanning y del backlog, con objetivo verificable y traza.
- **Estructura:** Tareas abiertas → cerradas recientes → criterio de cierre.
- **Contenido a integrar según contexto:** Actualiza al cerrar una tarea. Vincula a [roadmap.md](./roadmap.md) y [roadmap-mejoras.md](./roadmap-mejoras.md). No copies tareas de otro repo.

## Tareas abiertas

| # | Tarea | Objetivo | Traza | Estado |
|---|-------|----------|-------|--------|
| T1 | Verificar que las 10 alertas de code-scanning cierran tras el próximo scan de CI | 0 alertas `open` en Security → Code scanning | `security.yml`, supresiones `// codeql[...]` del 28-sep-2026 | Pendiente |
| T2 | Limpiar warnings de oxlint del frontend | `make lint` sin `only-export-components`, `set-state-in-effect` ni `exhaustive-deps` | `src/pages/AdminPage.tsx`, `ConfigurePage.tsx`, `src/components/ui/*`, `src/lib/auth.tsx` | Pendiente |
| T3 | Tests frontend de AdminPage, DownloadPage y AccountPage | Cobertura Vitest de las pantallas sin testear | M10 de roadmap-mejoras.md | Pendiente |
| T4 | Validación de esquema de perfiles `configs/*.json` en `make validate` | `make validate` falla si un perfil no cumple el esquema | M11 de roadmap-mejoras.md | Pendiente |
| T5 | Si una supresión CodeQL no cierra su alerta, descartarla en la UI con justificación | Alerta cerrada por vía UI y documentada | Alerta concreta de code-scanning | Contingencia |

## Tareas cerradas recientes

| # | Tarea | Objetivo | Estado |
|---|-------|----------|--------|
| S1 | Cerrar las 10 alertas de code-scanning abiertas | Ver M14 en roadmap-mejoras.md | ✅ Hecho (28-sep-2026) |

## Criterio de cierre

Una tarea queda cerrada cuando su objetivo es verificable por CI (`make lint`, `make test`, `make validate`) o por el panel de code-scanning de GitHub, y la traza (PR/issue/ADR) queda enlazada en la fila correspondiente.
