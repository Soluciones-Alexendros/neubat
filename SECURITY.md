# Política de seguridad

### Propósito de este documento

- **Objetivos:** Declarar versiones soportadas, el canal privado de avisos y la superficie (portal, HMAC, LUKS, instalador).
- **Estructura:** Versiones soportadas → cómo reportar → superficie relevante → alcance.
- **Contenido a integrar según contexto:** Adapta versiones del portal/ISO y secretos de `.env.example`. No copies la política de un SaaS. No reutilices tokens de ejemplo con secretos reales; no commitees `.env` ni keyfiles LUKS.

## Versiones soportadas

| Versión | Soportada |
| ------- | --------- |
| 2.0.x (`main`, ISO/portal) | Sí |
| 1.0.x | No |
| Ramas de trabajo / snapshots previos a v1.0.0 | No |

El portal declara `node: ">=22"`. Node.js 18 está fuera de soporte según el calendario oficial; la CI usa Node 22 (LTS).

## Cómo reportar una vulnerabilidad

**No abras un issue público** si el hallazgo puede filtrar `ADMIN_TOKEN`, `NEUBAT_HMAC_SECRET`, keyfiles LUKS o facilitar una instalación manipulada.

1. Preferible: [GitHub Security Advisory](https://github.com/Soluciones-Alexendros/neubat/security/advisories/new) en este repositorio.
2. Alternativa: correo a [operaciones@alexendros.dev](mailto:operaciones@alexendros.dev).

Incluye: versión o commit, componente (portal / scripts / ISO), sistema operativo, y un caso **mínimo sintético** (nunca secretos reales). Responderemos en un plazo máximo de 7 días naturales.

## Superficie relevante

- El portal aplica rate-limiting básico en `/api/*`. En exposición pública, sitúalo detrás de TLS.
- `NEUBAT_HMAC_SECRET` firma configuraciones en tránsito; debe coincidir entre portal e instalador.
- LUKS2 con `keyfile` permite arranque desatendido: rota el keyfile tras instalar en entornos sensibles.
- Tokens de instalación son hex de 32 caracteres (`configPathFor`); no aceptes otros formatos.
- Contraseñas por defecto de los perfiles JSON (`neubat`) deben cambiarse en el primer acceso. Si el cifrado está activo, el portal y el instalador rechazan esa contraseña o passphrase. `NEUBAT_ALLOW_DEFAULT_SECRETS=1` es solo para un laboratorio.
- No commitees `.env`, `portal/data/`, `ansible/generated/` ni keyfiles.

## Alcance

Este repositorio entrega un portal local/self-hosted y un instalador desatendido. No opera un SaaS multi-tenant. Las vulnerabilidades de un host ya instalado (servicios del perfil, AUR, escritorio) pertenecen a esos componentes, salvo que el defecto esté en los scripts o en la API del portal.
