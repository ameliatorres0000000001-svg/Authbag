// Design tokens: "Workshop" black & gold. charcoal = black blocks (photos, badges), ink = text, gold = action / selected.
export default {
  content: ['./src/web/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Auto-Skin: every colour is a CSS variable (src/web/index.css) so the theme can be dark (workshop black & gold,
        // default), light (ivory & gold) or follow the phone. charcoal = black blocks, ink = text, gold = action / selected.
        'surface': 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-card': 'rgb(var(--c-surface-card) / <alpha-value>)',
        'surface-canvas': 'rgb(var(--c-surface-canvas) / <alpha-value>)',
        'surface-low': 'rgb(var(--c-surface-low) / <alpha-value>)',
        'surface-high': 'rgb(var(--c-surface-high) / <alpha-value>)',
        'charcoal': 'rgb(var(--c-charcoal) / <alpha-value>)',
        'ink': 'rgb(var(--c-ink) / <alpha-value>)',
        'muted': 'rgb(var(--c-muted) / <alpha-value>)',
        'hairline': 'rgb(var(--c-hairline) / <alpha-value>)',
        'strong': 'rgb(var(--c-strong) / <alpha-value>)',
        'gold': 'rgb(var(--c-gold) / <alpha-value>)',
        'gold-light': 'rgb(var(--c-gold-light) / <alpha-value>)',
        'verified': 'rgb(var(--c-verified) / <alpha-value>)',
        'verified-bg': 'rgb(var(--c-verified-bg) / <alpha-value>)',
        'counterfeit': 'rgb(var(--c-counterfeit) / <alpha-value>)',
        'counterfeit-bg': 'rgb(var(--c-counterfeit-bg) / <alpha-value>)',
        'review': 'rgb(var(--c-review) / <alpha-value>)',
        'review-bg': 'rgb(var(--c-review-bg) / <alpha-value>)',
        'telemetry': 'rgb(var(--c-telemetry) / <alpha-value>)',
        'telemetry-bg': 'rgb(var(--c-telemetry-bg) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['"EB Garamond"', '"Noto Serif Khmer"', '"Noto Sans Thai"', 'serif'],
        sans: ['Manrope', '"Noto Sans Khmer"', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Noto Sans Khmer"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '0.5rem', lg: '0.625rem', xl: '0.75rem' },
    },
  },
};
