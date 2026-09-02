# VARINO Agency Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the local SYSTRA prototype with the approved VARINO brand, public site, consented advisor, secure control layer, local AI worker, approval dashboard, and launch-blocking quality controls without publishing it.

**Architecture:** Keep Astro as a static public front end, add Cloudflare Pages Functions plus D1 as the future free-tier control layer, and run n8n/Ollama only on localhost through an outbound authenticated worker. Domain logic stays in small framework-independent TypeScript modules; all external actions terminate in a human approval state.

**Tech Stack:** Astro 7, TypeScript, Tailwind CSS 4, Vitest, Playwright, axe-core, Zod, Cloudflare Pages Functions/D1/Wrangler, Node.js local worker, n8n, Ollama.

**Relevant implementation skills:** `@astro` for framework conventions, `@accessibility` and `@browser-qa` for UI verification, `@api-security-best-practices` for the control layer, and `@Data Privacy Compliance` for compliance evidence. Read each skill before executing the task that uses it.

---

## Execution rules

- Work in the existing checkout because it contains uncommitted site changes that form the approved starting point. Do not reset, clean, stash, or overwrite them.
- Before the first edit, save `git status --short` and `git diff --binary` under `work/pre-varino/`; inventory untracked files separately. This is a recoverable snapshot, not a deployment.
- Never run `wrangler deploy`, enable Cloudflare Pages production, change DNS, set `SITE.launchReady` to `true`, or remove `Disallow: /` during this plan.
- Keep legal identity fields empty. Legal pages remain visibly marked as drafts.
- Commit only files named by the current task. Do not sweep unrelated working-tree changes into a commit.
- Follow TDD for domain rules, API handlers, queue transitions, and launch gates.

## Task 1: Establish the test and safety baseline

**Files:**
- Create: `work/pre-varino/README.md`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `tests/unit/baseline.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Step 1: Record the working-tree snapshot**

Run:

```bash
mkdir -p work/pre-varino
git status --short > work/pre-varino/status.txt
git diff --binary > work/pre-varino/tracked.patch
git ls-files --others --exclude-standard > work/pre-varino/untracked.txt
```

Expected: three local recovery files; no source file changed.

**Step 2: Add the test dependencies and scripts**

Add pinned runtime dependencies for `zod` and `jose`. Add pinned dev dependencies for `vitest`, `@playwright/test`, `@axe-core/playwright`, `jsdom`, `wrangler`, and `@cloudflare/workers-types`. Add scripts:

```json
{
  "test:unit": "vitest run",
  "test:e2e": "playwright test",
  "test:e2e:update": "playwright test --update-snapshots",
  "cf:local": "wrangler pages dev dist --local",
  "security:headers": "node scripts/check-security-headers.mjs",
  "claims:check": "node scripts/check-claims.mjs"
}
```

Run: `npm install`

Expected: lockfile updates without audit errors rated critical or high. Record and resolve any such finding before proceeding.

**Step 3: Create minimal test configuration**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts"],
    coverage: { reporter: ["text", "json-summary"] },
  },
});
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:4321", trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --host 127.0.0.1", port: 4321, reuseExistingServer: true },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
```

**Step 4: Write and run the baseline test**

```ts
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs before VARINO migration", () => expect(true).toBe(true));
});
```

Run: `npm run test:unit && npm run readiness`

Expected: unit test passes; current build/syntax/link checks pass or an existing failure is documented before new code is added.

**Step 5: Commit only the harness**

```bash
git add package.json package-lock.json vitest.config.ts playwright.config.ts tests/unit/baseline.test.ts .gitignore
git commit -m "test: establish VARINO verification harness"
```

## Task 2: Make VARINO the single source of brand and offer truth

**Files:**
- Modify: `src/config.ts`
- Create: `tests/unit/config.test.ts`
- Modify: `scripts/check-launch-readiness.mjs`

**Step 1: Write failing configuration tests**

Assert that:

