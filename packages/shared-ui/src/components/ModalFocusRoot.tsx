import React, { useEffect } from 'react';
import { SpatialNavigationRoot, useLockSpatialNavigation } from 'react-tv-space-navigation';

/**
 * Focus scope for an overlay rendered inside a screen. It locks the screen's spatial navigation
 * while mounted and gives the overlay its own root, so the remote moves only inside the overlay
 * and the overlay's default-focus button actually receives focus. Without it, focus stays on the
 * control behind the overlay and OK re-triggers that control instead.
 */
export function ModalFocusRoot({ children, isActive = true }: { children: React.ReactNode; isActive?: boolean }) {
  const { lock, unlock } = useLockSpatialNavigation();
  useEffect(() => {
    lock();
    return unlock;
  }, [lock, unlock]);
  return <SpatialNavigationRoot isActive={isActive}>{children}</SpatialNavigationRoot>;
}
