# VARINO Agency Platform Design

Date: 2026-09-02  
Status: Approved design; local-only until launch review

## 1. Objective

Build VARINO as a premium Spanish AI agency and its first operating system: a clean public website, an interactive AI advisor, a lightweight CRM, a local AI preparation worker, and a human approval queue.

The 90-day commercial objective is to validate demand and reach EUR 1,500–3,000 in monthly revenue, while designing a service model that can later exceed EUR 10,000 per month. The founder can dedicate 5–10 hours per week and has an initial three-month budget of EUR 100–500.

Everything remains local and non-public until the launch gates in this document pass. No real lead collection, analytics, marketing email, payment, or public deployment is enabled before that point.

## 2. Positioning and Brand

### Name

**VARINO**

- Spanish: Valor · Automatización · Resultados · Inteligencia · Negocio · Operaciones
- English: Value · Automation · Results · Intelligence · Networks · Operations

VARINO is provisional until domain, social handle, OEPM, and EUIPO clearance is completed.

### Verbal system

- Main slogan: **Inteligencia, puesta a trabajar.**
- Commercial message: **Del proceso al progreso.**
- Outcome promise: **Menos fricción. Más capacidad.**

Copy focuses on business outcomes instead of lists of tools. It must not claim clients, results, team members, certifications, or metrics that do not exist.

### Logo

Use the selected V·I monogram: a rounded-square symbol combining Valor and Inteligencia, with an indigo dot. The complete system includes:

- Symbol plus VARINO wordmark for headers and documents.
- Isolated symbol for favicon, advisor avatar, and social profiles.
- Light, dark, and monochrome variants.
- Legibility checks at favicon and small mobile sizes.

### Visual system

The default direction is **Precisión luminosa**: mineral white, graphite, and indigo. The night variant uses deep graphite/navy, white, and the same indigo accent.

The first visit follows `prefers-color-scheme`. A visible manual switch overrides it, and the local preference persists. Both themes have the same information, hierarchy, functionality, and accessibility.

### Image direction

Use **Sistemas tangibles**: locally generated abstract materials, paths, and light combined with truthful product interfaces. Avoid robots, glowing brains, generic circuit boards, and generated people presented as clients.

Generation workflows must record model, version, seed, prompt, and source file. Model, font, and asset licenses are reviewed before publication. Images use responsive AVIF/WebP outputs, meaningful alternatives where needed, and decorative treatment where appropriate.

## 3. Service Model

### Core offers

1. **Automation Sprint — EUR 750–1,500**  
   Automate one high-friction process in a short, bounded engagement.

2. **Growth and Operations System — EUR 1,800–4,000**  
   Connect acquisition, follow-up, proposal, and operational workflows.

3. **Private/Local AI — EUR 3,500–12,000+**  
   Local or private assistants, retrieval systems, controlled knowledge, and tailored AI workflows.

Prices are indicative ranges, not contractual quotes. A human confirms scope and price after discovery.

### Recurring plans

- Care: EUR 99/month
- Managed: EUR 249/month
- Optimize: EUR 549/month
- Private AI Ops: from EUR 990/month

Each implementation can be sold as a handoff without mandatory maintenance or as a managed system with an explicitly agreed recurring plan. Contracts define limits, support windows, changes, third-party costs, and service levels.

### Initial market

The website remains sector-neutral, but outbound validation begins with Spanish B2B agencies and consultancies of roughly 3–30 people. Sector pages are not published until recurring problems and objections are supported by real conversations.

## 4. Public Website

### Primary conversion

The primary call to action opens the VARINO advisor. The secondary route lets visitors inspect services and indicative pricing without conversing.

### Launch sitemap

- Home
- Services overview
  - Automation Sprint
  - Growth and Operations System
  - Private/Local AI
- Pricing
- Method
- Security and Responsible AI
- About and Contact
- Legal notice, Privacy, and Cookies
- Global VARINO advisor

The home page sequence is:

1. Clear business promise.
2. Advisor entry and service entry.
3. Three service paths.
4. From conversation to reviewed solution.
5. Privacy, security, and local-AI trust block.
6. Indicative prices and maintenance.
7. Final advisor call to action.

