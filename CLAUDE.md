# HENGZ AUTHENTIC — project rules for Claude Code
- Never make the system (code, rules or AI) output "authentic"/"fake" or issue a certificate on its own. Outcomes are the four in `src/shared/types.ts`.
- Only exception (approved by the owner): a HENGZ AUTHENTIC expert certificate, issued BY HAND by a named staff expert, only for a verification request the experts answered `consistent_with_references` (DB triggers in `0018_hengz_certificates.sql` enforce it). Wording: "Verified by HENGZ AUTHENTIC expert — consistent with HENGZ AUTHENTIC references"; guarantee valid only for buy-back by HENGZ AUTHENTIC. Numbered, QR-checkable, immutable, revocable; revoked automatically if the expert answer changes. Never let AI or automation issue one.
- Never let draft rules or `ai_suggested` observations affect outcomes. Never weaken DB triggers/CHECKs in migrations.
- Never ask for, print or store secrets; use `wrangler secret put` / `wrangler login`.
- No demo/fake data. Empty states say "no data".
- UI strings go in `src/web/i18n.tsx` (km + en). Design tokens: `tailwind.config.js` (Haute Verification); references in `design-reference/stitch`.
- Commands: `npm test` (engine), `npm run typecheck`, `npm run build`, `npx wrangler dev`.
