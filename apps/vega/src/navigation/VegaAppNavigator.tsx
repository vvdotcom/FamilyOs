import React, { useEffect } from 'react';
import { NavigationContainer, DarkTheme } from '@amazon-devices/react-navigation__native';
import { GestureHandlerRootView } from '@amazon-devices/react-native-gesture-handler';
import { MenuProvider } from '@familyos/shared-ui';
// Configure the remote before any SpatialNavigationRoot mounts. react-tv-space-navigation only
// subscribes a root to the remote in its mount effect (or when `isActive` changes), and child
// effects run before this component's effects, so configuring it inside useEffect left the D-pad
// dead for the whole session on some launches.
import '@familyos/shared-ui/src/app/configureRemoteControl';
import VegaRootNavigator from './VegaRootNavigator';

export interface VegaAppNavigatorProps {
  fontsLoaded?: boolean;
  onReady?: () => void;
}

export default function VegaAppNavigator({ fontsLoaded = true, onReady }: VegaAppNavigatorProps) {
  useEffect(() => {
    if (fontsLoaded && onReady) {
      onReady();
    }
  }, [fontsLoaded, onReady]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={DarkTheme}>
        <MenuProvider>
          <VegaRootNavigator />
        </MenuProvider>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