No case study, client logo, testimonial, or performance figure appears until it is real, documented, and authorized.

### Deferred pages and features

- Real case studies
- Sector landing pages
- Resource/SEO library
- Client portal
- English localization
- Payments, signatures, and advanced multichannel integrations

Each deferred item requires evidence that it will improve revenue, reduce operating work, or satisfy a repeated client need.

## 5. Advisor Experience

### Visitor flow

1. The advisor identifies itself as an AI system.
2. It asks one question at a time using plain language.
3. It gathers objective, process, friction, volume, current tools, data sensitivity, budget range, timeline, company, and contact details only when relevant.
4. It offers a preliminary service recommendation and indicative range.
5. The visitor receives an editable summary.
6. The system explains purpose, retention, and rights and asks for explicit submission consent.
7. Only after confirmation does it save a lead and enqueue preparation work.

The public chat never asks for passwords, API keys, confidential documents, health data, or other unnecessary sensitive information.

### Internal flow

The internal view contains:

- Lead and consent record.
- Structured briefing.
- Preliminary fit score with explainable factors.
- Recommended service and range.
- Research notes and unanswered questions.
- Draft scope/proposal.
- Approve, edit, reject, export, and delete actions.

AI may prepare research, questions, scope, and drafts. It cannot send messages, create a binding quote, accept terms, request access, spend money, or start external/facturable work without human approval.

## 6. Technical Architecture

### Public zone

- Astro static site on a free-tier static host.
- Minimal server endpoint for submissions.
- HTTPS, strict security headers, Content Security Policy, request-size limits, schema validation, rate limiting, and anti-abuse challenge.
- No secret, model endpoint, n8n endpoint, or database administrator credential in the browser.

### Control zone

- Small database/CRM for leads, consent, briefings, job state, approvals, and audit events.
- Row/role-level access rules and least-privilege service credentials.
- Server-side secret management.
- Explicit retention, export, and deletion workflows.

### Local workshop

- n8n and Ollama run only on localhost or a private local network.
- A local worker polls an authenticated job queue using outbound connections.
- It processes only fields authorized for the task and returns a draft to the control zone.
- Ollama and n8n are not exposed through a public tunnel and do not accept unsolicited inbound Internet traffic.

This architecture permits the Mac to be offline: leads remain queued until the worker returns.

### Core data entities

- `lead`: identity, company, source, status, owner, timestamps.
- `consent`: notice version, purposes, affirmative action, timestamp, withdrawal.
- `briefing`: goals, process, friction, volume, tools, sensitivity, budget, timeline.
- `recommendation`: service, rationale, range, confidence, model/version.
- `job`: type, authorized input reference, state, attempts, idempotency key, errors.
- `draft`: research, questions, scope, proposal, version, approval state.
- `audit_event`: actor, action, object, timestamp, result, safe metadata.

Personal data must not be copied into raw application logs.

## 7. Failure Handling

- Advisor state survives navigation and transient submission errors.
- If the conversational layer is unavailable, the user can switch to an accessible guided form without re-entering completed answers.
- Submissions use idempotency keys to prevent duplicate leads and jobs.
- Local worker failures retry with capped exponential backoff and then enter a visible manual-review state.
- Model calls have timeouts, input/output size limits, and validated structured outputs.
- Invalid or unsafe model output is stored as a failed draft, never as an approved action.
- Email or integration failures remain visible and retryable; success is never inferred from dispatch alone.
- User-facing errors explain the next action without exposing stack traces, secrets, or internal identifiers.

## 8. Security Design

- Threat model covers public forms, authentication, authorization, database rules, supply chain, local worker, model/tool boundary, and admin panel.
- User content is treated as untrusted data, not system instructions.
- Tool access is allowlisted and scoped; the public advisor has no external-action tools.
- Administrative access uses strong authentication, session expiration, CSRF protection where applicable, and least privilege.
- Secrets are scanned and rotated; none are committed or shipped to clients.
- Dependencies are locked and reviewed; automated scanning does not replace manual review.
- Encrypted backups are tested by restoration.
- Security events and administrative changes are auditable without excessive personal-data logging.
- A responsible disclosure contact and incident response process are documented.

