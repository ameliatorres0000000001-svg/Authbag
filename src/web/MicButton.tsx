import React from 'react';

/** The usual round microphone button (as in Google Translate, WhatsApp, Gemini): a filled circle with a mic; while recording it turns red, pulses and shows a stop square. */
export default function MicButton({ listening, disabled, onClick, label, size = 56 }: { listening: boolean; disabled?: boolean; onClick: () => void; label: string; size?: number }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={listening} aria-label={label} title={label}
      style={{ width: size, height: size }}
      className={`relative flex shrink-0 items-center justify-center rounded-full text-white shadow-md transition active:scale-95 disabled:opacity-40 ${listening ? 'bg-counterfeit' : 'bg-gold text-charcoal'}`}>
      {listening && <span className="absolute inset-0 animate-ping rounded-full bg-counterfeit/40" aria-hidden />}
      {listening ? (
        <svg viewBox="0 0 24 24" width={size * 0.36} height={size * 0.36} fill="currentColor" aria-hidden className="relative"><rect x="5" y="5" width="14" height="14" rx="2.5" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
          <path d="M12 18v3" />
        </svg>
      )}
    </button>
  );
}