```ts
import { describe, expect, it } from "vitest";
import { MAINTENANCE_PLANS, SERVICES, SITE } from "../../src/config";

describe("VARINO configuration", () => {
  it("uses the approved identity but remains unlaunchable", () => {
    expect(SITE.name).toBe("VARINO");
    expect(SITE.tagline).toBe("Inteligencia, puesta a trabajar.");
    expect(SITE.launchReady).toBe(false);
    expect(SITE.legalOwner).toBe("");
  });

  it("publishes the approved offer ranges", () => {
    expect(SERVICES.map((s) => s.range)).toEqual([
      "750–1.500 €",
      "1.800–4.000 €",
      "3.500–12.000 €+",
    ]);
    expect(MAINTENANCE_PLANS.map((p) => p.monthly)).toEqual([
      "99 €/mes", "249 €/mes", "549 €/mes", "Desde 990 €/mes",
    ]);
  });
});
```

Run: `npm run test:unit -- config`

Expected: FAIL because the exports and identity still use SYSTRA.

**Step 2: Replace the configuration model**

Keep `SITE.launchReady: false`, empty URL/contact/legal fields, and add:

```ts
export const SERVICES = [
  {
    id: "automation-sprint",
    name: "Automation Sprint",
    range: "750–1.500 €",
    outcome: "Un proceso crítico automatizado",
    summary: "Mapeo, construcción, pruebas, documentación y transferencia de un flujo acotado.",
    deliverables: ["Mapa del proceso", "Flujo observable", "Recuperación manual", "Documentación"],
    exclusions: ["Licencias de terceros", "Cambios fuera del proceso acordado"],
  },
  {
    id: "growth-system",
    name: "Sistema de crecimiento",
    range: "1.800–4.000 €",
    outcome: "Captación, seguimiento y operaciones conectadas",
    summary: "Sistema aprobado por humanos para cualificar, preparar y seguir oportunidades.",
    deliverables: ["Captura estructurada", "Reglas de cualificación", "Borradores", "Panel de actividad"],
    exclusions: ["Compra de bases de datos", "Envío autónomo sin aprobación"],
  },
  {
    id: "private-ai",
    name: "IA privada",
    range: "3.500–12.000 €+",
    outcome: "Conocimiento y modelos bajo control",
    summary: "Asistentes, RAG y flujos locales o privados con permisos y trazabilidad.",
    deliverables: ["Arquitectura", "Prototipo", "Controles de acceso", "Evaluación y documentación"],
    exclusions: ["Hardware", "Licencias y consumo no incluidos expresamente"],
  },
] as const;

export const MAINTENANCE_PLANS = [
  { id: "care", name: "Care", monthly: "99 €/mes", includes: ["Supervisión básica", "Actualizaciones menores", "Informe mensual"] },
  { id: "managed", name: "Managed", monthly: "249 €/mes", includes: ["Monitorización", "Gestión de incidencias", "Ajustes mensuales"] },
  { id: "optimize", name: "Optimize", monthly: "549 €/mes", includes: ["Todo Managed", "Mejoras continuas", "Revisión de métricas"] },
  { id: "private-ai-ops", name: "Private AI Ops", monthly: "Desde 990 €/mes", includes: ["Operación del modelo", "Evaluación", "Seguridad y capacidad"] },
] as const;
```

Remove obsolete `SYSTRA`, `PLANES_PRECIOS`, and unsupported savings language from the source of truth.

**Step 3: Strengthen the launch checker**

Add blockers for:

- `SITE.launchReady !== true`.
- Empty URL, professional email, legal owner, NIF, address, and verified contact channel.
- Missing `ops/legal-review.json` with `{ "approved": true }`.
- Missing `ops/security-audit.json` with zero unresolved critical/high findings.
- Unverified VARINO trademark/domain flags.
- `robots.txt` not changed from `Disallow: /` only when a launch is attempted.

The checker must continue failing in local development. A red launch check is the expected safe state.

**Step 4: Run tests**

Run: `npm run test:unit -- config && npm run launch:check`

Expected: configuration tests PASS; launch check FAILS with explicit missing legal/launch items.

**Step 5: Commit**

```bash
git add src/config.ts tests/unit/config.test.ts scripts/check-launch-readiness.mjs
git commit -m "feat: define approved VARINO offer and launch gates"
```

