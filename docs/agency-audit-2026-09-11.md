# VARINO — auditoría de lanzamiento y operación

Fecha: 11 de septiembre de 2026. Estado: **operación integral no verificada**.
Este documento no certifica cumplimiento legal ni seguridad absoluta.

## Activos confirmados

- Agencia: VARINO; automatización de procesos e IA privada.
- Mercado inicial: asesorías y pequeñas empresas de servicios de Barcelona, España.
- Web: https://varinoai.me; Astro, GitHub Pages; repositorio jpimasreiser11-gif/pixelsalud.
- Versión publicada observada: b8293c4eadd652d597f9b3bc6b6811c3a2a8cc39.
- CRM ya existente en Google Sheets; n8n y Ollama locales con conexión pública por túnel.
- Hay workflows activos para chat, leads, bajas, agenda, reservas, recordatorios, seguimiento, respuestas, analítica, propuestas, aceptación, pagos y resumen. **Activo no significa probado.**

## Evidencias y huecos

| Área | Evidencia | Pendiente antes de considerarla completa |
|---|---|---|
| Web e indexación | La web responde; robots permite rastreo y referencia el sitemap | Confirmar propiedad y cobertura en Search Console; indexable no significa indexada |
| Dominio | El dominio principal tiene HTTPS | El alias www sigue rechazado por TLS |
| Backend | La consulta pública de disponibilidad devolvió 503, Database is not ready; comprobación local posterior respondió ok | Diagnosticar recurrencia y probar disponibilidad estable; no atribuir causa definitiva |
| Base n8n | PRAGMA quick_check respondió ok | Integridad estructural no demuestra disponibilidad, copias recuperables ni ausencia de bloqueos |
| CRM | Existe esquema y flujo de recepción | Verificar escritura real, lectura de confirmación, duplicados, permisos y supresión |
| Chat | Correcciones de interfaz probadas con backend simulado en móvil y escritorio | Comprobar respuestas y memoria con el modelo activo y medir latencia |
| Agenda | Hay flujos activos | Reserva real propia, invitación recibida, choque de horarios, cancelación y recordatorio |
| Privacidad | La página publicada conserva el aviso Borrador no publicable | Confirmar tratamientos, proveedores, conservación y transferencias antes de sustituirlo |
| Planes | Precios, horas, respuesta y condiciones publicados | Verificar capacidad de cumplirlos y distinguir respuesta de resolución |
| Compra | Existen flujos de propuesta, aceptación y Stripe | Pago, factura, contrato y onboarding no probados; enlaces de pago del frontend vacíos |
| Casos | No hay evidencia revisada de casos autorizados | No convertir demos o prospectos en testimonios ni clientes |
| Métricas | Existe analítica y resumen | Verificar conteos, deduplicación, embudo y tratamiento de datos; no publicar números no contrastados |

## Competencia: ofertas publicadas, no resultados demostrados

Fuentes consultadas el 11 de septiembre de 2026. No disponemos de conversiones,
rentabilidad ni satisfacción verificadas de estas empresas. No se puede afirmar
qué les funciona comercialmente solo por su web.

| Empresa | Oferta anunciada | Lectura para VARINO |
|---|---|---|
| [ChenAI](https://chenai.es/precios) | Automatización desde 1.500 €, agente/proyecto medio desde 4.500 €; documentación, formación y soporte inicial; importes sin IVA | Explicar entregables y límites facilita comparar; separar implantación y mantenimiento |
| [NovaChat IA](https://novachatia.com/blog/cuanto-cuesta-automatizar-n8n-empresa-2026/) | Flujo sencillo 300–800 €, con IA 1.000–3.000 €, proyecto completo 3.000–6.000 €; mantenimiento desde 600 €/mes | VARINO no es la opción más barata de toda la muestra; no usar esa afirmación |
| [LaudeMMedia](https://www.laudemmedia.com/cuanto-cuesta-automatizar-una-empresa/) | Su artículo sitúa implantaciones en 1.500–15.000 € y mantenimiento 100–800 €/mes | Rangos orientativos publicados, no presupuesto comparable sin alcance |

## Decisión comercial

Mantener de momento los rangos publicados (Sprint 950–1.900 €, crecimiento
2.500–6.000 €, IA privada desde 5.500 €, sin IVA). Reducir precios sin estimar
horas, soporte y costes podría volver inviable el servicio. Antes de lanzar un
paquete de entrada más barato: definir un único proceso, integraciones, volumen,
horas máximas, criterios de aceptación y exclusiones. No prometer ser inferior
al mercado completo a partir de tres referencias.

Nicho inicial: asesorías y equipos de servicios con recepción manual de solicitudes,
documentación dispersa y seguimiento comercial. Ejemplo de demostración: solicitud
ficticia → clasificación → registro → borrador revisable. No usar expedientes reales
ni prometer ahorros no medidos. El siguiente paso comercial es diagnóstico y
propuesta escrita, no despliegue automático sin validar accesos y alcance.

## Cumplimiento y captación

- Una dirección publicada no autoriza publicidad. El [artículo 21 LSSI](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758)
  exige solicitud/autorización previa, salvo la excepción legal de relación contractual previa y servicios similares.
- Ofrecer baja no subsana la falta de autorización inicial. Separar solicitud de contacto y permiso de marketing.
- No se enviaron correos, se crearon citas ni se cobraron pagos durante esta auditoría.
- Analítica sin cookies no implica automáticamente anonimato ni exención de todas las obligaciones: revisar IP, registros, identificadores y destinatarios.
- No dar por verificados régimen fiscal, alta del titular, obligaciones de facturación o contratos por la mera existencia de textos web.

## Orden de cierre con evidencia

### Recuperación verificada durante la auditoría

Tras confirmar cero ejecuciones running/new/waiting, se reinició únicamente el
servicio n8n mediante su servicio de arranque existente. La comprobación local
de disponibilidad respondió HTTP 200 en 0,006 s y la agenda pública devolvió
HTTP 200 con huecos en 1,05 s. No se reservó ninguna cita. Esto demuestra la
recuperación puntual, no la corrección de la causa raíz ni estabilidad prolongada.

La comprobación en el navegador autenticado queda bloqueada: browser-skill
informa de cero navegadores conectados. Requiere conectar la extensión del
usuario; no se extrajeron cookies ni credenciales para sortear ese bloqueo.

1. Estabilizar backend y acceso de administración; conservar workflows y datos antes de cambios.
2. Verificar lead propio de prueba de extremo a extremo, CRM y Telegram, con recuperación ante errores.
3. Separar permiso comercial, probar bajas y bloquear secuencias sin evidencia.
4. Probar chat real, agenda y recordatorios sin mensajes a terceros ajenos a las pruebas.
5. Probar compra en modo de pruebas: aceptación, contrato, pago, factura, onboarding y reintentos idempotentes.
6. Confirmar datos legales/fiscales y obligaciones de servicio; publicar solo condiciones respaldadas.
7. Verificar métricas, restauración y reinicio; después activar captación autorizada.

Cada cierre debe registrar fecha, versión, entrada sintética o propia, resultado
observado y efectos externos. Los tests simulados no sustituyen a las pruebas reales.
