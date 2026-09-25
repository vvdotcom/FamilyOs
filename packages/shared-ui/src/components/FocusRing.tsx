import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { motion, radii, useFamilyTheme } from '../theme';
import { scaledPixels } from '../hooks/useScale';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface FocusRingProps {
  focused: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}

export default function FocusRing({ focused, children, style, radius = radii.button }: FocusRingProps) {
  const { colors } = useFamilyTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reduceMotion = useReducedMotion();

  return (
    <View style={[
      styles.frame,
      { borderRadius: scaledPixels(radius) },
      focused && styles.focused,
      focused && { transform: [{ scale: reduceMotion ? motion.reducedMotionScale : motion.focusScale }] },
      style,
    ]}>
      {children}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useFamilyTheme>['colors']) { return StyleSheet.create({
  frame: { alignSelf: 'flex-start', borderWidth: scaledPixels(4), borderColor: 'transparent' },
  focused: {
    borderColor: colors.focus,
    shadowColor: colors.focus,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: scaledPixels(12),
    elevation: 8,
  },
}); }
