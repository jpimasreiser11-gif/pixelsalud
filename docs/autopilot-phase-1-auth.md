# Autopilot — fase 1: identidad y primer workspace

Estado: implementado en la rama de trabajo y verificable en runtime local. No
hay credenciales de Google configuradas, base D1 remota, despliegue ni acceso
de Gmail. La web pública sigue siendo estática.

## Qué hace esta fase

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
- `/app/` muestra únicamente el estado real de cuenta/workspace. No presenta
  automatizaciones, estadísticas, integraciones ni conexiones inexistentes.

Google confirma identidad en esta fase: todavía no se solicitan permisos de
Gmail, Drive, Calendar ni Sheets. El sistema tampoco ejecuta workflows.

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
  accesibilidad y aviso de privacidad con responsable legal antes de admitir
  usuarios externos.
- El dominio público sigue en GitHub Pages estático: allí estas funciones no
  se ejecutan. Esta implementación no cambia hosting, DNS, GitHub Pages ni la
  publicación.

## Pruebas

- Unitarias: firma/caducidad/CSRF de state, PKCE S256, verificación OIDC con una
  clave efímera de test, configuración/origen y propiedades de cookie.
- D1 local: migración de `google_subject`, tabla de sesión con hash y pruebas
  de integridad/aislamiento existentes.
- E2E: pantalla `/app/`, `noindex` y estado de proveedor no configurado.
- La prueba real de consentimiento y callback necesita un cliente OAuth de
  Google de desarrollo; no se afirma que haya sido ejecutada sin él.
