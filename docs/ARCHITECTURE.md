# Architecture

**Principle:** AI proposes, rules decide, a named human signs. Nothing here issues a certificate.

- Cloudflare Worker (Hono) → `/api/*`; React SPA served as Workers assets.
- D1 (`hengz-authentic`, id in `wrangler.jsonc`) holds taxonomy, rules, inspections, audit. R2 `hengz-vault-private` holds photos (private; served only through authenticated `/api/captures/:id/image`).
- `src/shared/engine.ts` is a pure function (tests in `test/engine.test.ts`). Same input + same approved rules ⇒ same outcome. Each evaluation stores the engine version and a rules snapshot hash.
- Outcomes: `insufficient_evidence`, `requires_expert_review`, `concerns_found`, `consistent_with_references`. Never "authentic"/"fake".
- Draft/pending rules are shown as hints only. `ai_suggested` observations never count until an appraiser confirms them (`ai_confirmed`).
- Date codes: decoded from data tables (`datecode_formats`, `factory_codes`); only approved rows influence results. Seeded rows are draft, tier-4 community sources.
- Providers (Entrupy etc.): adapter slot; "connected" only after a real successful test call (DB CHECK enforces). Provider-verified certificates can only come from a provider sync, never from user input.

See GUARDRAILS.md, DATA_REQUIREMENTS.md, AI_TEACHING_PLAN.md, DEPLOY.md, PROVIDER_ADAPTERS.md.
