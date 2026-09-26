# Lista de comprobación antes del lanzamiento

La web permanece con `noindex` y sin sitemap mientras no se hayan completado
las revisiones siguientes. `robots.txt` permite el rastreo para que los
buscadores puedan leer esa etiqueta; no lo bloquees como sustituto de `noindex`.

## Identidad y marca

- Comprueba con la persona responsable que la identidad del titular, NIF,
  domicilio y canales de contacto publicados son correctos y pueden mostrarse.
- Confirma el control de `varinoai.me` y el correo profesional que se usará en
  la web y en los avisos.
- Registra la búsqueda y revisión de VARINO en OEPM/EUIPO; no declares la marca
  aprobada solo por haber buscado un nombre parecido.

## Revisión jurídica y privacidad

- Pide revisión profesional de aviso legal, privacidad, cookies/almacenamiento,
  contratación, cancelación y fiscalidad para el modelo concreto de VARINO.
- Identifica proveedores reales, ubicaciones, accesos, transferencias,
  conservación/borrado, copias y soporte para cada dato recogido por la web.
- Revisa los textos de IA y los contratos de tratamiento antes de incorporar
  datos de clientes. No recojas información sensible en demos o formularios.
- Guarda una aprobación fechada y su responsable en `ops/legal-review.json`;
  el archivo debe reflejar una revisión real, no ser un marcador para pasar la
  comprobación.

## Backend, seguridad y pruebas

- Comprueba que el dominio del backend resuelve al n8n previsto, con TLS, límites
  de abuso, validación de origen, protección de webhooks, registros mínimos y
  manejo de errores. No uses un túnel que apunte a otro servicio local.
- Verifica cada flujo de captura, chat, agenda, baja y analítica con cuentas de
  prueba; demuestra almacenamiento, supresión, idempotencia y recuperación sin
  enviar mensajes comerciales reales.
- Audita dependencias, accesos, credenciales, retención, exposición de puertos,
  copias y respuesta a incidentes. Guarda resultados y responsable en
  `ops/security-audit.json`; no marques aprobada una auditoría pendiente.
- Comprueba la web completa en escritorio y móvil, la accesibilidad, enlaces,
  formularios, agenda, baja y cabeceras del alojamiento final.

## Habilitar indexación

Solo tras cerrar las revisiones anteriores, una persona autorizada debe revisar
los artefactos y cambiar `src/lib/launch-config.mjs` a `launchReady = true`.
Después actualiza `public/robots.txt` para anunciar el sitemap, ejecuta
`npm run readiness`, `npm run launch:check` y las pruebas de navegador, y publica
mediante el proceso de revisión acordado. No publiques el sitio ni actives el
backend solo porque compile.
