# PixelSalud - Playbook De0a10k

Plan operativo derivado del curso De0a10k, adaptado a una agencia real
sin subcontratas de salida y sin métricas inventadas.

## Decisiones tomadas (semana 1-2 del curso)

- Nicho: clínicas y centros de salud privados en España
  (dental, fisioterapia, estética, psicología, veterinaria).
  Razón: necesidad clara, capital, y el servicio lo entregamos
  con el stack propio (Astro + SEO + analítica) sin depender de nadie.
- Nombre: PixelSalud. Dominio objetivo pixelsalud.es
  (sin DNS a 18-jul-2026) y pixelsalud.com (libre por whois).
- Servicio gancho (vídeos 9 y 28): Web Express 149 EUR en 72 h,
  con garantía de devolución si no se entrega a tiempo.
- Escalera de valor: 149 EUR web -> 99 EUR cita online ->
  199 EUR/mes SEO local -> 299 EUR/mes ads (fase 2).
  Ticket medio objetivo a 3 meses: >500 EUR por cliente.
- Packs con descuento (vídeo 5, oferta paquete):
  Consulta Digital 199 (ahorro 49), Despegue 379 (ahorro 68).
- Regla de costes (vídeo 10): coste de entrega <= 30 % del precio.
  Entregando nosotros: coste externo ~0. Si se delega en Fiverr,
  presupuestar máximo: web 45 EUR, artículo 10 EUR, cita online 30 EUR.

## Ritmo semanal (semana 3 del curso)

La prospección del curso no se ejecuta literalmente. En España, el artículo
21 de la LSSI prohíbe el email promocional no solicitado salvo excepciones
concretas. El canal inicial será de entrada y consentimiento:
- Publicar demos, guías y una auditoría gratuita solicitada por la clínica.
- Buscar colaboraciones con asociaciones y proveedores complementarios.
- Responder a solicitudes recibidas por la web o canales sociales.
- Registrar consentimiento, fuente y siguiente acción en el CRM.
- No enviar emails o DM fríos ni hacer llamadas en volumen sin una base
  jurídica documentada y revisión de los sistemas de exclusión aplicables.

Metas del curso como referencia, no promesa:
- Primer cliente: entre la semana 1 y el mes 2. Constancia > suerte.
- 10 llamadas agendadas ~= 3-4 cierres (vídeo 16).
- 40 interesados/mes ~= 15 clientes (vídeo 19). Llegar ahí exige
  volumen diario sostenido.

## Embudo (vídeos 12-19)

1. Prospección: lista en prospectos.csv con auditoría previa SIEMPRE
   (puntos de fuga concretos de su web o ficha de Google).
2. Primer contacto: responder por el mismo canal a una solicitud voluntaria.
   Un solo seguimiento si el interesado lo autorizó.
3. Interesado -> reunión de 15-30 min (Calendly cuando esté;
   mientras, proponer 2 franjas concretas por email).
4. Reunión con guión reunion-cierre.md. Cerrar en llamada si se puede.
5. Post-reunión: WhatsApp/email el mismo día con propuesta cerrada
   y enlace de pago o transferencia.
6. Entrega en 72 h. Revisiones 7 días. A los 15 días, upsell natural:
   "¿quieres que ahora te encuentren en Google?" -> SEO local.

## Reglas de clientes (vídeo 12)

Cliente ideal: clínica privada con capital, web floja o invisible
en Google, dueño que responde y quiere crecer.
Señales de cliente tóxico (rechazar educadamente):
1. Regatea el precio de salida.
2. Comunicación abusiva antes de pagar.
3. Expectativas imposibles o financiación forzada para pagarnos.

## Estado

Hecho:
- [x] Web completa, readiness en verde, verificada en navegador.
- [x] Kit de respuesta y reunión; la prospección fría queda bloqueada.
- [x] CRM inicial con prospectos reales auditados.

Pendiente SOLO del usuario (yo no puedo hacerlo por ti):
- [ ] Comprar pixelsalud.es (y .com si quieres) en tu registrador.
- [ ] Crear repo GitHub y aprobar el deploy (Pages + Cloudflare como
      tus otros sitios). El repo local ya queda con commit.
- [ ] Google Workspace: hola@pixelsalud.es (~6 EUR/mes, vídeo 5).
- [ ] Cuenta Calendly gratuita y pegar el enlace en src/config.ts.
- [ ] WhatsApp Business y número en src/config.ts.
- [ ] Datos del titular en src/config.ts para aviso legal y privacidad.
- [ ] Cuenta Stripe para cobrar con tarjeta (vídeo 7). Mientras:
      transferencia + factura.
- [ ] Conseguir solicitudes voluntarias mediante demos, contenido y alianzas.
      Los borradores de `ops/emails-borradores/` son investigación y no deben
      enviarse como publicidad no solicitada.
- [ ] Fase 2 (semana 5 del curso): Business Manager de Meta y píxel,
      solo cuando haya 2-3 clientes entregados y caja para 1000-2000
      EUR de inversión, como marca el vídeo 28.