## Task 3: Implement the V·I logo, adaptive themes, and semantic layout

**Files:**
- Modify: `src/components/Logo.astro`
- Modify: `src/layouts/Base.astro`
- Modify: `src/styles/global.css`
- Create: `public/favicon.svg`
- Modify: `scripts/check-links.mjs`
- Create: `tests/e2e/theme.spec.ts`
- Create: `tests/e2e/navigation.spec.ts`

**Step 1: Write failing browser tests**

Cover:

```ts
test("uses VARINO identity and exposes the selected V.I mark", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "VARINO, inicio" })).toBeVisible();
  await expect(page.locator('[data-logo="vi-monogram"]')).toBeVisible();
});

test("respects and persists manual dark-mode choice", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /tema/i }).click();
  const selected = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
  await page.reload();
  expect(await page.locator("html").evaluate((el) => el.classList.contains("dark"))).toBe(selected);
});
```

Run: `npx playwright test theme navigation`

Expected: FAIL on current SYSTRA logo/text.

**Step 2: Replace the logo exactly**

Use the approved rounded-square V·I monogram with the indigo point. The SVG must use `currentColor`/theme tokens, include `data-logo="vi-monogram"`, remain crisp at 16px, and not contain raster text.

**Step 3: Centralize the visual tokens**

Replace SYSTRA blue tokens with:

```css
--color-varino-indigo: #655cff;
--color-varino-graphite: #111318;
--color-varino-night: #0a0d14;
--color-varino-mineral: #f7f7f5;
```

Keep `prefers-color-scheme` as first-visit default, a visible button with `aria-pressed`, persisted `varino_theme`, and a `storage` listener so tabs stay consistent.

**Step 4: Update shared metadata and navigation**

Use configuration-derived titles, `VARINO` alt/ARIA labels, navigation to Services, Method, Security, Pricing, and Advisor. Remove hard-coded `SYSTRA AI Studio`. Keep `noindex` while `launchReady` is false.

Update `scripts/check-links.mjs` to derive the deployment base from the built URLs/configuration rather than the obsolete hard-coded `/pixelsalud` value. Test both `/` and a non-root base without changing the production deployment state.

**Step 5: Run and commit**

Run: `npm run build && npx playwright test theme navigation`

Expected: build and tests PASS in light, dark, desktop, and mobile projects.

```bash
git add src/components/Logo.astro src/layouts/Base.astro src/styles/global.css public/favicon.svg scripts/check-links.mjs tests/e2e/theme.spec.ts tests/e2e/navigation.spec.ts
git commit -m "feat: apply VARINO identity and adaptive themes"
```

