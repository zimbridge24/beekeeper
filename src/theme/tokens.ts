export const colors = {
  primary: '#1E4D3C',
  primaryDark: '#16211B',
  accent: '#E08A3C',
  accentActive: '#C0821E',
  background: '#F1F5F0',
  backgroundAlt: '#E7EEE6',
  surface: '#FFFFFF',
  surfaceTint: '#DCEEE4',
  textPrimary: '#16211B',
  textSecondary: '#56604F',
  textMuted: '#8B9585',
  border: '#E1E8E1',
} as const;

export const statusColors = {
  normal: { text: '#2C7A57', bg: '#E1F1E8' },
  observe: { text: '#3B6E90', bg: '#E3EDF3' },
  caution: { text: '#C0821E', bg: '#FBEED9' },
  danger: { text: '#C1443A', bg: '#FBE6E4' },
} as const;

export type StatusTone = keyof typeof statusColors;

export const fontWeights = {
  semibold: '600',
  bold: '700',
} as const;

export const fontFamilies = {
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  regular: 'Pretendard-Regular',
} as const;

// 11 · 12 · 13 · 14 · 15 · 16 · 17 · 18 · 19 · 20 · 21 · 22 · 24px
export const fontSizes = {
  xs: 11,
  sm: 12,
  bodySm: 13,
  body: 14,
  bodyLg: 15,
  md: 16,
  lg: 17,
  xl: 18,
  xxl: 19,
  display1: 20,
  display2: 21,
  display3: 22,
  display4: 24,
} as const;

// 8 · 10 · 12 · 14 · 16 · 20 · 24px
export const spacing = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
  xxxl: 24,
} as const;

// 6 · 8 · 10 · 12 · 14 · 16 · 20px
export const gap = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  xxl: 16,
  xxxl: 20,
} as const;

export const radius = {
  pill: 999,
  cardLarge: 22,
  cardMedium: 16,
  cardSmall: 14,
  iconBox: 11,
} as const;

// rgba(20,40,30,x) -> #14281E
export const shadows = {
  cardLarge: {
    shadowColor: '#14281E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 4,
  },
  cardSmall: {
    shadowColor: '#14281E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

export const theme = {
  colors,
  statusColors,
  fontWeights,
  fontFamilies,
  fontSizes,
  spacing,
  gap,
  radius,
  shadows,
} as const;

export type Theme = typeof theme;
