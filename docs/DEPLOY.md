# Deploy (no secrets pasted anywhere)

D1 and R2 exist in the Pangsokheng5 account and are bound in `wrangler.jsonc`. The database is new: apply all migrations with `npm run db:remote` before the first deploy.
```
npm install && npm run typecheck && npm test && npm run build
npx wrangler login            # browser OAuth, nothing to paste
npx wrangler deploy
# optional, interactive prompts (never in chat):
npx wrangler secret put ENTRUPY_API_KEY
npx wrangler secret put GEMINI_API_KEY       # Google AI Studio key (has a free tier), OR
npx wrangler secret put ANTHROPIC_API_KEY
# then set AI_MODEL in wrangler.jsonc "vars" to a vision-capable model id from the provider's model list
```
Open the site → first screen creates the owner account (min 12-char password). New migrations: `npx wrangler d1 migrations apply hengz-authentic --remote`.
