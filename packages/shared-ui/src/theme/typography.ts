export const typography = {
  fontFamily: {
    regular: 'System',
    mono: 'SpaceMono',
  },
  // Optimized for 10-foot viewing distance (TV best practices)
  fontSize: {
    xs: 18,
    sm: 20,
    md: 24,
    lg: 32,
    xl: 44,
    xxl: 56,
    xxxl: 68,
  },
  // Line heights for better readability
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};
