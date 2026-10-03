import { z } from 'zod';
import { jsonResponse, type PagesFunction } from '../../_lib/http';
import { bodyError, isJsonRequest, readBoundedJson } from '../../_lib/document-jobs';
import { authorizeSuppressionWorker, maintainSuppression, type SuppressionEnvironment } from '../../_lib/suppression';

export const onRequest: PagesFunction<SuppressionEnvironment> = async ({ request, env }) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  try {
    const rejected = await authorizeSuppressionWorker(request, env, 'sync');
    if (rejected) return rejected;
    if (!isJsonRequest(request)) return jsonResponse({ error: 'json_required' }, 415);
    try { z.strictObject({}).parse(await readBoundedJson(request, 256)); } catch (error) { return bodyError(error); }
    await maintainSuppression(env, Math.floor(Date.now() / 1000));
    return jsonResponse({ ok: true });
  } catch { return jsonResponse({ error: 'service_unavailable' }, 503); }
};
