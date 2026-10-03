import { z } from 'zod';
import { containsPrivateData } from '../guide-engine.mjs';

export const DOCUMENT_KEYS = ['diagnostico_caio', 'mapa_del_bucle', 'prd', 'implementacion', 'adopcion', 'recurrencia'];
const unsupported = /(?:€|\$|£|\b\d+(?:[.,]\d+)?\s*(?:EUR|por ciento|%)|\b\d+\s*(?:d[ií]as|semanas|meses|horas|minutos)\b|\bgarantiz\w*|\bahorr\w{0,12}\s+(?:\d|un \d)|\b(?:cumple|conforme|certificad[oa])\b.{0,60}\b(?:RGPD|GDPR|ISO\s*27001)\b|\bcaso de éxito\b|\bcliente de VARINO\b|\b20\d\d[-/]\d\d[-/]\d\d\b)/i;
const safeText = (text) => !containsPrivateData(text) && !unsupported.test(text);
const section = z.string().min(120).max(8500).refine(safeText).refine((text) => text.includes('BORRADOR') && text.includes('REVISIÓN HUMANA OBLIGATORIA'));
export const DocumentResult = z.strictObject({
  ok: z.literal(true),
  status: z.literal('draft_human_review_required'),
  model: z.literal('qwen3.6:27b'),
  documents: z.strictObject(Object.fromEntries(DOCUMENT_KEYS.map((key) => [key, section]))),
  preguntas_pendientes: z.array(z.string().trim().min(1).max(500).refine(safeText)).min(3).max(12),
  side_effects: z.literal(false), stored: z.literal(false), sent: z.literal(false), implemented: z.literal(false),
});

// The brief comes from a validated, stored plan, never an arbitrary URL, transcript or credential.
export function briefFromPlan(plan) {
  const brief = `Proceso a evaluar: ${plan.name}. Objetivo: ${plan.objective}. Pasos propuestos: ${plan.steps.map((step) => `${step.kind}: ${step.instruction}`).join('; ')}. Integraciones por verificar: ${plan.requiredIntegrations.join(', ') || 'ninguna confirmada'}. Elaborar seis borradores; no implementar, enviar ni presupuestar. Todo dato ausente está POR CONFIRMAR.`;
  if (brief.length < 20 || brief.length > 4000 || containsPrivateData(brief)) throw new Error('unsafe_brief');
  return brief;
}
