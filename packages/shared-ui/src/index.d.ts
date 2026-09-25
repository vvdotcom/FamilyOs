import type { ComponentType, PropsWithChildren } from 'react';

export const AppNavigator: ComponentType<{ fontsLoaded?: boolean; onReady?: () => void }>;
export const FamilyOsShell: ComponentType;
export const HomeScreen: ComponentType;
export const ExploreScreen: ComponentType;
export const TVScreen: ComponentType;
export const SettingsScreen: ComponentType;
export const DetailsScreen: ComponentType<Record<string, unknown>>;
export const PlayerScreen: ComponentType<Record<string, unknown>>;
export const TvCard: ComponentType<Record<string, unknown>>;
export const TvButton: ComponentType<Record<string, unknown>>;
export const MemberChip: ComponentType<Record<string, unknown>>;
export const FocusRing: ComponentType<Record<string, unknown>>;
export const SectionHeader: ComponentType<Record<string, unknown>>;
export const MenuProvider: ComponentType<PropsWithChildren>;

export function useMenuContext(): {
  isOpen: boolean;
  toggleMenu(open?: boolean): void;
};

export function scaledPixels(pixels: number): number;

export const colors: Record<string, string>;
export const radii: Record<string, number>;
export const motion: Record<string, number>;
export const spacing: Record<string, number>;
export * from '@familyos/domain';
export type FamilyRoute = 'Home' | 'Calendar' | 'Chores' | 'Family' | 'Settings';
export const safeZones: {
  titleSafe: { horizontal: number; vertical: number };
  actionSafe: { horizontal: number; vertical: number };
};
