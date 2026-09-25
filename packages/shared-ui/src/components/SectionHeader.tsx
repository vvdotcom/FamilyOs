import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, typography, useFamilyTheme } from '../theme';
import { scaledPixels } from '../hooks/useScale';

export default function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  const { colors } = useFamilyTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useFamilyTheme>['colors']) { return StyleSheet.create({
  container: { marginBottom: scaledPixels(spacing.md), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { color: colors.text, fontSize: scaledPixels(typography.fontSize.lg), fontWeight: '700' },
  detail: { color: colors.textSecondary, fontSize: scaledPixels(typography.fontSize.sm) },
}); }
