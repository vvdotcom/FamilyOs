// Main App Navigator
export { default as AppNavigator } from './navigation/AppNavigator';
export type { AppNavigatorProps } from './navigation/AppNavigator';

// Theme
export * from './theme';

// Components
export { default as FocusablePressable } from './components/FocusablePressable';
export { default as LoadingIndicator } from './components/LoadingIndicator';
export { MenuProvider, useMenuContext } from './components/MenuContext';
export { default as CustomDrawerContent } from './components/CustomDrawerContent';
export { default as TvCard } from './components/TvCard';
export { default as TvButton } from './components/TvButton';
export { default as MemberChip } from './components/MemberChip';
export { default as FocusRing } from './components/FocusRing';
export { default as SectionHeader } from './components/SectionHeader';

// Screens
export { default as HomeScreen } from './screens/HomeScreen';
export { default as DetailsScreen } from './screens/DetailsScreen';
export { default as PlayerScreen } from './screens/PlayerScreen';
export { default as ExploreScreen } from './screens/ExploreScreen';
export { default as TVScreen } from './screens/TVScreen';
export { default as SettingsScreen } from './screens/SettingsScreen';
export { default as FamilyOsShell } from './screens/FamilyOsShell';
export type { FamilyRoute } from './screens/familyTypes';

// Domain contract and deterministic demo primitives are shared by each target.
export * from '@familyos/domain';

// Utils
export { VideoHandler } from './utils/VideoHandler';
export { isRTL, getOpenDrawerDirection, getCloseDrawerDirection } from './utils/rtl';

// Navigation
export { default as RootNavigator } from './navigation/RootNavigator';
export { default as DrawerNavigator } from './navigation/DrawerNavigator';
export * from './navigation/types';

// Hooks
export { scaledPixels } from './hooks/useScale';
