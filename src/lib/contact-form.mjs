import { CONTACT_NOTICE_VERSION } from './contact-notice.mjs';
import { getLeadSubmissionId, clearLeadSubmissionId } from './lead-idempotency.mjs';
import { TURNSTILE_ORIGIN } from './content-security-policy.mjs';

const SCOPE = 'contacto-buffer-v1';
const localHosts = ['localhost', '127.0.0.1', '[::1]'];

export function publicContactConfig(value, pageUrl) {
  try {
    const url = new URL(pageUrl);
    if (!value || value.enabled !== true || value.noticeVersion !== CONTACT_NOTICE_VERSION) return null;
    const keys = value.mode === 'production' ? ['enabled', 'mode', 'noticeVersion', 'siteKey'] : ['enabled', 'mode', 'noticeVersion'];
    if (Object.keys(value).some((key) => !keys.includes(key))) return null;
    if (value.mode === 'local-test' && url.protocol === 'http:' && localHosts.includes(url.hostname)) return value;
    if (value.mode === 'production' && url.protocol === 'https:' && typeof value.siteKey === 'string' && /^[a-zA-Z0-9_-]{20,200}$/.test(value.siteKey)
      && !/^[123]x0000/.test(value.siteKey)) return value;
  } catch { /* no usable public capabilities */ }
  return null;
}
export function contactReceipt(value, httpStatus) {
  const allowed = ['ok', 'receiptId', 'duplicate', 'status', 'crmConfirmed'];
  return httpStatus === 202 && value?.ok === true && value.status === 'received'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.receiptId ?? '')
    && typeof value.duplicate === 'boolean' && typeof value.crmConfirmed === 'boolean'
    && Object.keys(value).every((key) => allowed.includes(key)) ? value : null;
}
export async function contactJson(response, maximum = 4096) {
  if (!/^application\/json\b/i.test(response.headers.get('content-type') ?? '') || !response.body) throw new Error('invalid_response');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Error('invalid_response'); }
      chunks.push(value);
    }
    const buffer = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(buffer));
  } finally { reader.releaseLock(); }
}

// Load only after an explicit, valid submit. No contact fields are passed to the
// provider; the normal network/browser metadata still needs privacy review.
export async function contactChallenge(config, container, document) {
  if (config.mode === 'local-test') return 'XXXX.DUMMY.TOKEN.XXXX';
  const view = document.defaultView;
  if (!view.turnstile) await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
    script.async = true; script.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => { script.remove(); reject(new Error('challenge_unavailable')); }, 10000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('challenge_unavailable')); };
    document.head.append(script);
  });
  if (!view.turnstile?.render || !view.turnstile?.ready) throw new Error('challenge_unavailable');
  container.hidden = false;
  return new Promise((resolve, reject) => {
    let widget; let settled = false;
    const finish = (token) => {
      if (settled) return; settled = true; clearTimeout(timer);
      // Removal after the callback allows the provider to finish its own stack.
      queueMicrotask(() => { if (widget !== undefined) view.turnstile.remove(widget); container.hidden = true; });
      if (typeof token === 'string' && token.length > 0 && token.length <= 2048) resolve(token);
      else reject(new Error('challenge_unavailable'));
    };
    const timer = setTimeout(() => finish(null), 30000);
    view.turnstile.ready(() => {
      if (settled) return;
      try {
        widget = view.turnstile.render(container, { sitekey: config.siteKey, action: 'contact', theme: 'auto', size: 'flexible',
          'response-field': false, callback: finish, 'error-callback': () => finish(null),
          'expired-callback': () => finish(null), 'timeout-callback': () => finish(null) });
      } catch { finish(null); }
    });
  });
}

