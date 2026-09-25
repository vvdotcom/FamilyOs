import React, { useMemo } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';
import { SpatialNavigationFocusableView } from 'react-tv-space-navigation';
import { radii, spacing, typography, useFamilyTheme } from '../theme';
import FocusRing from './FocusRing';
import { scaledPixels } from '../hooks/useScale';

interface TvButtonProps {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
  selected?: boolean;
  accessibilityRole?: 'button' | 'radio';
  accessibilityHint?: string;
  onFocus?: () => void;
  focusActive?: boolean;
}

export default function TvButton({
  label, accessibilityLabel, onPress, variant = 'secondary', style, labelStyle, disabled = false, selected = false, accessibilityRole = 'button', accessibilityHint, onFocus, focusActive = true,
}: TvButtonProps) {
  const { colors } = useFamilyTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <SpatialNavigationFocusableView onSelect={() => !disabled && onPress()} onFocus={onFocus}>
      {({ isFocused }) => (
        <FocusRing focused={isFocused && focusActive}>
          <Pressable
            accessibilityRole={accessibilityRole}
            accessibilityLabel={accessibilityLabel ?? (accessibilityRole === 'radio' && selected ? `${label}, selected` : label)}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled, selected, checked: accessibilityRole === 'radio' ? selected : undefined }}
            disabled={disabled}
            onPress={onPress}
            style={[styles.button, styles[variant], style, disabled && styles.disabled]}
          >
            <Text style={[styles.label, variant === 'primary' && styles.primaryLabel, labelStyle]} numberOfLines={2}>
              {label}
            </Text>
          </Pressable>
        </FocusRing>
      )}
    </SpatialNavigationFocusableView>
  );
}

function createStyles(colors: ReturnType<typeof useFamilyTheme>['colors']) { return StyleSheet.create({
  button: {
    minHeight: scaledPixels(64),
    paddingHorizontal: scaledPixels(spacing.lg),
    paddingVertical: scaledPixels(spacing.md),
    borderRadius: scaledPixels(radii.button - 4),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.cardElevated, borderColor: colors.borderLight },
  quiet: { backgroundColor: 'transparent', borderColor: 'transparent' },
  label: { color: colors.text, fontSize: scaledPixels(typography.fontSize.md), fontWeight: '600', textAlign: 'center' },
  primaryLabel: { color: colors.textOnPrimary },
  disabled: { opacity: 0.5 },
}); }
