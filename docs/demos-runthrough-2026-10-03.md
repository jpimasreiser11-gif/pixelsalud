# Demos interactivas: operación y evidencia

Verificación local del 3 de octubre de 2026. Este bloque mejora la explicación
comercial de VARINO; no acredita el despliegue de la web ni la integración
operativa del CRM, correo, pagos o agenda.

## Qué cambia

Los tres casos de `/demos/` tienen un recorrido independiente, con reproducción,
pausa, selección directa, anterior, siguiente y reinicio. No arrancan solos.
El teclado permite flechas, Inicio y Fin entre pasos. Pausar, cambiar de paso o
reiniciar cancela inmediatamente el avance pendiente. Ocultar la página pausa
el recorrido y no lo reanuda al volver.

Con movimiento reducido, reproducir muestra la salida estática sin temporizador;
los pasos siguen siendo explorables manualmente. Sin JavaScript se conservan
el contenido, los precios, los enlaces a servicios y las descargas, sin botones
inoperantes. Los controles tienen una altura mínima de 44 px y foco visible.

La identidad, los colores y el monograma son de VARINO. La habilidad
`apple-design` orientó la respuesta inmediata, las transiciones interrumpibles,
la jerarquía y el movimiento reducido; no se añadió un motor de gestos o una
dependencia de animación. La habilidad de validación de n8n orientó la revisión
de nodos, conexiones, entradas y pruebas negativas. No se usó un conector MCP
de n8n: las comprobaciones nativas utilizaron el CLI instalado.

## Contrato entre la vista y los archivos

`src/lib/public-demo-catalog.ts` se ejecuta al construir, no en el navegador.
Lee metadatos de los tres exports fijos de `public/demos/`. Rechaza un flujo
activo, credenciales, nodos o conexiones incompatibles, código no revisado,
notas ausentes, historial habilitado, falta de timeout o identificadores de
ejemplo no sintéticos. La huella del código permite detectar cambios que
invaliden su descripción; no sustituye una auditoría del código nuevo.

| Caso | Archivo | Salida probada en n8n |
| --- | --- | --- |
| Clínica | `clinica-intake.n8n.json` | `REVIEW_REQUIRED`, `pending_human_review`, categoría `solicitud_cita` |
| Crecimiento | `leads-seguimiento.n8n.json` | `COMMERCIAL_APPROVAL_REQUIRED`, `pending_commercial_review`, prioridad `review_high` |
| Operaciones | `operaciones-bandeja.n8n.json` | `PROCESS_OWNER_REVIEW_REQUIRED`, `pending_owner_review`, ruta `operations_queue` |

Cada export tiene cuatro nodos manuales y doce notas en total entre los tres.
No contiene credenciales, webhooks, correo, HTTP, SQL ni integraciones externas.
Son ejemplos deterministas con datos ficticios: no consultan una IA, no
confirman citas, no generan propuestas y no envían mensajes. La visualización
web tampoco ejecuta n8n, guarda datos o llama a endpoints operativos.

## Cómo modificar y volver a probar

1. Editar el export correspondiente y sus notas. Revisar íntegramente el nuevo
   código, sus tipos y conexiones antes de actualizar las huellas SHA-256.
2. Actualizar la descripción, la huella del código y los casos de prueba en
   `src/lib/public-demo-catalog.ts` y `tests/unit/public-demo-catalog.test.ts`.
   Actualizar también la huella del archivo completo en el test nativo solo
   después de la revisión. No aceptar automáticamente un hash distinto.
3. Editar títulos, problemas, enlaces, precios y límites en `src/pages/demos.astro`.
   La interacción compartida vive en `src/lib/demo-runthrough.ts`; el componente
   y sus estilos en `src/components/DemoRunthrough.astro`.
4. Ejecutar las comprobaciones siguientes desde la raíz de este checkout:

```sh
npm run test:unit
npm run readiness
npm run claims:check
npm run security:headers
VARINO_E2E_PORT=4387 VARINO_E2E_PUBLISHED_PORT=4487 npm run test:e2e -- --workers=2
npm run test:public-demos-native
npm audit --audit-level=moderate
```

El test nativo requiere el n8n instalado y revisado, versión 2.40.7. No instala
paquetes ni usa el perfil real: crea un perfil temporal con permisos restrictivos,
clave efímera y puertos propios en loopback. Importa únicamente los tres archivos
revisados, inactivos, y ejecuta sus grafos reales. Comprueba cuatro nodos, una
salida y `externalActionsAllowed=false`. Después cambia solo la entrada sintética
y comprueba rechazo para canal inválido, necesidad vacía y origen inválido,
sin alcanzar la salida final. Borra su propio perfil al terminar. Los ajustes
de no guardar ejecuciones de los exports no garantizan por sí solos ausencia
de payloads en cualquier instalación: hay que comprobar la retención nativa.

## Resultado observado

- Unitarias: 77/77, diez archivos, salida 0.
- Readiness: construcción de 38 rutas; comprobaciones SEO, sintaxis, enlaces,
  CSP y gate correctas sobre 39 HTML. El gate conserva el prelanzamiento noindex.
- Claims y configuración local de cabeceras: correctas. Esto no prueba que un
  hosting entregue esas cabeceras.
- Navegador: 301 aprobadas y tres omisiones de controles exclusivamente móviles
  en proyectos de escritorio. Chromium desktop/móvil contra desarrollo y el
  artefacto estático servido sin cabeceras adicionales, no contra producción.
- Contratos nuevos: 24 comprobaciones de las demos en esos cuatro proyectos;
  descargas, orden y datos del export, enlaces a servicios, ausencia de llamadas
  operativas, pausa/reinicio, teclado, independencia, accesibilidad, movimiento
  reducido, contraste y contenido sin JavaScript.
- n8n nativo: tres ejecuciones correctas y tres rechazos de entradas inválidas,
  salida 0; perfil desechable, sin credenciales ni datos de clientes.
- Chrome real: vista de escritorio 1280 × 900 y móvil emulado 390 × 844,
  selección directa revisada visualmente. Una navegación al hash no emitió otro
  evento `load` y agotó esa espera; la observación posterior confirmó el destino
  y la interacción. No se reinició ni se repitió la navegación por ese timeout.
  Captura acotada: 24 solicitudes, cinco operaciones, cero descartes y cero
  reglas/mocks. Un error de consola fue atribuido a `chrome-extension://invalid/`,
  no al código de la web. Las capturas y el export permanecen fuera del repo.

## Publicación: pendiente de seguridad

`npm audit --audit-level=moderate` terminó con salida 1: dos entradas HIGH,
la dependencia `http-cache-semantics@4.2.0` y Astro como dependiente. El
[aviso primario GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
no publica una versión corregida al comprobarlo. La
[propuesta de corrección upstream](https://github.com/kornelski/http-cache-semantics/pull/58)
continúa abierta y sin merge, head
`14a8c2ad51740dc39bf3e8f1a11c845a5003f217`.

El registro devuelve `http-cache-semantics` 4.2.0 como última versión, y Astro
7.3.5 todavía depende de `^4.2.0`; actualizar Astro no acredita una solución.
El downgrade destructivo propuesto por `npm audit fix --force` no se ejecutó.
No se suprimió la alerta, modificó el umbral, añadió una excepción o presentó
la suite local como una CI completa. La publicación permanece cerrada.

El servicio operativo de n8n, el acceso de Google al CRM, las autorizaciones de
contacto y los requisitos de lanzamiento son puertas separadas. No se activan
por pasar este bloque de demostraciones.
