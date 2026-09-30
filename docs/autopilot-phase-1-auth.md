# Autopilot — fase 1: identidad y primer workspace

Estado: implementado en la rama de trabajo y verificable en runtime local. No
hay credenciales de Google configuradas, base D1 remota, despliegue ni acceso
de Gmail. La web pública sigue siendo estática.

## Qué hace esta fase

- El endpoint `POST /api/auth/google/start` exige el origen exacto y, en el
  entorno publicado, la IP de cliente entregada por Cloudflare mediante
  `CF-Connecting-IP`. Solo en un origen local explícito admite el loopback como
  identificador de desarrollo. Limita a 5
  inicios por ventana fija de 15 minutos y devuelve `Retry-After`. La IP no se
  guarda ni registra: D1 conserva solo un HMAC por ventana, derivado mediante
  HKDF de `OAUTH_STATE_SECRET`, el contador y la caducidad. Los cubos caducados
  se purgan en nuevas solicitudes de inicio; tras inactividad no hay borrado
  por reloj, así que esa retención debe completarse antes de admitir usuarios.

- Inicio de sesión Google OIDC con scopes `openid email profile` únicamente.
- `state` cifrado/autenticado y de vida corta, `nonce`, PKCE S256, validación de firma,
  emisor, audiencia, expiración, nonce, `sub` y `email_verified`.
- No se enlazan cuentas existentes automáticamente por correo coincidente.
- Sesiones opacas aleatorias; D1 guarda solo SHA-256 del token. Cookie
  `HttpOnly`, `SameSite=Lax`, `Secure` cuando el origen usa HTTPS, caducidad
  servidor de 14 días y revocación al cerrar sesión.
- API `GET /api/auth/session`, `POST /api/auth/logout` y
  `POST /api/workspaces`. Las escrituras exigen origen exacto, JSON y sesión.
- El primer workspace y su membresía `OWNER` se crean en un lote D1 y generan
  un evento de auditoría. La operación tolera el reintento si la primera
  respuesta se pierde.
- `/app/` muestra el estado real de la cuenta/workspace y, si se ejecuta con
  Pages Functions + D1 locales, permite guardar y volver a ver un borrador
  manual de resumen mediante `GET/POST /api/automations`. El borrador no puede
  ejecutarse y no implica que existan integraciones.

Google confirma identidad en esta fase: todavía no se solicitan permisos de
Gmail, Drive, Calendar ni Sheets. El sistema tampoco ejecuta workflows.
Los borradores se aíslan por workspace, limitan frecuencia y rechazan patrones
conocidos de datos personales/secretos. No existe aún exportación, borrado ni
retención automática; no se deben guardar datos reales de clientes.

## Desarrollo local

1. Copia `.dev.vars.example` a `.dev.vars` y conserva ese archivo fuera de Git.
2. Crea un cliente OAuth de tipo aplicación web en Google Cloud. Configura
   como URI de redirección autorizada el valor exacto
   `http://localhost:8788/api/auth/google/callback` para desarrollo local.
3. Rellena en `.dev.vars` `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y una
   clave aleatoria `OAUTH_STATE_SECRET` de al menos 32 bytes; deja
   `APP_BASE_URL=http://localhost:8788`.
4. Aplica la migración local: `npx wrangler d1 migrations apply VARINO_DB --local`.
5. Ejecuta `npm run build` y después `npm run cf:local -- --port 8788`.
6. Abre `http://localhost:8788/app/`. El consentimiento de Google debe indicar
   solo identidad/correo/perfil. No conectes cuentas de clientes en esta
   instancia de pruebas.

Sin esos cuatro valores, el endpoint falla cerrado con `503` y la interfaz
explica que el acceso no está configurado. No se simula un login.

## Antes de staging o producción

- Configurar un runtime Cloudflare Pages Functions + D1 y sus secretos en el
  gestor correspondiente; no pegar credenciales en el repositorio, chat o
  variables del navegador.
- Crear el cliente OAuth separado para el entorno, registrar su URI exacta,
  completar la pantalla de consentimiento y verificar las restricciones de
  marca/dominio de Google.
- Revisar límites antiabuso/rate limiting, recuperación/exportación/borrado,
  retención, accesibilidad y aviso de privacidad con responsable legal antes
  de admitir usuarios externos. El límite de 15 escrituras/minuto del endpoint
  de borradores no sustituye una política integral antiabuso.
- El dominio público sigue en GitHub Pages estático: allí estas funciones no
  se ejecutan. Esta implementación no cambia hosting, DNS, GitHub Pages ni la
  publicación.

## Pruebas

Antes de staging/producción también hay que añadir un límite antiabuso a nivel
de Cloudflare contra tráfico distribuido y verificar en ese entorno que
`CF-Connecting-IP` solo llega desde el edge. El límite D1 por IP no es una
protección DDoS y no se debe habilitar un origen directo al Worker. El borrado
de los registros vencidos de rate limit sigue siendo oportunista y requiere
una política operativa con fecha límite antes de admitir usuarios externos.

- Unitarias: firma/caducidad/CSRF de state, PKCE S256, verificación OIDC con una
  clave efímera de test, configuración/origen y propiedades de cookie.
- D1 local: migración de `google_subject`, tabla de sesión con hash y pruebas
  de integridad/aislamiento existentes.
- E2E: pantalla `/app/`, `noindex` y estado de proveedor no configurado.
- La prueba real de consentimiento y callback necesita un cliente OAuth de
  Google de desarrollo; no se afirma que haya sido ejecutada sin él.
