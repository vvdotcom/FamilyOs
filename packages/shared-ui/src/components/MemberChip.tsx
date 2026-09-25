import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FamilyMember } from '@familyos/domain';
import { radii, spacing, typography, useFamilyTheme } from '../theme';
import { scaledPixels } from '../hooks/useScale';

export default function MemberChip({ member, detail }: { member: FamilyMember; detail?: string }) {
  const { colors } = useFamilyTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row} accessibilityLabel={`${member.name}${detail ? `, ${detail}` : ''}`}>
      <View style={[styles.avatar, { backgroundColor: member.accentColor }]}>
        <Text style={styles.initial}>{member.initials}</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>{member.name}</Text>
        {detail ? <Text style={styles.detail} numberOfLines={1}>{detail}</Text> : null}
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useFamilyTheme>['colors']) { return StyleSheet.create({
  row: { minHeight: scaledPixels(64), flexDirection: 'row', alignItems: 'center', gap: scaledPixels(spacing.md) },
  avatar: { width: scaledPixels(48), height: scaledPixels(48), borderRadius: scaledPixels(radii.pill), justifyContent: 'center', alignItems: 'center' },
  initial: { color: colors.memberText, fontSize: scaledPixels(typography.fontSize.md), fontWeight: '700' },
  copy: { flex: 1 },
  name: { color: colors.text, fontSize: scaledPixels(typography.fontSize.md), fontWeight: '600' },
  detail: { color: colors.textSecondary, fontSize: scaledPixels(typography.fontSize.sm), marginTop: scaledPixels(2) },
}); }
