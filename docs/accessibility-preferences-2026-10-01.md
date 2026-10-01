# Preferencias de accesibilidad — comprobación del candidato

Fecha: 1 de octubre de 2026. Rama: `feat/apple-design-motion-20260930` (PR #15).

## Cambio

La navegación, el menú y los paneles de la guía usan materiales sólidos cuando el navegador comunica transparencia reducida o contraste aumentado. En alto contraste, la guía refuerza sus bordes, la navegación añade subrayado y los controles muestran un foco de teclado de 3 px con separación del fondo. El textarea ya no oculta ese foco. La elección manual de tema se mantiene y retirar la preferencia recupera la apariencia normal.

Se amplía la mejora de navegación existente, sin reintroducir el scroll reveal retirado, copiar activos de Apple ni cambiar permisos, formularios, indexación o controles de lanzamiento.

## Pruebas realizadas

- `npm run readiness`: compilación y comprobaciones de SEO, sintaxis, enlaces, CSP y gates correctas; 39 documentos HTML comprobados.
- `npm run test:unit`: 50 pruebas correctas.
- `VARINO_E2E_PORT=4477 VARINO_E2E_PUBLISHED_PORT=4478 npm run test:e2e`: 279 correctas, 3 omitidas por sus condiciones explícitas de dispositivo/puntero. Sin fallos.
- Dentro de esa suite, 20 comprobaciones nuevas ejecutan el mismo contrato de preferencias contra desarrollo y el artefacto estático, en escritorio y móvil. Comprueban ambos temas, materiales opacos, foco del textarea, menú, navegación, cambio manual de tema, reversibilidad y ausencia de desbordamiento horizontal.
- `npm run claims:check`: correcto.
- `npm audit --audit-level=moderate`: cero vulnerabilidades notificadas.
- `npm run security:headers`: configuración local correcta; no prueba la entrega de cabeceras del hosting.
- Inspección visual real del candidato local en temas claro y oscuro, con emulación temporal de contraste y transparencia reducida. Emulación retirada y pestaña de prueba cerrada al terminar.

Las pruebas son de este candidato local. No acreditan publicación, integración de servicios reales, conformidad universal con WCAG ni cumplimiento legal completo. No se modifican las revisiones humanas pendientes ni los gates de producción.

## Referencias técnicas

Las preferencias se implementan como mejora progresiva, sin asumir soporte universal del navegador. Definiciones en el borrador de Media Queries Level 5: [transparencia reducida](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-transparency) y [contraste](https://www.w3.org/TR/mediaqueries-5/#prefers-contrast).
