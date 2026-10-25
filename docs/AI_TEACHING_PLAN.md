# Teaching the AI without much money

1. **Don't fine-tune first.** Use a vision model only to *describe* closeups into the fixed observation vocabulary (`/api/captures/:id/suggest`). Appraiser confirms.
2. **Golden set:** 50–100 items with confirmed truth (own purchases, boutique receipts, provider certificates). Build `scripts/eval`: run suggest + engine, report per-observation accuracy and rate of wrong "consistent" outcomes (target ≈0).
3. **Retrieval-augmented few-shot (L3):** put 3–5 approved reference crops of the same model/era in the prompt for each component. Needs approved authentic assets.
4. **Annotation flywheel:** each appraiser correction of an AI suggestion is a labelled example (store as `ai_confirmed` vs original).
5. **Active learning:** prioritise review of low-confidence and disagreements.
6. **Abstention:** low image quality or L0/L1 coverage ⇒ `insufficient_evidence`. Calibrate on the golden set before any customer-facing use.
7. **Fine-tune only at L4**, and only on data you own the rights to.
Zippers/holograms: require macro photos under fixed lighting; the AI describes, rules (tier 1–3 sourced) judge.
