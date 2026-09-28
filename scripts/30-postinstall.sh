#!/bin/bash
# =============================================================================
# NEUBAT - Fase 3: configuración del sistema (chroot) y aplicaciones
# Módulo cargado por neubat-install.sh (no ejecutar directamente)
# =============================================================================

# Configura crypttab, mkinitcpio y GRUB para el arranque con LUKS.
# Debe ejecutarse antes del chroot para que mkinitcpio -P genere un
# initramfs capaz de abrir los contenedores.
configure_luks() {
    [[ "${ENCRYPTION_ENABLED:-false}" != "true" ]] && return 0

    log "Configurando cifrado LUKS para el arranque..."

    local p_root p_home
    p_root=$(part_name "${DISK}" 2)
    p_home=$(part_name "${DISK}" 3)
    # shellcheck disable=SC2034
    root_uuid=$(blkid -s UUID -o value "${p_root}")
    # shellcheck disable=SC2034
    home_uuid=$(blkid -s UUID -o value "${p_home}")

    if [[ -z "${root_uuid}" || -z "${home_uuid}" ]]; then
        error "No se pudo obtener el UUID de las particiones cifradas"
    fi

    keyfile_path=""
    if [[ "${ENCRYPTION_METHOD}" == "keyfile" ]]; then
        if [[ -z "${LUKS_KEYFILE:-}" || ! -f "${LUKS_KEYFILE}" ]]; then
            error "Método keyfile seleccionado pero no existe LUKS_KEYFILE"
        fi
        # systemd-cryptsetup busca automáticamente /etc/cryptsetup-keys.d/<name>.key
        # tanto en el initramfs (para root) como en el sistema real (para home).
        keyfile_path="/etc/cryptsetup-keys.d/neubat_root.key"
        install -dm 0700 /mnt/etc/cryptsetup-keys.d
        cp "${LUKS_KEYFILE}" /mnt/etc/cryptsetup-keys.d/neubat_root.key
        cp "${LUKS_KEYFILE}" /mnt/etc/cryptsetup-keys.d/neubat_home.key
        chmod 0400 /mnt/etc/cryptsetup-keys.d/neubat_root.key /mnt/etc/cryptsetup-keys.d/neubat_home.key
        log "Keyfiles LUKS copiados a /etc/cryptsetup-keys.d/"
    fi

    # crypttab: systemd-cryptsetup abrirá home tras el initramfs;
    # neubat_root se abre en el initramfs gracias a rd.luks.name y la
    # ubicación automática /etc/cryptsetup-keys.d/neubat_root.key.
    {
        if [[ -n "${keyfile_path}" ]]; then
            printf "neubat_root UUID=%s %s luks\n" "${root_uuid}" "${keyfile_path}"
            printf "neubat_home UUID=%s %s luks\n" "${home_uuid}" "/etc/cryptsetup-keys.d/neubat_home.key"
        else
            printf "neubat_root UUID=%s none luks\n" "${root_uuid}"
            printf "neubat_home UUID=%s none luks\n" "${home_uuid}"
        fi
    } > /mnt/etc/crypttab
    chmod 0600 /mnt/etc/crypttab

    # Añadir hook de cifrado en mkinitcpio.conf.
    # El ISO actual de Arch usa el hook systemd en lugar de udev; en ese
    # caso el hook correspondiente es sd-encrypt. Si no, usamos encrypt.
    # Si usamos keyfile, empaquetarlo en el initramfs para que el hook
    # pueda abrir los contenedores sin montar /boot previamente.
    if [[ -f /mnt/etc/mkinitcpio.conf ]]; then
        local encrypt_hook="encrypt"
        if grep -qE '^HOOKS=.*\bsystemd\b' /mnt/etc/mkinitcpio.conf; then
            encrypt_hook="sd-encrypt"
        fi

        if grep -qE '^HOOKS=.*\bfilesystems\b' /mnt/etc/mkinitcpio.conf; then
            sed -i "s/\(filesystems\)/${encrypt_hook} \1/" /mnt/etc/mkinitcpio.conf
            log "Hook de cifrado añadido: ${encrypt_hook}"
        else
            warning "No se encontró 'filesystems' en HOOKS; añade '${encrypt_hook}' manualmente a mkinitcpio.conf"
        fi

        if [[ -n "${keyfile_path}" ]]; then
            if grep -q '^FILES=' /mnt/etc/mkinitcpio.conf; then
                sed -i "s|^FILES=(|FILES=(${keyfile_path} /etc/cryptsetup-keys.d/neubat_home.key |" /mnt/etc/mkinitcpio.conf
            else
                echo "FILES=(${keyfile_path} /etc/cryptsetup-keys.d/neubat_home.key)" >> /mnt/etc/mkinitcpio.conf
            fi
            log "Keyfiles empaquetados en initramfs"
        fi
    fi

    success "Configuración LUKS preparada"
}