## Task 4: Rebuild the truthful public site and service pages

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/servicios.astro`
- Modify: `src/pages/precios.astro`
- Modify: `src/pages/sobre.astro`
- Create: `src/pages/metodo.astro`
- Create: `src/pages/seguridad.astro`
- Create: `src/pages/servicios/automation-sprint.astro`
- Create: `src/pages/servicios/sistema-crecimiento.astro`
- Create: `src/pages/servicios/ia-privada.astro`
- Remove after replacement: `src/pages/servicios/workflows.astro`
- Remove after replacement: `src/pages/servicios/growth.astro`
- Remove after replacement: `src/pages/servicios/build.astro`
- Create: `tests/unit/claims.test.ts`
- Create: `scripts/check-claims.mjs`

**Step 1: Write the claims test**

Scan public source for forbidden unverified patterns:

```ts
const forbidden = [
  /clientes satisfechos/i,
  /casos de éxito/i,
  /ahorro garantizado/i,
  /cumplimiento 100%/i,
  /sin riesgo/i,
  /equipo de expertos/i,
];
```

The scanner must also reject hard-coded SYSTRA and numbers described as achieved results.

Run: `npm run claims:check`

Expected: FAIL until the pages are migrated.

**Step 2: Implement the approved home sequence**

Use these sections in order: promise, dual CTA, advisor preview, three offers, method, trust/local AI, pricing/maintenance preview, final advisor CTA. Remove the current unsupported 360-degree/savings language and fabricated calculator assumptions.

**Step 3: Implement service and method pages**

Each service page must state: problem, fit, deliverables, exclusions, human approvals, indicative range, maintenance choices, and next step. `metodo.astro` must show Diagnose → Design → Build → Review → Improve.

**Step 4: Implement security and responsible-AI page**

Describe actual design controls only. Mark future certifications or audits as planned, never completed.

**Step 5: Run and commit**

Run: `npm run claims:check && npm run readiness`

Expected: PASS, with launch check still deliberately red.

```bash
git add src/pages src/config.ts scripts/check-claims.mjs tests/unit/claims.test.ts
git commit -m "feat: rebuild truthful VARINO public offer"
```

## Task 5: Create the tangible-systems image pipeline

**Files:**
- Create: `ops/images/README.md`
- Create: `ops/images/manifest.json`
- Create: `ops/images/workflows/varino-systems.json` only if a verified local ComfyUI workflow is available
- Create: `scripts/check-image-manifest.mjs`
- Create: `public/images/varino/hero.avif`
- Create: `public/images/varino/automation.avif`
- Create: `public/images/varino/growth.avif`
- Create: `public/images/varino/private-ai.avif`
- Modify: `package.json`

**Step 1: Inventory the local generator without downloading anything**

Run read-only checks for ComfyUI, installed checkpoints, model licenses, and available workflows. Record exact paths and license sources in `ops/images/README.md`. If no licensed workflow is verifiable, use CSS/SVG tangible-system art and mark raster generation blocked; do not download a model implicitly.

**Step 2: Define the manifest contract**

Each published asset entry requires:

```json
{
  "file": "public/images/varino/hero.avif",
  "kind": "ai-generated-abstract",
  "model": "verified model name and version",
  "license": "license identifier or URL",
  "seed": 0,
  "promptFile": "ops/images/prompts/hero.txt",
  "reviewed": true,
  "depictsRealClient": false
}
```

**Step 3: Add a blocking manifest check**

The script fails if an image is missing, unreviewed, lacks model/license provenance, or claims to depict a real client.

**Step 4: Produce and optimize the abstract assets locally**

Generate only abstract materials/paths/light. Export responsive AVIF/WebP sizes, compare for artifacts, and keep source workflow/seed. Do not generate testimonial people or fake offices.

**Step 5: Run and commit**

Run: `node scripts/check-image-manifest.mjs && npm run build`

Expected: PASS, or the task remains explicitly blocked on a licensed local model rather than substituting unknown assets.

## Task 6: Build the advisor domain model with no external writes

**Files:**
- Create: `src/lib/advisor/types.ts`
- Create: `src/lib/advisor/questions.ts`
- Create: `src/lib/advisor/recommend.ts`
- Create: `src/lib/advisor/state.ts`
- Create: `tests/unit/advisor-recommend.test.ts`
- Create: `tests/unit/advisor-state.test.ts`

**Step 1: Write failing recommendation tests**

Test representative cases:

```ts
expect(recommend({ friction: "manual", sensitivity: "low", scope: "one-process" }).service)
  .toBe("automation-sprint");
expect(recommend({ friction: "sales-followup", sensitivity: "medium", scope: "multi-process" }).service)
  .toBe("growth-system");
expect(recommend({ friction: "knowledge", sensitivity: "high", localRequired: true }).service)
  .toBe("private-ai");
```

Also assert the function returns rationale, indicative range, missing questions, and never a binding quote.

**Step 2: Define explicit states**

```ts
export type AdvisorStage =
  | "intro" | "needs" | "context" | "sensitivity"
  | "recommendation" | "summary" | "consent" | "submitted" | "error";
