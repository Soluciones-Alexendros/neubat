#!/usr/bin/env bash
# validate-iso.sh — Validación estática de una ISO NEUBAT generada.
#
# Uso: bash scripts/validate-iso.sh [ruta-iso]
#        (por defecto out/neubat-<TAG>-x86_64.iso)
#
# Comprueba: existencia/formato ISO 9660, checksum SHA-256 (si hay .sha256),
# kernel/initramfs de arranque, y el contenido del airootfs (squashfs):
# repo inyectado en /opt/neubat, perfiles, hook de autoinstalación systemd y
# tamaño mínimo. Requiere xorriso y unsquashfs (mismas dependencias que tests/vm).
set -u

ISO="${1:-out/neubat-${TAG:-2.0.0}-x86_64.iso}"
for tool in xorriso unsquashfs; do
    command -v "$tool" >/dev/null 2>&1 || { echo "FAIL: $tool no instalado"; exit 1; }
done

ok=0
fail=0
pass()  { echo "OK   $1"; ok=$((ok+1)); }
failc() { echo "FAIL $1"; fail=$((fail+1)); }

echo "== Validando $ISO =="

# 1. Existe y es ISO 9660
if [ ! -f "$ISO" ]; then
    failc "no existe: $ISO"
else
    desc="$(file -b "$ISO")"
    case "$desc" in
        *"ISO 9660"*) pass "formato: $desc" ;;
        *) failc "no parece una ISO 9660: $desc" ;;
    esac
fi

# 2. Checksum SHA-256 si existe el .sha256 (comparación de hashes, sin depender
#    del path registrado dentro del fichero .sha256)
if [ -f "$ISO" ] && [ -f "$ISO.sha256" ]; then
    expected="$(awk '{print $1}' "$ISO.sha256")"
    actual="$(sha256sum "$ISO" | awk '{print $1}')"
    if [ -n "$expected" ] && [ "$expected" = "$actual" ]; then
        pass "checksum SHA-256 coincide"
    else
        failc "checksum SHA-256 no coincide (esperado $expected, actual $actual)"
    fi
elif [ -f "$ISO" ]; then
    echo "SKIP sin $(basename "$ISO").sha256 (el workflow build-iso.yml lo genera)"
fi

TMP_ROOT=""
if [ -f "$ISO" ]; then
    TMP_ROOT="$(mktemp -d /tmp/neubat-validate-iso.XXXXXX)"
    trap 'rm -rf "$TMP_ROOT"' EXIT

    # Listado ISO (minúsculas): kernel/initramfs de arranque
    iso_listing="$(xorriso -indev "$ISO" -find / -exec lsdl 2>/dev/null | tr '[:upper:]' '[:lower:]')"
    check_iso() { # $1 = ruta esperada en minúsculas
        if printf '%s\n' "$iso_listing" | grep -qF "$1"; then
            pass "contiene $1"
        else
            failc "falta $1"
        fi
    }
    check_iso "/arch/boot/x86_64/vmlinuz-linux"
    check_iso "/arch/boot/x86_64/initramfs-linux.img"
    check_iso "/arch/x86_64/airootfs.sfs"

    if printf '%s\n' "$iso_listing" | grep -qF "/arch/x86_64/airootfs.sfs"; then
        # 3. Extraer airootfs y validar su contenido
        if xorriso -osirrox on -indev "$ISO" -extract /arch/x86_64/airootfs.sfs \
                "$TMP_ROOT/airootfs.sfs" >/dev/null 2>&1 \
            && [ -s "$TMP_ROOT/airootfs.sfs" ]; then
            pass "airootfs.sfs extraído"
        else
            failc "no se pudo extraer /arch/x86_64/airootfs.sfs"
        fi

        if [ -s "$TMP_ROOT/airootfs.sfs" ]; then
            # Listado del rootfs con permisos (minúsculas, sin prefijo squashfs-root)
            rootfs_listing="$(unsquashfs -ll "$TMP_ROOT/airootfs.sfs" 2>/dev/null \
                | sed 's|^squashfs-root||' | tr '[:upper:]' '[:lower:]')"
            check_rootfs() { # $1 = ruta esperada en minúsculas (con / inicial)
                if printf '%s\n' "$rootfs_listing" | grep -qF "$1"; then
                    pass "airootfs contiene $1"
                else
                    failc "airootfs falta $1"
                fi
            }

            # Repo inyectado (build-iso-inner.sh) + instalador + portal + ansible
            check_rootfs "/opt/neubat/scripts/neubat-install.sh"
            check_rootfs "/opt/neubat/portal/server.js"
            check_rootfs "/opt/neubat/portal/routes/install.js"
            check_rootfs "/opt/neubat/ansible/site.yml"
            check_rootfs "/opt/neubat/configs/base.json"
            check_rootfs "/opt/neubat/configs/developer.json"
            check_rootfs "/opt/neubat/configs/minimal.json"
            check_rootfs "/opt/neubat/configs/production.json"
            check_rootfs "/opt/neubat/configs/vm-luks.json"

            # Hook de autoinstalación (servicio + symlink en multi-user.target.wants)
            check_rootfs "/etc/systemd/system/neubat-autoinstall.service"
            check_rootfs "/etc/systemd/system/multi-user.target.wants/neubat-autoinstall.service"

            # Binario del hook
            check_rootfs "/usr/local/bin/neubat-autoinstall"

            # El hook debe ser ejecutable: ExecStart de systemd falla con 203/EXEC si no
            if printf '%s\n' "$rootfs_listing" \
                    | grep "usr/local/bin/neubat-autoinstall$" | grep -q "^-rwx"; then
                pass "airootfs /usr/local/bin/neubat-autoinstall es ejecutable"
            else
                failc "airootfs /usr/local/bin/neubat-autoinstall no tiene permiso de ejecución"
            fi
        fi
    fi

    # 4. Tamaño mínimo (guarda contra ISOs truncas; la real es ~1.6 GB)
    size="$(stat -c%s "$ISO")"
    if [ "$size" -ge 524288000 ]; then
        pass "tamaño: $((size / 1024 / 1024)) MB (>= 500 MB)"
    else
        failc "tamaño sospechoso: $((size / 1024 / 1024)) MB (< 500 MB)"
    fi
fi

echo "== $ok OK, $fail FAIL =="
[ "$fail" -eq 0 ]
