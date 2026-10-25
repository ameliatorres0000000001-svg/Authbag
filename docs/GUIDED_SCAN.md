# Guided scan (stages)
- Stages = capture templates grouped by component (heat stamp, date code, zipper, hardware, stitching, RFID…). Logic: `src/shared/stages.ts` (tested). It is a VIEW over the engine evaluation and never decides authenticity.
- Stage status: pending (photos missing) · insufficient (photos but no approved rule could assess) · concern (an approved concern rule fired) · consistent (approved supporting rules matched, none fired).
- A concern in one stage does not stop other stages. "Ready for sign-off" appears only when EVERY stage is consistent; the engine outcome + named expert sign-off remain the only way to finish. Never print "authentic".
- Camera auto-capture (`src/web/CameraCapture.tsx`, gate in `src/shared/autocapture.ts`, tested): guide frame; captures when the area inside the frame is sharp, well exposed and steady for 8 consecutive frames. It does NOT detect the object or the four corners automatically. Thresholds (`DEFAULT_GATE`) must be tuned on real phones.
- After each upload the AI (if configured) proposes observations as `ai_suggested`; they count only after an appraiser confirms.
- RFID: a phone can only detect presence; LV offers no public verification. Record presence/absence only; it proves nothing alone.
- Date code: decoded from data tables; counts only when format + factory rows are approved.

## NFC read (rfid stage)
`src/web/NfcRead.tsx` uses Web NFC (Chrome/Android, HTTPS). A successful read records only
`rfid.chip_status = detected_readable` as an appraiser observation; the UID is shown on screen, not stored.
Failures/timeouts are never auto-recorded as "not_detected". Readable ≠ authentic; brand chips (LV/Chanel)
are proprietary and generally not verifiable by a phone.