configure_system() {
    log "Configurando sistema en chroot..."

    # La configuración viaja al chroot para trazabilidad (se borra al finalizar)
    cp "${NEUBAT_CONFIG_FILE}" /mnt/root/neubat-config.json

    # Preparar LUKS antes de entrar al chroot para que mkinitcpio lo vea
    configure_luks

    # Opciones del kernel: LUKS (si aplica) + root + parámetros básicos.
    # Se calculan en el entorno live porque el heredoc del chroot expande
    # las variables antes de ejecutarse (set -u en neubat-install.sh).
    luks_options=""
    root_device=""
    if [[ "${ENCRYPTION_ENABLED:-false}" == "true" ]]; then
        luks_options="rd.luks.name=${root_uuid}=neubat_root"
        root_device="/dev/mapper/neubat_root"
    else
        root_device="$(part_name "${DISK}" 2)"
    fi

    # Las variables se pasan al chroot por el entorno. El heredoc usa un
    # delimitador entre comillas (sin expansión en el shell live): los valores
    # controlados por el usuario se tratan como datos, nunca como código.
    # NEUBAT_HOSTNAME evita colisión con la variable especial HOSTNAME de bash.
    export TIMEZONE LOCALE KEYMAP NEUBAT_VERSION NEUBAT_PROFILE NEUBAT_TOKEN \
        ENCRYPTION_ENABLED USERNAME PASSWORD FEATURES_SSH \
        luks_options root_device
    export NEUBAT_HOSTNAME="${HOSTNAME}"
    arch-chroot /mnt /bin/bash <<'EOF'
set -e

# Configuración regional
ln -sf /usr/share/zoneinfo/${TIMEZONE} /etc/localtime
hwclock --systohc

echo "${LOCALE} UTF-8" >> /etc/locale.gen
locale-gen
echo "LANG=${LOCALE}" > /etc/locale.conf
echo "KEYMAP=${KEYMAP}" > /etc/vconsole.conf

# Identidad NEUBAT (consumida por scripts/validate-install.sh)
cat > /etc/neubat-release <<REL
NEUBAT_VERSION=${NEUBAT_VERSION}
NEUBAT_PROFILE=${NEUBAT_PROFILE}
NEUBAT_TOKEN=${NEUBAT_TOKEN}
NEUBAT_INSTALL_DATE=$(date -Iseconds)
NEUBAT_ENCRYPTED=${ENCRYPTION_ENABLED:-false}
REL

# Hostname
echo "${NEUBAT_HOSTNAME}" > /etc/hostname
cat > /etc/hosts <<HOSTS
127.0.0.1   localhost
::1         localhost
127.0.1.1   ${NEUBAT_HOSTNAME}.local ${NEUBAT_HOSTNAME}
HOSTS

# Usuario y contraseñas (parametrizadas desde la configuración)
useradd -m -G wheel -s /bin/bash ${USERNAME}
echo "${USERNAME}:${PASSWORD}" | chpasswd
echo "root:${PASSWORD}" | chpasswd

# Sudo: NOPASSWD temporal para poder construir paquetes AUR de forma
# desatendida. Endurecer tras la instalación (ver docs/INSTALL.md §9).
echo "%wheel ALL=(ALL:ALL) NOPASSWD: ALL" > /etc/sudoers.d/neubat
chmod 440 /etc/sudoers.d/neubat

# Initramfs (ya preparado con hooks/crypttab si LUKS está activo)
mkinitcpio -P

# Bootloader UEFI (systemd-boot). La partición EFI está montada en /boot,
# por lo que bootctl instala el loader directamente en /boot/EFI.
bootctl install --esp-path=/boot
mkdir -p /boot/EFI/NEUBAT
cp /boot/vmlinuz-linux /boot/EFI/NEUBAT/vmlinuz-linux
cp /boot/initramfs-linux.img /boot/EFI/NEUBAT/initramfs-linux.img
cp /boot/initramfs-linux-fallback.img /boot/EFI/NEUBAT/initramfs-linux-fallback.img 2>/dev/null || true

# Opciones del kernel: LUKS (si aplica) + root + parámetros básicos
cat > /boot/loader/loader.conf <<'LOADER'
default neubat.conf
timeout 3
console-mode max
LOADER

cat > /boot/loader/entries/neubat.conf <<'ENTRYEOF'
title NEUBAT Arch Linux
linux /EFI/NEUBAT/vmlinuz-linux
initrd /EFI/NEUBAT/initramfs-linux.img
options ENTRY_LUKS_OPTIONS root=ENTRY_ROOT_DEVICE rw console=ttyS0
ENTRYEOF
sed -i "s|ENTRY_LUKS_OPTIONS|${luks_options}|; s|ENTRY_ROOT_DEVICE|${root_device}|" /boot/loader/entries/neubat.conf

# Servicios
systemctl enable NetworkManager
if [[ "${FEATURES_SSH:-true}" == "true" ]]; then
    systemctl enable sshd
else
    systemctl disable sshd 2>/dev/null || true
fi

# AUR helper (yay-bin) - no crítico: un fallo no aborta la instalación
su - ${USERNAME} -c '
    set -e
    cd /tmp
    git clone https://aur.archlinux.org/yay-bin.git yay
    cd yay
    makepkg -si --noconfirm
' || echo "[WARNING] La construcción de yay falló; instálalo manualmente tras el primer arranque"

# Endurecer sudo: el NOPASSWD solo era necesario para la construcción
# desatendida de paquetes AUR; a partir de aquí wheel pide contraseña
echo "%wheel ALL=(ALL:ALL) ALL" > /etc/sudoers.d/neubat
chmod 440 /etc/sudoers.d/neubat
rm -rf /tmp/yay
EOF

    success "Sistema configurado"
}