```

Transitions must reject skipping `summary` or `consent` before `submitted`.

**Step 3: Implement the minimum pure functions**

Keep question selection, recommendation, redaction warnings, and transitions deterministic and independently testable. Do not call a model in this layer.

**Step 4: Run and commit**

Run: `npm run test:unit -- advisor`

Expected: PASS.

```bash
git add src/lib/advisor tests/unit/advisor-*.test.ts
git commit -m "feat: add deterministic VARINO advisor domain"
```

## Task 7: Implement the accessible advisor UI and demo fallback

**Files:**
- Create: `src/components/VarinoAdvisor.astro`
- Create: `src/components/AdvisorSummary.astro`
- Modify: `src/layouts/Base.astro`
- Remove after replacement: `src/components/SystraCopilot.astro`
- Create: `tests/e2e/advisor.spec.ts`
- Create: `tests/e2e/advisor-accessibility.spec.ts`

**Step 1: Write the failing end-to-end journey**

The test opens the advisor, confirms the AI disclosure, completes one-question-at-a-time answers, edits the summary, reaches consent, and verifies that demo mode does not transmit data.

**Step 2: Implement progressive disclosure**

Requirements:

- Accessible dialog name, focus trap, Escape close, focus return.
- One question at a time with text and keyboard-operable choices.
- `aria-live="polite"` status updates without duplicating the full transcript.
- Local draft key `varino_advisor_draft_v1`; no local persistence of contact details after successful submission.
- Clear “Do not include passwords, secrets, or third-party sensitive data” warning.
- Editable final summary.
- Separate required submission consent from optional marketing consent.
- With `SITE.launchReady === false`, the submit control stores nothing externally and clearly labels demo mode.

**Step 3: Add a no-JavaScript fallback**

Link to `/contacto/` with a structured accessible form. Preserve answers already entered when the UI switches to fallback.

**Step 4: Run and commit**

Run: `npx playwright test advisor`

Expected: complete journey and accessibility assertions PASS on desktop/mobile and light/dark.

```bash
git add src/components/VarinoAdvisor.astro src/components/AdvisorSummary.astro src/layouts/Base.astro src/components/SystraCopilot.astro tests/e2e/advisor*.spec.ts
git commit -m "feat: add consent-first VARINO advisor experience"
```

## Task 8: Define the D1 data model and secure API contract

**Files:**
- Create: `wrangler.toml`
- Create: `migrations/0001_varino.sql`
- Create: `functions/_lib/env.ts`
- Create: `functions/_lib/http.ts`
- Create: `functions/_lib/schemas.ts`
- Create: `functions/api/briefings.ts`
- Create: `tests/unit/api-briefings.test.ts`

**Step 1: Write API contract tests**

Cover: invalid schema → 400; oversized field → 413/400; missing consent → 422; repeated idempotency key → same lead/job; valid submission → 201; no raw personal data in errors.

**Step 2: Create the migration**

Tables: `leads`, `consents`, `briefings`, `recommendations`, `jobs`, `drafts`, `audit_events`. Add foreign keys, created/updated timestamps, constrained state values, unique `idempotency_key`, and indexes on job state/created time. Do not store transcript text when structured answers suffice.

**Step 3: Validate the request before database access**

Use Zod with strict objects, maximum lengths, email normalization, URL validation, and rejected unknown fields. Bindings include `VARINO_DB`, `TURNSTILE_SECRET`, `WORKER_TOKEN_HASH`, `ENVIRONMENT`.

**Step 4: Implement atomic creation**

Create lead, consent, briefing, recommendation, initial job, and audit event in one D1 batch. Return only public IDs and status.

**Step 5: Test locally and commit**

Run:

```bash
npx wrangler d1 migrations apply VARINO_DB --local
npm run test:unit -- api-briefings
```

Expected: migration and tests PASS; no cloud resource is created.

```bash
git add wrangler.toml migrations functions tests/unit/api-briefings.test.ts
git commit -m "feat: add validated briefing API and D1 schema"
```

## Task 9: Add anti-abuse, consent versioning, and safe submission

**Files:**
- Create: `functions/_lib/turnstile.ts`
- Create: `functions/_lib/rate-limit.ts`
- Modify: `functions/api/briefings.ts`
- Modify: `src/components/VarinoAdvisor.astro`
- Create: `src/content/legal/consent-v1.ts`
- Create: `tests/unit/consent.test.ts`

**Step 1: Write failing tests**

Assert that a consent record contains notice version, purposes, timestamp, and affirmative action; marketing consent defaults false; revoked/expired token or missing Turnstile verification is rejected outside local mode.

**Step 2: Implement local versus future-production behavior**

- `ENVIRONMENT=local`: use official Turnstile test keys and a deterministic local limit.
- Any other environment: fail closed if Turnstile or rate-limit binding is absent.
- Never use IP address as a permanent CRM identifier. If temporarily processed for abuse prevention, document the retention and hash/rotate as appropriate.

**Step 3: Connect the advisor only to the local Pages Function**

The advisor must submit only when an explicit local API feature flag is enabled. Default remains demo/no-write until the local backend is deliberately started.

**Step 4: Run and commit**

Run: `npm run test:unit -- consent api-briefings && npx playwright test advisor`

Expected: PASS, including equal separation between required submission and optional marketing choices.

## Task 10: Build the authenticated local worker and n8n workflow

**Files:**
- Create: `functions/api/jobs/claim.ts`
- Create: `functions/api/jobs/result.ts`
- Create: `ops/worker/varino-worker.mjs`
- Create: `ops/worker/schema.mjs`
- Create: `ops/n8n/varino-briefing-worker.json`
- Create: `tests/unit/worker.test.ts`
- Create: `ops/LOCAL-AI-RUNBOOK.md`

**Step 1: Write queue transition tests**

Test `pending → claimed → completed`, lease expiry back to pending, capped retry to `manual_review`, idempotent result submission, and rejection of an unapproved job type.

**Step 2: Implement token-authenticated job endpoints**

Use constant-time comparison against a stored token hash, lease one job atomically, return only allowlisted structured fields, and accept only a schema-valid draft result. The API never exposes all leads to the worker.

**Step 3: Implement the localhost worker**

The process:

1. Polls the API over HTTPS/outbound only.
2. Calls `http://127.0.0.1:11434/api/chat` with a pinned model from environment.
3. Separates system instructions from untrusted lead content.
4. Requires JSON output with `researchQuestions`, `scopeDraft`, `risks`, and `unknowns`.
5. Validates and posts the draft; it never sends email or invokes customer systems.

