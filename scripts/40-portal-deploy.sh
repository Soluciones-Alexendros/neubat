#!/bin/bash
# =============================================================================
# NEUBAT - Fase 5: despliegue del portal local y URL única de acceso
# Módulo cargado por neubat-install.sh (no ejecutar directamente)
# =============================================================================

deploy_local_portal() {
    log "Desplegando portal NEUBAT local..."

    # nodejs/npm deben estar presentes (perfil o paquetes personalizados)
    if ! arch-chroot /mnt command -v node &>/dev/null; then
        warning "nodejs no está instalado en el sistema destino; instalándolo"
        arch-chroot /mnt pacman -S --noconfirm --needed nodejs npm
    fi

    # Estructura del portal
    arch-chroot /mnt mkdir -p /opt/neubat-portal

    # Copiar portal y perfiles (excluyendo datos en runtime)
    cp -r "${NEUBAT_ROOT}/portal/server.js" \
          "${NEUBAT_ROOT}/portal/package.json" \
          "${NEUBAT_ROOT}/portal/lib" \
          "${NEUBAT_ROOT}/portal/routes" \
          "${NEUBAT_ROOT}/portal/public" \
          /mnt/opt/neubat-portal/
    arch-chroot /mnt mkdir -p /opt/neubat/configs
    cp "${NEUBAT_ROOT}"/configs/*.json /mnt/opt/neubat/configs/

    # Dependencias Node en el sistema destino
    arch-chroot /mnt /bin/bash -c 'cd /opt/neubat-portal && npm install --omit=dev' \
        || warning "npm install falló en el destino; ejecútalo tras el primer arranque"

    # Servicio systemd
    cat > /mnt/etc/systemd/system/neubat-portal.service <<SERVICE
[Unit]
Description=NEUBAT Portal Local
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USERNAME}
WorkingDirectory=/opt/neubat-portal
ExecStart=/usr/bin/node server.js
Restart=always
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
SERVICE

    arch-chroot /mnt chown -R "${USERNAME}:${USERNAME}" /opt/neubat-portal /opt/neubat
    arch-chroot /mnt systemctl enable neubat-portal

    # URL de acceso al portal local del sistema recién instalado
    local portal_url="http://${HOSTNAME}.local:3000/"

    echo "${portal_url}" > "/mnt/home/${USERNAME}/NEUBAT-URL.txt"
    arch-chroot /mnt chown "${USERNAME}:${USERNAME}" "/home/${USERNAME}/NEUBAT-URL.txt"

    success "Portal desplegado en: ${portal_url}"
}
