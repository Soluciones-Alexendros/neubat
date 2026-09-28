# Soporte

### Propósito de este documento

- **Objetivos:** Decir dónde pedir ayuda de uso y dónde no reportar una vulnerabilidad.
- **Estructura:** Canal de uso → qué incluir → qué no va aquí.
- **Contenido a integrar según contexto:** Este repo es un instalador self-hosted, no un SaaS con mesa de soporte. No publiques tokens, `ADMIN_TOKEN`, `NEUBAT_HMAC_SECRET` ni keyfiles.

## Canal

- Uso, instalación y bugs reproducibles: [issues de GitHub](https://github.com/Soluciones-Alexendros/neubat/issues/new/choose).
- Vulnerabilidades y secretos: [SECURITY.md](SECURITY.md). No abras un issue público.
- Conducta: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), en privado a [operaciones@alexendros.dev](mailto:operaciones@alexendros.dev).

No hay soporte comercial ni SLA. El mantenedor responde cuando puede; un aviso de seguridad tiene prioridad (plazo declarado en `SECURITY.md`).

## Qué incluir

- Versión o commit, perfil JSON (`base`, `developer`, `production`) y si el arranque fue iPXE o ISO.
- Comando o petición HTTP mínima. Sustituye hostnames, tokens y contraseñas por valores sintéticos.
- Salida de `GET /api/health` si el fallo es del portal.

## Qué no va aquí

- Pedir que alguien instale NEUBAT en un disco ajeno.
- Pegar `.env`, keyfiles LUKS o el contenido de `portal/data/`.
