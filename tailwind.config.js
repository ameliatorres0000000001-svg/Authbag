// Design tokens: "Workshop" black & gold. charcoal = black blocks (photos, badges), ink = text, gold = action / selected.
export default {
  content: ['./src/web/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Workshop black & gold (dark theme for vendors working in markets and workshops)
        surface: '#0E0E10', 'surface-card': '#17171A', 'surface-canvas': '#121215', 'surface-low': '#1F1F24', 'surface-high': '#2B2B31',
        charcoal: '#050506', ink: '#F3EEE4', muted: '#A19C92', hairline: '#2C2B28', strong: '#4A463F',
        gold: '#D4AF5F', 'gold-light': '#2D2618',
        verified: '#3E9B63', 'verified-bg': '#13261A', counterfeit: '#D35454', 'counterfeit-bg': '#3A1818',
        review: '#D9A73B', 'review-bg': '#2E2614', telemetry: '#B8C0CC', 'telemetry-bg': '#1D2128',
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
