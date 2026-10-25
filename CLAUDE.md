# HENGZ AUTHENTIC — project rules for Claude Code
- Never make the system output "authentic"/"fake" or issue a certificate. Outcomes are the four in `src/shared/types.ts`.
- Never let draft rules or `ai_suggested` observations affect outcomes. Never weaken DB triggers/CHECKs in migrations.
- Never ask for, print or store secrets; use `wrangler secret put` / `wrangler login`.
- No demo/fake data. Empty states say "no data".
- UI strings go in `src/web/i18n.tsx` (km + en). Design tokens: `tailwind.config.js` (Haute Verification); references in `design-reference/stitch`.
- Commands: `npm test` (engine), `npm run typecheck`, `npm run build`, `npx wrangler dev`.
