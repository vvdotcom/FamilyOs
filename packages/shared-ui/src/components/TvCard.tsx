import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { radii, spacing, useFamilyTheme } from '../theme';
import { scaledPixels } from '../hooks/useScale';

interface TvCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accentColor?: string;
  light?: boolean;
}

export default function TvCard({ children, style, accentColor, light = false }: TvCardProps) {
  const { colors } = useFamilyTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.card, light ? styles.light : styles.dark, style]}>
      {accentColor ? <View style={[styles.accent, { backgroundColor: accentColor }]} /> : null}
      {children}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useFamilyTheme>['colors']) { return StyleSheet.create({
  card: { borderRadius: scaledPixels(radii.card), padding: scaledPixels(spacing.lg), overflow: 'hidden' },
  dark: { backgroundColor: colors.card },
  light: { backgroundColor: colors.briefing },
  accent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: scaledPixels(8) },
}); }
