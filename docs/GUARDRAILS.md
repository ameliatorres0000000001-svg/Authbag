# Guardrails (enforced in the database, not only in code)

| Guardrail | Mechanism |
|---|---|
| Audit log append-only + hash chained | triggers block UPDATE/DELETE; `/api/audit/verify` |
| Approved rules immutable | trigger `rules_approved_immutable`; change = new version |
| 4-eyes approval | `approvals_required` setting (default 2); author cannot approve own rule |
| Reference asset cannot be approved with unknown licence or seller-claim/unverified label | CHECK constraint |
| Provider cannot be `connected` without `last_test_ok=1` | CHECK `COALESCE(last_test_ok,0)=1` |
| User-uploaded certificate cannot be `verified` | CHECK + API only creates `unverified` |
| AI never decides | engine ignores `ai_suggested`; `humanSignoffRequired` always true |
| Photos | magic-byte sniff, EXIF stripped client-side, private R2 |

Legal notes (not legal advice): Entrupy ToS forbids reselling/white-labelling its service and does not allow using its images for your own training; do not use its name/logo as if affiliated. Do not publish "authentic/fake" verdicts to third parties without a named expert and a clear disclaimer; check Cambodian consumer-protection rules with a local lawyer.
