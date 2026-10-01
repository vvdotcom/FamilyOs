import { Directions, SpatialNavigation } from 'react-tv-space-navigation';
import { SupportedKeys } from './remote-control/SupportedKeys';
import RemoteControlManager from './remote-control/RemoteControlManager';

SpatialNavigation.configureRemoteControl({
  remoteControlSubscriber: (callback) => {
    if (__DEV__) console.log("Configure remote control");

    const mapping: { [key in SupportedKeys]: Directions | null } = {
      [SupportedKeys.Right]: Directions.RIGHT,
      [SupportedKeys.Left]: Directions.LEFT,
      [SupportedKeys.Up]: Directions.UP,
      [SupportedKeys.Down]: Directions.DOWN,
      [SupportedKeys.Enter]: Directions.ENTER,
      [SupportedKeys.Back]: null,
      [SupportedKeys.PlayPause]: null,
      [SupportedKeys.FastForward]: null,
      [SupportedKeys.Rewind]: null,
      [SupportedKeys.Menu]: null,
    };

    const remoteControlListener = (keyEvent: SupportedKeys) => {
      callback(mapping[keyEvent]);
    };

    return RemoteControlManager.addKeydownListener(remoteControlListener);
  },

  remoteControlUnsubscriber: (unsubscribe) => {
    unsubscribe();
  },
});