## 9. Legal and Compliance Gates

Compliance is designed and tested locally, but legal pages are not populated with invented identity information. Real collection, tracking, contracting, and marketing remain disabled until the responsible person or entity is known.

Before public launch:

- Confirm business/fiscal status and truthful legal identity.
- Complete domain, social, OEPM, and EUIPO name checks.
- Inventory processing activities, purposes, legal bases, retention, recipients, subprocessors, and international transfers.
- Produce and professionally review Legal Notice, Privacy, Cookies, service terms, and consent wording.
- Complete AEPD low-risk/startup tooling or a fuller risk assessment as appropriate.
- Perform a data protection impact assessment before any processing likely to create high risk.
- Sign data-processing and subprocessor terms where required.
- Keep non-essential cookies blocked until valid consent; show accept and reject at equal prominence and support withdrawal.
- Identify the advisor as AI, explain limits, provide human review, and satisfy applicable AI transparency and literacy duties.
- Review accessibility obligations under Spanish Law 11/2023; WCAG 2.2 AA remains the product baseline regardless of exemption.
- Define rights handling, breach assessment/notification, deletion, backup retention, and evidence retention.
- Review electronic communications, contracting, consumer, pricing/tax, invoice, intellectual-property, and synthetic-media requirements.

Primary official references include GDPR, LOPDGDD, LSSI-CE, the AEPD cookie guidance and compliance tools, EU Regulation 2024/1689, and Spanish Law 11/2023. A Spanish legal professional performs the final contextual review. No document or tool by itself guarantees compliance or zero regulatory risk.

## 10. Testing and Release Gates

### Required testing

- Unit tests for validation, recommendation rules, consent versions, permissions, and state transitions.
- Integration tests for submission, database rules, job queue, local worker, approval, export, and deletion.
- End-to-end tests for the main visitor journey, failure fallback, admin approval, and data-rights flows.
- Prompt-injection and tool-boundary scenarios.
- Rate-limit, spam, malformed payload, oversized payload, and repeated-submission tests.
- Keyboard, screen-reader, contrast, zoom, motion, and theme accessibility checks.
- Responsive visual regression across representative mobile and desktop viewports.
- Performance, metadata, structured data, indexing, and broken-link checks.
- Static analysis, dependency audit, secret scan, security-header/TLS review, and authorized dynamic scanning against local/staging targets.
- Backup restoration and incident-response tabletop exercise.

### Publication blockers

Do not publish if any of these remain:

- Unresolved critical or high security vulnerability.
- Missing legal identity or contextual legal review.
- Non-essential data or cookies collected without a valid basis/consent.
- Broken export, withdrawal, correction, or deletion path.
- AI can send, promise, spend, request access, or start work without human approval.
- Fictitious proof, misleading synthetic media, or unverified claims.
- Critical visitor or admin path fails on supported mobile or desktop environments.

## 11. Delivery Strategy

Implementation will be split into independently verifiable increments:

1. Brand tokens, logo system, dual theme, and static public content.
2. Advisor interface with local mock data and no external writes.
3. CRM schema, consent, and secure submission endpoint.
4. Local worker with Ollama/n8n and approval-only output.
5. Admin review, export, deletion, and audit trail.
6. Security, accessibility, performance, legal, and launch-readiness gates.
7. Staging review, professional legal review, and explicit user authorization to publish.

No implementation increment silently changes the public deployment state.

## 12. Success Criteria

The design is successful when:

- A visitor can identify the appropriate offer and submit an informed, editable briefing.
- The founder receives a structured opportunity and a useful draft without exposing local services.
- No external action happens without human approval.
- The site contains no invented proof and remains credible as a new agency.
- Failure states preserve data safely and provide a manual recovery path.
- Legal, security, accessibility, and operational evidence is available before publication.
- The first service can be sold and delivered within the founder's time and budget constraints.

