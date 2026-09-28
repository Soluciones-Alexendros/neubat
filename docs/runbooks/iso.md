# Runbook: ISO híbrida

### Propósito de este documento

- **Objetivos:** Construir y diagnosticar la ISO autoinstalable sin convertir el job en required de cada PR.
- **Estructura:** Cuándo usarlo → comando → fallos habituales → artefactos.
- **Contenido a integrar según contexto:** El workflow `.github/workflows/build-iso.yml` es opt-in (`workflow_dispatch` / tags `v*`). No lo marques required. No subas la ISO al git.

## Cuándo

- Release o prueba de arranque UEFI/BIOS
- Cambio en `scripts/build-iso.sh`, `iso/airootfs/` o el hook `neubat-autoinstall`

No forma parte de `quality` / `test` / `smoke`. QEMU e2e (`make test-vm`) es otro opt-in (~40 min).

## Comando

```bash
make build-iso          # TAG=1.0.0 por defecto
# out/neubat-1.0.0-x86_64.iso
```

Requiere Docker. El workflow de GitHub sube el ISO + SHA256 como artefacto (7 días) y, en tags `v*`, crea el Release.

## Validación tras el build

El workflow ejecuta siempre, tras construir, la validación estática
(`scripts/validate-iso.sh`): formato ISO 9660, checksum SHA-256 si hay
`.sha256`, kernel/initramfs de arranque y contenido del airootfs (squashfs):
repo inyectado en `/opt/neubat`, los cinco perfiles, el servicio
`neubat-autoinstall` con su symlink y el tamaño mínimo. Requiere `xorriso` y
`unsquashfs`.

```bash
make validate-iso                      # valida out/neubat-<TAG>-x86_64.iso
bash scripts/validate-iso.sh otra.iso  # ruta concreta
```

Además, el `workflow_dispatch` del workflow ofrece el input `boot_smoke`: un
smoke de arranque en QEMU que verifica que la ISO propia bootea y que el hook
`neubat-autoinstall` se activa con `neubat_token` en el cmdline. En local:

```bash
make test-iso-boot   # usa la ISO más reciente de out/ (opt-in, ~5-15 min)
```

Es mucho más rápido que la e2e completa (`make test-vm`, ~40 min, que sigue
usando la ISO oficial de Arch para instalar sobre NVMe). Ver
[tests/vm/README.md](../../tests/vm/README.md).

## Fallos habituales

| Señal | Acción |
| ----- | ------ |
| Docker no disponible | Instala el daemon o usa el workflow `workflow_dispatch` |
| Espacio en disco | La ISO ronda 1.6 GB; limpia `out/` |
| Hook no arranca | Revisa `iso/airootfs/.../neubat-autoinstall.service` y el cmdline `neubat_token` |
| `Failed to start NEUBAT autoinstall` sin más salida | El hook no es ejecutable en el airootfs (`validate-iso.sh` lo detecta; `chmod +x` en el repo) |
| Hash no coincide | Compara con `*.iso.sha256` de la release; no reutilices ISOs a medias |

## Artefactos

`out/` está en `.gitignore`. Publica solo vía GitHub Release, no en el árbol.