Bind its local listener to no network interface; it should not need one.

**Step 4: Export an equivalent n8n workflow**

The workflow must contain no credentials, use environment credential references, manual activation, error branch, capped retry, and an approval end state. Validate the JSON with `jq empty` and import it into local n8n without activating it.

**Step 5: Run a realistic Ollama tool-free cycle**

Use synthetic lead data only. Verify the draft schema, injection resistance cases, offline queue behavior, and `ollama ps` context/model after the run.

**Step 6: Commit**

```bash
git add functions/api/jobs ops/worker ops/n8n tests/unit/worker.test.ts ops/LOCAL-AI-RUNBOOK.md
git commit -m "feat: add outbound-only local AI preparation worker"
```

## Task 11: Add the human approval dashboard

**Files:**
- Create: `src/pages/admin/index.astro`
- Create: `src/pages/admin/leads/[id].astro`
- Create: `src/components/admin/LeadSummary.astro`
- Create: `src/components/admin/DraftReview.astro`
- Create: `functions/_lib/admin-auth.ts`
- Create: `functions/api/admin/leads.ts`
- Create: `functions/api/admin/approve.ts`
- Create: `functions/api/admin/delete.ts`
- Create: `tests/unit/approval.test.ts`
- Create: `tests/e2e/admin.spec.ts`

**Step 1: Write state-machine tests**

Only a human-authenticated action may change `draft → approved` or `draft → rejected`. Approval requires reviewer identity, timestamp, current version, and an audit event. A model/worker token must receive 403.

**Step 2: Protect the admin surface**

In local mode, bind to `127.0.0.1` and require a development admin secret. In future Cloudflare mode, verify the Cloudflare Access JWT issuer, audience, signature, and email allowlist server-side. Never place an admin token in static JavaScript or localStorage.

**Step 3: Implement dashboard functions**

List minimal lead summaries, open a versioned draft, edit, approve/reject, export JSON, and request deletion. Every write creates an audit event. No “send” button exists in the launch version.

**Step 4: Run and commit**

Run: `npm run test:unit -- approval && npx playwright test admin`

Expected: worker/non-admin access denied; human approval path PASS; admin routes remain noindex.

