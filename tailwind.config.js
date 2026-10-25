// Tokens copied from the "Haute Verification" design system in design-reference/stitch (design.md)
export default {
  content: ['./src/web/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#faf9f6', 'surface-card': '#FFFFFF', 'surface-canvas': '#F4F1EA', 'surface-low': '#f4f3f0', 'surface-high': '#e9e8e5',
        charcoal: '#1A1A1A', muted: '#6E6B64', hairline: '#E5E0D8', strong: '#C8C2B7',
        gold: '#C5A059', 'gold-light': '#EFE6D2',
        verified: '#2C4C38', 'verified-bg': '#EBF2ED', counterfeit: '#8A2323', 'counterfeit-bg': '#F9EBEB',
        review: '#8C6A1A', 'review-bg': '#FDF8E8', telemetry: '#374151', 'telemetry-bg': '#EEF0F2',
      },
      fontFamily: {
        serif: ['"EB Garamond"', '"Noto Serif Khmer"', 'serif'],
        sans: ['Manrope', '"Noto Sans Khmer"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '0.125rem', lg: '0.25rem', xl: '0.5rem' },
    },
  },
};
