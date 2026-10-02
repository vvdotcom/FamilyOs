const darkColors = {
  // Ink-and-amber palette sampled from the supplied Family Calendar reference.
  primary: '#E4A32A',
  secondary: '#B69BEA',

  // Backgrounds
  background: '#171A20',
  rail: '#171A20',
  backgroundElevated: '#242831',
  card: '#22262E',
  cardElevated: '#2D323B',
  overlay: '#3A404B',

  // Text colors with proper contrast (WCAG AAA compliant)
  text: '#F8F5EE',
  textCream: '#FFF8E8',
  textSecondary: '#C3C0B8',
  textTertiary: '#9D9A92',
  textOnPrimary: '#1B1B1A',
  memberText: '#18233C',

  // Border and dividers
  border: 'rgba(255, 255, 255, 0.15)',
  borderLight: 'rgba(255, 255, 255, 0.09)',
  divider: 'rgba(255, 255, 255, 0.10)',

  // Status colors
  notification: '#F18B58',
  error: '#F17E65',
  success: '#69B57A',
  successSurface: '#293C31',
  warning: '#E7AA36',
  info: '#71A8E7',

  // Focus and interaction states
  focus: '#E4A32A',
  focusBorder: '#E4A32A',
  focusBackground: '#3A3428',
  focusBackgroundSecondary: 'rgba(228, 163, 42, 0.14)',
  focusGlow: 'rgba(228, 163, 42, 0.18)',

  // Interactive states
  pressedOverlay: 'rgba(255, 255, 255, 0.1)',
  hoverOverlay: 'rgba(255, 255, 255, 0.06)',

  // Scrim and overlays
  scrimLight: 'rgba(0, 0, 0, 0.4)',
  scrimMedium: 'rgba(0, 0, 0, 0.6)',
  scrimDark: 'rgba(0, 0, 0, 0.85)',
  briefing: '#393328',
  briefingText: '#F8F3E8',
  alex: '#65C7F7',
  jordan: '#FF7A7A',
  emma: '#A98BF3',
  leo: '#FFD166',
};

const lightColors = {
  // Warm ivory, ink, and amber follow the attached Fire TV reference.
  primary: '#18243D',
  secondary: '#7355A4',

  background: '#F5F4EF',
  rail: '#F5F4EF',
  backgroundElevated: '#FFFEFB',
  card: '#FFFFFF',
  cardElevated: '#F7F5EF',
  overlay: '#EEE9DD',

  text: '#18243D',
  textCream: '#FFF8E8',
  textSecondary: '#5D6776',
  textTertiary: '#777F8B',
  textOnPrimary: '#FFFFFF',
  memberText: '#18243D',

  border: 'rgba(24, 36, 61, 0.15)',
  borderLight: 'rgba(24, 36, 61, 0.10)',
  divider: 'rgba(24, 36, 61, 0.12)',

  notification: '#B34A25',
  error: '#B34A25',
  success: '#2F7940',
  successSurface: '#E5F2E5',
  warning: '#E1A12A',
  info: '#356EBA',

  focus: '#D98D18',
  focusBorder: '#D98D18',
  focusBackground: '#FFF3D5',
  focusBackgroundSecondary: 'rgba(217, 141, 24, 0.13)',
  focusGlow: 'rgba(217, 141, 24, 0.18)',

  pressedOverlay: 'rgba(24, 36, 61, 0.10)',
  hoverOverlay: 'rgba(24, 36, 61, 0.06)',

  scrimLight: 'rgba(0, 0, 0, 0.24)',
  scrimMedium: 'rgba(0, 0, 0, 0.48)',
  scrimDark: 'rgba(0, 0, 0, 0.78)',
  briefing: '#F7EDD4',
  briefingText: '#18243D',
  alex: '#65C7F7',
  jordan: '#FF7A7A',
  emma: '#A98BF3',
  leo: '#FFD166',
};

export type ColorPalette = typeof darkColors;
export type ThemeMode = 'light' | 'dark';

export const themePalettes: Record<ThemeMode, ColorPalette> = {
  light: lightColors,
  dark: darkColors,
};

// Keep the original export for older screens while current Hometide screens
// consume their palette through FamilyThemeProvider.
export const colors = darkColors;
