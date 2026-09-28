#!/usr/bin/env python3
"""
NEUBAT - Smoke de arranque de la ISO propia en QEMU.

Verifica que la ISO NEUBAT generada (no la ISO oficial de Arch):
  1. Arranca el entorno live (kernel + initramfs + squashfs del propio ISO).
  2. El hook neubat-autoinstall se activa al pasar neubat_token en el cmdline
     y lanza el instalador maestro (banner NEUBAT vX.Y.Z).

No completa la instalación (eso es tests/vm/neubat_vm_test.py, ~40 min):
en cuanto se confirma el arranque + el hook, se detiene la VM.

Requisitos del host: qemu-system-x86_64, OVMF, pexpect, xorriso, blkid, python3.
KVM se usa si /dev/kvm es accesible; si no, TCG (más lento).

Uso:   python3 tests/vm/boot_iso_smoke.py
Variables de entorno (valores por defecto entre paréntesis):
  NEUBAT_ISO        Ruta de la ISO (la más reciente de out/neubat-*-x86_64.iso)
  NEUBAT_VM_DIR     Directorio de trabajo (/tmp/neubat-iso-smoke)
  NEUBAT_TIMEOUT    Segundos máximos de espera del arranque (900)
"""
import glob
import os
import secrets
import shutil
import subprocess
import sys
import time

import pexpect

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def default_iso():
    candidates = sorted(glob.glob(os.path.join(REPO, "out", "neubat-*-x86_64.iso")),
                        key=os.path.getmtime)
    if not candidates:
        sys.exit("No hay ninguna ISO en out/. Ejecuta antes: make build-iso")
    return candidates[-1]


ISO = os.environ.get("NEUBAT_ISO", default_iso())
VM = os.environ.get("NEUBAT_VM_DIR", "/tmp/neubat-iso-smoke")
TIMEOUT = int(os.environ.get("NEUBAT_TIMEOUT", "900"))
OVMF_CODE = "/usr/share/OVMF/OVMF_CODE_4M.fd"
OVMF_VARS = "/usr/share/OVMF/OVMF_VARS_4M.fd"


def log(msg):
    print(f"[iso-smoke {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def check_requirements():
    for tool in ("qemu-system-x86_64", "xorriso", "blkid"):
        if shutil.which(tool) is None:
            sys.exit(f"FALLO: {tool} no está instalado")
    for path in (OVMF_CODE, OVMF_VARS):
        if not os.path.exists(path):
            sys.exit(f"FALLO: no existe {path} (instala OVMF)")
    if not os.path.exists(ISO):
        sys.exit(f"FALLO: no existe la ISO {ISO}")
    try:
        import pexpect  # noqa: F401
    except ImportError:
        sys.exit("FALLO: falta el módulo python pexpect")


def iso_label():
    out = subprocess.run(["blkid", "-o", "value", "-s", "LABEL", ISO],
                         capture_output=True, text=True)
    label = out.stdout.strip()
    if not label:
        sys.exit(f"No se pudo leer la etiqueta del ISO {ISO}")
    return label


def prepare_workdir():
    os.makedirs(VM, exist_ok=True)
    # Kernel e initramfs del propio ISO para arranque directo con consola serie.
    # El medio -cdrom queda attachado: los hooks archiso leen el squashfs del ISO,
    # así validamos que el contenido del ISO es legible y arrancable.
    for member, dest in [("/arch/boot/x86_64/vmlinuz-linux", "vmlinuz-linux"),
                         ("/arch/boot/x86_64/initramfs-linux.img", "initramfs-linux.img")]:
        subprocess.run(["xorriso", "-osirrox", "on", "-indev", ISO,
                        "-extract", member, os.path.join(VM, dest)],
                       check=True, capture_output=True)
    shutil.copy(OVMF_VARS, os.path.join(VM, "vars.fd"))


def qemu_cmd(label, token):
    accel = ["-enable-kvm", "-cpu", "host"] if os.access("/dev/kvm", os.W_OK) \
        else ["-cpu", "max"]
    return [
        "qemu-system-x86_64", "-machine", "q35", *accel,
        "-m", "2048", "-smp", "2",
        "-drive", f"if=pflash,format=raw,readonly=on,file={OVMF_CODE}",
        "-drive", f"if=pflash,format=raw,file={VM}/vars.fd",
        "-cdrom", ISO,
        "-kernel", os.path.join(VM, "vmlinuz-linux"),
        "-initrd", os.path.join(VM, "initramfs-linux.img"),
        "-append", (f"archisobasedir=arch archisolabel={label} console=ttyS0 "
                    f"cow_spacesize=1G "
                    f"neubat_token={token} neubat_profile=base"),
        "-netdev", "user,id=n0", "-device", "e1000,netdev=n0",
        "-nographic",
    ]


def main():
    check_requirements()
    prepare_workdir()
    console = open(os.path.join(VM, "console.log"), "wb")
    token = secrets.token_hex(16)
    label = iso_label()
    log(f"ISO: {ISO} (label {label})")
    log(f"Token de prueba: {token[:8]}…")

    cmd = qemu_cmd(label, token)
    vm = pexpect.spawn(cmd[0], cmd[1:], encoding=None, timeout=120)
    vm.logfile = console

    boot_ok = False
    hook_ok = False
    deadline = time.time() + TIMEOUT
    try:
        while time.time() < deadline and not (boot_ok and hook_ok):
            i = vm.expect([rb"archiso login:",
                           rb"\[neubat-autoinstall\] Token:",
                           rb"Instalador Desatendido",
                           rb"\[neubat-autoinstall\] No se detect",
                           rb"\[ERROR\]",
                           pexpect.TIMEOUT, pexpect.EOF], timeout=120)
            if i == 0:
                boot_ok = True
                log("Entorno live arrancado (login de archiso)")
            elif i == 1:
                hook_ok = True
                log("Hook neubat-autoinstall activado con el token del cmdline")
            elif i == 2:
                log("Instalador maestro neubat-install.sh en ejecución")
                if hook_ok:
                    boot_ok = True
            elif i == 3:
                vm.close(force=True)
                sys.exit("FALLO: el hook no detectó neubat_token en el cmdline")
            elif i == 4:
                # [ERROR] del instalador tras arrancar: la fase de descarga de
                # config necesita un portal real, fuera del alcance del smoke.
                if hook_ok:
                    log("[ERROR] del instalador después de activar el hook "
                        "(esperable sin portal; el arranque ya está validado)")
                    break
                vm.close(force=True)
                sys.exit("FALLO: [ERROR] en consola antes de activar el hook")
            elif i == 5:
                log("...esperando arranque...")
            else:
                vm.close(force=True)
                sys.exit(f"FALLO: la VM se cerró antes de completar el smoke "
                         f"(ver {VM}/console.log)")
    finally:
        vm.close(force=True)
        console.close()

    if not hook_ok:
        sys.exit("FALLO: el hook neubat-autoinstall no se activó "
                 f"en {TIMEOUT}s (ver {VM}/console.log)")
    if not boot_ok:
        sys.exit("FALLO: el entorno live no llegó a arrancar "
                 f"en {TIMEOUT}s (ver {VM}/console.log)")

    log("ISO booteable y hook de autoinstalación verificado")
    print("RESULT=PASS")


if __name__ == "__main__":
    main()
