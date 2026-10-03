import { z } from 'zod';

export const Recipient = z.string().max(200).email()
  .refine((value) => value === value.trim() && !/[\r\n\u0000-\u001f\u007f]/u.test(value))
  .transform((value) => value.toLowerCase());
export const OpaqueToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const EventId = z.string().regex(/^[a-f0-9]{64}$/);
export const IssueUnsubscribe = z.strictObject({ email: Recipient });
export const ConfirmUnsubscribe = z.strictObject({ token: OpaqueToken });
export const SuppressionJob = z.strictObject({
  eventId: EventId, kind: z.literal('crm_suppression_sync'), email: Recipient,
  requestedAt: z.iso.datetime({ precision: 3 }),
  leaseToken: OpaqueToken, leaseExpiresAt: z.number().int(),
});
export const SuppressionReport = z.union([
  z.strictObject({ eventId: EventId, leaseToken: OpaqueToken,
    result: z.strictObject({ ok: z.literal(true), status: z.literal('suppressed'), eventId: EventId }) }),
  z.strictObject({ eventId: EventId, leaseToken: OpaqueToken, errorCode: z.enum(['crm_unconfirmed', 'invalid_response']) }),
]);

export function tokenFromFragment(fragment) {
  if (typeof fragment !== 'string' || fragment.length > 100 || !fragment.startsWith('#')) return null;
  const params = new URLSearchParams(fragment.slice(1));
  if ([...params.keys()].length !== 1 || !params.has('token')) return null;
  const result = OpaqueToken.safeParse(params.get('token'));
  return result.success ? result.data : null;
}
