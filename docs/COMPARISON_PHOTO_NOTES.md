# Notes from owner-supplied comparison photos (tier 4, unverified)
Source of the photos and the truth of their red/blue labels is NOT verified, and the licence is unknown, so they are NOT stored as reference assets and NOT training data. They only inspired draft rules.

| Photo pair | Visible difference (this pair only) | Draft rule |
|---|---|---|
| Heat stamp "LOUIS VUITTON PARIS made in France" | Labelled-counterfeit: shallow, soft-edged, uneven depth, paler. Labelled-authentic: deeper, even, crisp edges | LV-STAMP-EDGE-A/C (seeded in 0002) |
| Micro-engraved digit "4" made of overlapping loops | Labelled-counterfeit: loops irregular, fuzzy/glowing. Labelled-authentic: loops crisp and even | LV-HW-ENGR-A/C (0002) |
| Lampo zipper pull | Labelled-counterfeit: ® after name, glossy smooth. Labelled-authentic: small dot, matte grainy | LV-ZIP-MARK-C (0003), LV-ZIP-FINISH-C (0002) |
| Coloured padlock | Labelled-counterfeit: glossy uneven coating, rough shackle base, chipped paint on neighbouring zipper tab. Labelled-authentic: even brushed copper finish | LV-HW-COAT-A/C (0003), LV-HW-EDGE-C (0002) |

Caveats: lighting, angle and resolution differ between the two halves of each pair; a single pair cannot show a rule holds across models and years. Each rule stays draft until two people approve it with a better source.

## UI design review (Stitch "Optical Comparator" and "AI Reference Retrieval")
Kept: split canvas, slider overlay, zoom, per-feature table, "why selected" explanation.
Removed because it would be false or misleading in a production system: "Sandbox / Demo mode" telemetry, "ISO/IEC 17025 accredited", "Zero data drift guarantee", fixed numbers such as 98.7% match / 99.4% confidence / 842 anchors, caliper readings (no instrument connected), "Accept Reference Match → corroborates authentic consensus". Implemented in `src/web/pages/Comparator.tsx` with `/api/captures/:id/compare` (no percentages, no verdict, refuses when no approved reference exists).
