import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
      const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
      const updatePreference = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
      setReduceMotion(preference.matches);
      preference.addEventListener?.('change', updatePreference);
      return () => preference.removeEventListener?.('change', updatePreference);
    }

    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