install_applications() {
    log "Instalando aplicaciones adicionales..."

    local desktop_packages=""
    case "${DESKTOP}" in
        "kde"|"plasma")
            desktop_packages="plasma-meta kde-applications-meta sddm"
            ;;
        "gnome")
            desktop_packages="gnome gnome-extra gdm"
            ;;
        "xfce")
            desktop_packages="xfce4 xfce4-goodies lightdm lightdm-gtk-greeter"
            ;;
        "hyprland")
            desktop_packages="hyprland waybar kitty xdg-desktop-portal-hyprland"
            ;;
        "sway")
            desktop_packages="sway swaybg swaylock waybar foot"
            ;;
        "i3")
            desktop_packages="i3-wm i3status i3lock dmenu"
            ;;
        "niri")
            desktop_packages="niri waybar alacritty xdg-desktop-portal-gnome"
            ;;
        "none"|"minimal"|"")
            desktop_packages=""
            ;;
        *)
            warning "Desktop desconocido: ${DESKTOP}, usando mínimo"
            ;;
    esac

    if [[ -n "${desktop_packages}" ]]; then
        # shellcheck disable=SC2086
        arch-chroot /mnt pacman -S --noconfirm --needed ${desktop_packages}

        case "${DESKTOP}" in
            "kde"|"plasma") arch-chroot /mnt systemctl enable sddm ;;
            "gnome")        arch-chroot /mnt systemctl enable gdm ;;
            "xfce")         arch-chroot /mnt systemctl enable lightdm ;;
        esac
    fi

    # Paquetes oficiales (repo). Los AUR van en aur_packages.
    if [[ -n "${PACKAGES}" ]]; then
        # shellcheck disable=SC2086
        arch-chroot /mnt pacman -S --noconfirm --needed ${PACKAGES} \
            || warning "Algunos paquetes del repositorio fallaron"
    fi

    # AUR allowlist (yay ya instalado en configure_system)
    if [[ -n "${AUR_PACKAGES:-}" ]]; then
        log "Instalando paquetes AUR allowlist: ${AUR_PACKAGES}"
        # shellcheck disable=SC2086
        arch-chroot /mnt sudo -u "${USERNAME}" yay -S --noconfirm --needed ${AUR_PACKAGES} \
            || warning "Algunos paquetes AUR fallaron"
    fi

    # Habilitar servicios declarados en la configuración
    local services
    services=$(cfg_get "${NEUBAT_CONFIG_FILE}" services "")
    local svc
    for svc in ${services}; do
        if [[ "${svc}" == "sshd" && "${FEATURES_SSH:-true}" != "true" ]]; then
            warning "features.ssh desactivado; se omite el servicio sshd"
            continue
        fi
        arch-chroot /mnt systemctl enable "${svc}" \
            || warning "No se pudo habilitar el servicio: ${svc}"
    done

    success "Aplicaciones instaladas"
}
