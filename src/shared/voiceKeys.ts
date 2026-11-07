// App phrases that can be spoken aloud (the text itself lives in src/web/i18n.tsx). The server only accepts
// these keys when staff generate the voice files, so the public voice endpoint cannot be used for other text.
export const UI_VOICE_KEYS = [
  'paint.tapWhite', 'paint.tapColor', 'paint.checksOk', 'paint.checking', 'paint.exact', 'paint.close', 'paint.none',
  'paint.issue.low_resolution', 'paint.issue.blurry', 'paint.issue.white_too_dark', 'paint.issue.white_clipped',
  'paint.issue.white_tinted', 'paint.issue.white_uneven', 'paint.issue.sample_uneven', 'paint.issue.sample_shiny',
  'paint.issue.sample_too_dark', 'paint.issue.too_close', 'steps.done',
] as const;
export type UiVoiceKey = typeof UI_VOICE_KEYS[number];

export const STEP_ICONS = ['clean', 'sand', 'tape', 'prep', 'thin_coat', 'dry', 'second_coat', 'edge', 'finisher', 'wait', 'test', 'polish'] as const;
export type StepIcon = typeof STEP_ICONS[number];