export function mountContactForm(form, dependencies = {}) {
  const fetcher = dependencies.fetcher ?? fetch;
  const pageUrl = dependencies.pageUrl ?? location.href;
  const document = form.ownerDocument;
  const status = form.querySelector('[data-form-status]');
  const submit = form.querySelector('button[type="submit"]');
  const fields = form.querySelector('[data-contact-fields]');
  const privacy = form.querySelector('[data-contact-privacy]');
  const receiptPanel = form.querySelector('[data-contact-receipt]');
  const reset = form.querySelector('[data-contact-new]');
  form.dataset.contactState = 'checking';
  const val = (name) => form.querySelector(`[name="${name}"]`)?.value.trim() ?? '';
  let config = null; let busy = false; let confirmed = false; let pending = null;
  const message = (text) => { status.textContent = text; };
  const briefing = () => `Nombre: ${val('nombre')}\nEmail: ${val('email')}\nEmpresa: ${val('negocio')}\nWeb o software: ${val('web')}\nWhatsApp: ${val('whatsapp')}\nServicio: ${val('servicio')}\n\nMensaje: ${val('mensaje')}`;
  function mailDraft() {
    const email = form.dataset.email; const link = form.querySelector('#contacto-mailto');
    if (!email || !link) return false;
    link.href = `mailto:${email}?subject=${encodeURIComponent('Consulta de Proyecto: ' + val('negocio'))}&body=${encodeURIComponent(briefing())}`;
    link.hidden = false; return true;
  }
  function feedback() {
    form.setAttribute('aria-busy', String(busy));
    submit.disabled = busy || confirmed;
    fields.disabled = busy || confirmed || Boolean(pending);
    submit.textContent = busy ? 'Enviando…' : confirmed ? 'Solicitud recibida' : pending ? 'Confirmar el mismo envío' : config ? 'Enviar solicitud →' : form.dataset.email ? 'Preparar correo →' : 'Copiar briefing →';
  }
  const configured = (async () => {
    try {
      const response = await fetcher(new URL('/api/briefings/config', pageUrl), { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (response.ok) config = publicContactConfig(await contactJson(response), pageUrl);
    } catch { /* static hosting remains a local-only mail draft */ }
    if (config) {
      form.querySelector('[data-contact-offline]').hidden = true;
      const draft = form.querySelector('#contacto-mailto');
      if (draft) {
        if (!draft.hidden) message('El registro automático ya está disponible. Si ya enviaste este briefing por correo, no lo vuelvas a enviar.');
        draft.hidden = true; draft.href = '#';
      }
      privacy.hidden = false; privacy.disabled = false;
      const live = form.querySelector('[data-contact-live]'); live.hidden = false;
      live.textContent = config.mode === 'local-test'
        ? 'Ensayo local: solo datos ficticios, email acabado en .test y teléfono vacío. No escribe en cuentas reales.'
        : 'Registraremos esta solicitud para responderte. No confirma una reserva ni una compra. La protección antiabuso de Cloudflare se carga solo al enviar.';
      feedback();
    }
    form.dataset.contactState = config ? 'available' : 'offline';
    return config;
  })();
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (busy || confirmed) return;
    if (!config) {
      if (mailDraft()) message('Borrador preparado en este dispositivo. No se ha enviado ni guardado; abre el enlace y revísalo antes de enviarlo.');
      else form.querySelector('[data-copy-briefing]').click();
      return;
    }
    if (!pending) {
      if (!form.reportValidity()) return;
      const web = val('web'); const details = [web ? `Web o software: ${web}` : '', val('mensaje')].filter(Boolean).join('\n\n');
      const service = { 'Automatización de procesos': 'automation-sprint', 'Sistema comercial': 'growth-system', 'Producto o asistente con IA': 'private-ai' }[val('servicio')] ?? 'otro';
      const input = { submissionId: '0'.repeat(64), nombre: val('nombre'), email: val('email'), empresa: val('negocio'),
        whatsapp: val('whatsapp'), interes: service, fuente: 'form-contacto', pagina: '/contacto/', mensaje: details,
        privacy_acknowledged: form.querySelector('[name="privacy_acknowledged"]').checked,
        marketing_consent: form.querySelector('[name="marketing_consent"]').checked, noticeVersion: config.noticeVersion,
        website: val('website'), turnstileToken: 'pending' };
      // Snapshot and lock before importing validation or hashing. Static visitors
      // do not download the schema library just to prepare a local mail draft.
      busy = true; feedback(); message('Preparando el envío seguro…');
      try {
        const { ContactSubmission, contactRecord } = await import('./inbound-contract.mjs');
        const candidate = ContactSubmission.safeParse(input);
        if (!candidate.success) { busy = false; feedback(); message('Revisa los campos: nombre y empresa necesitan al menos dos caracteres; descripción y web, juntas, admiten 2.000. No se ha enviado nada.'); return; }
        if (config.mode === 'local-test' && (!candidate.data.email.endsWith('.test') || candidate.data.whatsapp !== '')) {
          busy = false; feedback(); message('Este ensayo solo admite emails acabados en .test y teléfono vacío. No se ha enviado nada.'); return;
        }
        const { submissionId: _placeholder, ...record } = contactRecord(candidate.data);
        const submissionId = await getLeadSubmissionId(SCOPE, record, dependencies.idempotency ?? {});
        if (!submissionId) throw new Error('identifier_unavailable');
        pending = { ...record, submissionId };
      } catch {
        busy = false; feedback(); message('No se pudo preparar el envío seguro. No se ha enviado nada; puedes volver a intentarlo o copiar el briefing.'); return;
      }
    }
    busy = true; feedback();
    try {
      message(config.mode === 'local-test' ? 'Registrando la solicitud ficticia…' : 'Verificando y registrando la solicitud…');
      const challenge = dependencies.challenge ?? contactChallenge;
      const turnstileToken = await challenge(config, form.querySelector('[data-contact-challenge]'), document);
      const response = await fetcher(new URL('/api/briefings', pageUrl), { method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ ...pending, website: '', turnstileToken }) });
      const body = await contactJson(response);
      const receipt = contactReceipt(body, response.status);
      if (!receipt) {
        if ([400, 413].includes(response.status) && ['invalid_request', 'body_too_large', 'synthetic_data_required'].includes(body.error)) {
          pending = null; message('El servidor rechazó los campos antes de registrarlos. Revisa el email, el teléfono y la longitud del mensaje; conservamos el contenido.');
        } else if (response.status === 422 && body.error === 'challenge_rejected') message('No se completó la verificación. Puedes confirmar el mismo envío con una verificación nueva.');
        else if (response.status === 429) message('Demasiados intentos. Espera 15 minutos y confirma el mismo envío; mantenemos tus campos sin reenviar automáticamente.');
        else if (response.status === 409) message('Este envío necesita revisión. Copia el briefing y contacta con el equipo; no crearemos otra solicitud automáticamente.');
        else throw new Error('unconfirmed');
        return;
      }
      confirmed = true; receiptPanel.hidden = false; reset.hidden = false;
      receiptPanel.querySelector('[data-contact-reference]').textContent = receipt.receiptId;
      receiptPanel.querySelector('[data-contact-result]').textContent = config.mode === 'local-test'
        ? 'Solicitud ficticia guardada en el ensayo local. No acredita clientes, correos ni cuentas externas.'
        : 'Tu solicitud está registrada para su revisión. Guarda esta referencia; no confirma una reserva, un presupuesto ni una compra.';
      message(receipt.duplicate ? 'Solicitud ya registrada. Hemos recuperado el mismo recibo sin crear otro.' : 'Solicitud recibida y registrada.');
      receiptPanel.focus({ preventScroll: true });
    } catch {
      message('No se pudo confirmar la recepción. Conservamos los campos: pulsa «Confirmar el mismo envío» para recuperar el recibo sin crear otra solicitud. No enviaremos un correo automáticamente.');
    } finally { busy = false; feedback(); }
  });
  reset.addEventListener('click', () => {
    if (!confirmed || busy) return;
    clearLeadSubmissionId(SCOPE, dependencies.idempotency ?? {});
    pending = null; confirmed = false; fields.disabled = false; form.reset();
    receiptPanel.hidden = true; reset.hidden = true;
    const link = form.querySelector('#contacto-mailto'); if (link) { link.hidden = true; link.href = '#'; }
    message('Nueva solicitud. No incluyas información confidencial ni datos personales de terceros.'); feedback();
    form.querySelector('[name="nombre"]').focus();
  });
  form.querySelector('[data-copy-briefing]').addEventListener('click', async () => {
    try { await document.defaultView.navigator.clipboard.writeText(briefing()); message('Briefing copiado en este dispositivo; esta copia no se ha enviado.'); }
    catch { message('No se pudo copiar. Selecciona los campos y guárdalos; no se ha enviado una copia.'); }
  });
  feedback();
  return { configured };
}
