import { z } from 'zod';
import { CONTACT_NOTICE_VERSION } from './contact-notice.mjs';
export { CONTACT_NOTICE_VERSION, CONTACT_MARKETING_SOURCE } from './contact-notice.mjs';

const plain = (max) => z.string().trim().max(max).refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value));
export const ContactSubmission = z.strictObject({
  submissionId: z.string().regex(/^[a-f0-9]{64}$/),
  nombre: plain(120).refine((value) => value.length >= 2),
  email: z.string().trim().toLowerCase().max(200).email(),
  empresa: plain(160).refine((value) => value.length >= 2),
  whatsapp: z.string().trim().max(30).regex(/^[+0-9() -]*$/)
    .transform((value) => value.replace(/[() -]/g, '')).pipe(z.string().regex(/^(?:\+?[0-9]{7,15})?$/)).default(''),
  interes: z.enum(['automation-sprint', 'growth-system', 'private-ai', 'otro']),
  fuente: z.literal('form-contacto'), pagina: z.literal('/contacto/'),
  mensaje: plain(2000).default(''),
  privacy_acknowledged: z.literal(true),
  marketing_consent: z.boolean().default(false),
  noticeVersion: z.literal(CONTACT_NOTICE_VERSION),
  website: z.literal('').default(''),
  turnstileToken: z.string().min(1).max(2048),
});

// Fixed property order; the anti-bot token is transient and is never persisted.
export function contactRecord(submission) {
  const data = ContactSubmission.parse(submission);
  const { turnstileToken: _token, website: _honeypot, ...record } = data;
  return record;
}

export const InboundJob = z.strictObject({
  id: z.string().uuid(), kind: z.literal('crm_lead_ingest'),
  lead: ContactSubmission.omit({ turnstileToken: true, website: true }),
  leaseToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/), leaseExpiresAt: z.number().int(),
});
export const InboundReport = z.union([
  z.strictObject({ jobId: z.string().uuid(), leaseToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    result: z.strictObject({ leadId: z.string().regex(/^L_[a-f0-9]{64}$/), verified: z.literal(true) }) }),
  z.strictObject({ jobId: z.string().uuid(), leaseToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    errorCode: z.enum(['crm_unconfirmed', 'invalid_response']) }),
]);
