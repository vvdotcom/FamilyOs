import React, { createContext, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { ColorPalette, ThemeMode, themePalettes } from './colors';

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
  const value = useMemo<FamilyThemeValue>(() => ({
    mode,
    colors: themePalettes[mode],
    setMode: (nextMode) => {
      updateMode(nextMode);
      if (Platform.OS === 'web') {
        try {
          globalThis.localStorage?.setItem(STORAGE_KEY, nextMode);
        } catch {
          // The theme still changes for this session if browser storage is blocked.
        }
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
