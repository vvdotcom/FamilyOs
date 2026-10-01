import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { SupportedKeys } from '../app/remote-control/SupportedKeys';
import RemoteControlManager from '../app/remote-control/RemoteControlManager';
import { FamilyRoute } from '../screens/familyTypes';
import { backDestination, FocusRegion } from '../navigation/familyNavigation';

/**
 * Back goes Home (or up one focus region). The listeners are registered once for the life of the
 * shell and read the latest route through a ref. Re-registering them on every render (the shell
 * re-renders on each key press) churned BackHandler and remote listeners on Vega.
 */
export function useBackToHome(
  route: FamilyRoute,
  setRoute: (route: FamilyRoute) => void,
  focusRegion: FocusRegion,
  setFocusRegion: (region: FocusRegion) => void,
  intercept?: () => boolean,
) {
  const latest = useRef({ route, setRoute, focusRegion, setFocusRegion, intercept });
  latest.current = { route, setRoute, focusRegion, setFocusRegion, intercept };

  useEffect(() => {
    const handleBack = () => {
      const current = latest.current;
      if (current.intercept?.()) return true;
      const destination = backDestination(current.route, current.focusRegion);
      current.setRoute(destination.route);
      current.setFocusRegion(destination.focusRegion);
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
  }, []);
}
