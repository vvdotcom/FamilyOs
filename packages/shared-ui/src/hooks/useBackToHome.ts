import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import { SupportedKeys } from '../app/remote-control/SupportedKeys';
import RemoteControlManager from '../app/remote-control/RemoteControlManager';
import { FamilyRoute } from '../screens/familyTypes';
import { backDestination, FocusRegion } from '../navigation/familyNavigation';

export function useBackToHome(
  route: FamilyRoute,
  setRoute: (route: FamilyRoute) => void,
  focusRegion: FocusRegion,
  setFocusRegion: (region: FocusRegion) => void,
  intercept?: () => boolean,
) {
  useEffect(() => {
    const handleBack = () => {
      if (intercept?.()) return true;
      const destination = backDestination(route, focusRegion);
      setRoute(destination.route);
      setFocusRegion(destination.focusRegion);
      return true;
    };
    const onRemoteKey = (key: SupportedKeys) => {
      if (Platform.OS !== 'web' && key === SupportedKeys.Back) handleBack();
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);
    RemoteControlManager.addKeydownListener(onRemoteKey);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onKeyDown = (event: KeyboardEvent) => {
        const element = event.target as HTMLElement | null;
        if (
          event.key !== 'Escape' &&
          (element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.isContentEditable)
        )
          return;
        if (event.key === 'Escape' || event.key === 'Backspace') {
          event.preventDefault();
          handleBack();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => {
        subscription.remove();
        RemoteControlManager.removeKeydownListener(onRemoteKey);
        window.removeEventListener('keydown', onKeyDown);
      };
    }
    return () => {
      subscription.remove();
      RemoteControlManager.removeKeydownListener(onRemoteKey);
    };
  }, [route, focusRegion, setRoute, setFocusRegion, intercept]);
}