## Task 12: Implement truthful legal drafts and privacy operations

**Files:**
- Modify: `src/pages/aviso-legal.astro`
- Modify: `src/pages/privacidad.astro`
- Modify: `src/pages/cookies.astro`
- Modify: `src/pages/contacto.astro`
- Remove if unused: `src/components/CookieBanner.astro`
- Create: `ops/legal/processing-inventory.md`
- Create: `ops/legal/vendor-register.md`
- Create: `ops/legal/retention-schedule.md`
- Create: `ops/legal/rights-runbook.md`
- Create: `ops/legal/breach-runbook.md`
- Create: `tests/unit/legal-gates.test.ts`

**Step 1: Write legal-gate tests**

Fail if a publicable build contains “Pendiente de completar”, empty controller identity, unreviewed provider register, missing consent version, or an enabled tracker absent from the cookie inventory.

**Step 2: Keep the local site cookieless by default**

Theme/advisor localStorage is documented as local storage. Do not show a cookie banner when there are no non-essential cookies. If a future tracker is added, the launch test must require prior blocking, equal accept/reject visibility, granular settings, and withdrawal.

**Step 3: Correct draft legal content**

Do not assert a blanket five-year minimum or broad liability exclusions without review. Use explicit draft markers and configuration-driven identity. Document real planned processing and providers only.

**Step 4: Add operational runbooks**

Include identity verification proportionate to a rights request, response tracking, deletion propagation to backups, breach triage, 72-hour assessment workflow where applicable, and contact/escalation roles. Mark lawyer/gestor approval as required for launch.

**Step 5: Run and commit**

Run: `npm run test:unit -- legal && npm run launch:check`

Expected: unit tests PASS; launch check remains red because real legal identity/review is intentionally absent.

## Task 13: Harden CSP, headers, secrets, and dependencies

**Files:**
- Modify: `astro.config.mjs`
- Modify: `public/_headers`
- Create: `scripts/check-security-headers.mjs`
- Create: `scripts/check-secrets.mjs`
- Create: `security/threat-model.md`
- Create: `security/security-test-cases.md`
- Modify: `package.json`

**Step 1: Create failing header tests**

