You are continuing the project in this folder (read CLAUDE.md and docs/ first).
Status: the engine (16 tests), D1 schema/seed (already applied remotely), Worker API and React UI were written WITHOUT being installed/built (npm was unreachable). Treat UI and Worker as unverified.

Do in order, stopping to report if blocked:
1. `npm install`, `npm run typecheck`, `npm test`, `npm run build`. Fix every error without weakening guardrails.
2. `npx wrangler dev` and exercise: bootstrap owner → create inspection → upload photos → add observations → evaluate → rule create/submit/approve with a second user → provider test → audit verify. Fix bugs. Add Worker tests (vitest + @cloudflare/vitest-pool-workers) for auth, 4-eyes, DB CHECK errors mapping to 4xx.
3. Compare screens with `design-reference/stitch/*/screen.png` (+ code.html) and polish the UI to match, incl. mobile and a side-by-side comparator and UV-mode capture guidance.
4. `npx wrangler login` then `npx wrangler deploy` (user runs the login). Do not request secrets in chat.
Then continue with prompts/10_*.md.
