import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ColorPalette, ThemeMode, themePalettes } from './colors';
import { nativeStore } from '../storage/nativeStore';

const STORAGE_KEY = 'familyos.theme';

interface FamilyThemeValue {
  mode: ThemeMode;
  colors: ColorPalette;
  setMode: (mode: ThemeMode) => void;
}

const FamilyThemeContext = createContext<FamilyThemeValue | null>(null);

function readInitialMode(): ThemeMode {
  if (Platform.OS !== 'web') return 'light';
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function FamilyThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, updateMode] = useState<ThemeMode>(readInitialMode);
  const chosenRef = useRef(false);
  useEffect(() => {
    // Native storage is async: restore the saved theme unless the viewer already picked one.
    if (Platform.OS === 'web') return;
    let active = true;
    void nativeStore
      .getItem(STORAGE_KEY)
      .then((stored) => {
        if (active && !chosenRef.current && (stored === 'dark' || stored === 'light')) updateMode(stored);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const value = useMemo<FamilyThemeValue>(() => ({
    mode,
    colors: themePalettes[mode],
    setMode: (nextMode) => {
      chosenRef.current = true;
      updateMode(nextMode);
      if (Platform.OS === 'web') {
        try {
          globalThis.localStorage?.setItem(STORAGE_KEY, nextMode);
        } catch {
          // The theme still changes for this session if browser storage is blocked.
        }
      } else {
        void nativeStore.setItem(STORAGE_KEY, nextMode).catch(() => undefined);
      }
    },
  }), [mode]);

  return <FamilyThemeContext.Provider value={value}>{children}</FamilyThemeContext.Provider>;
}

export function useFamilyTheme(): FamilyThemeValue {
  const value = useContext(FamilyThemeContext);
  if (!value) throw new Error('useFamilyTheme must be used inside FamilyThemeProvider');
  return value;
}