Require at least: CSP with `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, restricted `connect-src`, `form-action`, no wildcard; HSTS only for future HTTPS production; `nosniff`; strict referrer policy; permissions policy; COOP. Flag `script-src 'unsafe-inline'` as a failure.

**Step 2: Remove inline executable script requirements**

Move theme/menu/advisor code into Astro-processed modules or external modules. Replace JSON-LD with CSP-compatible output (microdata or a reviewed hash strategy). Tighten production headers without breaking the local build.

**Step 3: Add secret scanning**

Scan tracked files and build output for API-key/token/private-key patterns. Allow only documented dummy/test values. Do not print discovered secret values.

**Step 4: Write the threat model**

Cover assets, actors, trust boundaries, spoofing/tampering/repudiation/disclosure/denial/elevation, prompt injection, queue abuse, D1 authorization, local worker compromise, supply chain, backup, and admin session.

**Step 5: Run authorized checks and commit**

Run:

```bash
npm audit --audit-level=high
npm run build
npm run security:headers
node scripts/check-secrets.mjs
```

Expected: zero unresolved critical/high dependency findings; header and secret checks PASS.

## Task 14: Add accessibility, visual, performance, and security regression gates

**Files:**
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `tests/e2e/responsive.spec.ts`
- Create: `tests/e2e/security.spec.ts`
- Create: `scripts/check-performance-budget.mjs`
- Create: `security/zap-baseline.conf`
- Modify: `package.json`

**Step 1: Add axe tests for every launch page**

Run axe on home, services, each service page, pricing, method, security, about, contact, and legal pages in both themes. Fail on serious/critical violations. Add manual checks for keyboard order, dialog focus, 200% zoom, reduced motion, and screen-reader announcements.

**Step 2: Add responsive visual snapshots**

Capture approved key sections at 390×844, 768×1024, and 1440×1000 in light/dark. Mask timestamps/unstable data. The first baseline requires human review; later unexplained diffs fail.

**Step 3: Add performance budgets**

Fail if a key page exceeds agreed initial budgets: JavaScript 180 KB compressed, CSS 120 KB compressed, unoptimized hero image 300 KB, or layout shift caused by images without dimensions. Run Lighthouse locally and target 90+ in performance/accessibility/best-practices/SEO without treating the score as the only quality proof.

**Step 4: Run authorized dynamic scanning**

Run OWASP ZAP baseline only against `127.0.0.1` or a user-approved staging URL. Never scan unrelated or third-party systems. Triage every alert; record false positives with evidence.

**Step 5: Commit**

```bash
git add tests/e2e scripts/check-performance-budget.mjs security/zap-baseline.conf package.json package-lock.json
git commit -m "test: add VARINO launch quality gates"
```

## Task 15: Build the consolidated readiness command and evidence pack

**Files:**
- Modify: `package.json`
- Modify: `scripts/check-launch-readiness.mjs`
- Create: `ops/audits/README.md`
- Create: `ops/LAUNCH-CHECKLIST.md`
- Create: `ops/LOCAL-ONLY.md`

**Step 1: Define the local quality command**

Set:

```json
{
  "quality": "npm run test:unit && npm run build && npm run scripts:syntax && npm run links:check && npm run claims:check && npm run security:headers && node scripts/check-secrets.mjs && node scripts/check-image-manifest.mjs && npm run test:e2e",
  "readiness": "npm run quality && npm run launch:check"
}
```

`quality` may become green locally. `readiness` must stay red until real launch inputs and approvals exist.

**Step 2: Generate an evidence index**

`ops/audits/README.md` links to the exact command outputs, date, commit, environment, unresolved findings, legal review, accessibility manual checks, ZAP report, dependency report, backup restoration, and advisor scenario matrix. Do not claim an audit passed without attached evidence.

**Step 3: Verify the offline/local-only state**

Confirm:

- `SITE.launchReady === false`.
- `robots.txt` is `Disallow: /`.
- No deploy command has run.
- No DNS/domain change was made.
- No real recipient email, WhatsApp, analytics ID, payment key, or production database credential exists in client output.
- Contact/advisor submission is demo or local API only.

**Step 4: Run the full suite**

Run: `npm run quality`

Expected: PASS.

Run: `npm run readiness`

Expected: FAIL only on explicit real-world launch prerequisites such as identity, legal review, trademark/domain approval, and publication authorization.

**Step 5: Commit**

```bash
git add package.json scripts/check-launch-readiness.mjs ops/audits/README.md ops/LAUNCH-CHECKLIST.md ops/LOCAL-ONLY.md
git commit -m "chore: consolidate VARINO local readiness evidence"
```

## Task 16: Final local acceptance review

**Files:**
- Create: `ops/audits/local-acceptance-2026-09-02.md`
- Update only if needed: files implicated by failing tests

**Step 1: Execute the acceptance matrix**

Use synthetic data to complete:

- Three advisor recommendations, including private/local AI.
- Summary edit and consent version capture.
- Duplicate submission/idempotency.
- Mac/worker offline then recovery.
- Prompt-injection attempt stored as data, not executed.
- Invalid model output routed to manual review.
- Human approve/reject; worker cannot approve.
- Export and deletion including audit evidence.
- Mobile/light/dark/keyboard/screen-reader smoke tests.
- Backup restoration.

**Step 2: Record evidence-bound status**

Classify every item as `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`. Link exact logs/screenshots. Never convert `BLOCKED` into `PASS` based on intention.

**Step 3: Fix only in-scope failures and rerun targeted tests**

For each failure: write/reproduce the failing test, make the minimum fix, rerun the targeted test, then rerun `npm run quality`.

**Step 4: Stop before publication**

Report:

- What is locally complete.
- What remains manually required.
- What is legally blocked.
- What is security-blocked.
- The single next highest-leverage action.

Do not publish. Wait for explicit launch authorization in a later task.

**Step 5: Commit the evidence**

```bash
git add ops/audits/local-acceptance-2026-09-02.md
git commit -m "docs: record VARINO local acceptance evidence"
```
