import mitt from 'mitt';
type TVHardwareEvent = { eventType: string; eventKeyAction?: number };
import { SupportedKeys } from './SupportedKeys';
import { RemoteControlManagerInterface } from './RemoteControlManager.interface';

// Map Vega/Kepler HWEvent eventType to SupportedKeys
const EVENT_TYPE_MAPPING: Record<string, SupportedKeys> = {
  left: SupportedKeys.Left,
  right: SupportedKeys.Right,
  down: SupportedKeys.Down,
  up: SupportedKeys.Up,
  select: SupportedKeys.Enter,
  back: SupportedKeys.Back,
  playpause: SupportedKeys.PlayPause,
  skip_backward: SupportedKeys.Rewind,
  skip_forward: SupportedKeys.FastForward,
  menu: SupportedKeys.Menu,
};

class RemoteControlManager implements RemoteControlManagerInterface {
  private eventEmitter = mitt<{ keyDown: SupportedKeys }>();
  private tvEventHandler: any;

  constructor() {
    // Initialize TVEventHandler for Vega/Kepler platform
    // Import dynamically to avoid issues with types
    const { TVEventHandler } = require('react-native');
    this.tvEventHandler = new TVEventHandler();
    this.tvEventHandler.enable(this, this.handleHWEvent);
    if (__DEV__) console.log('[RemoteControlManager.kepler] TVEventHandler enabled');
  }

  private handleHWEvent = (_component: any, event: TVHardwareEvent): void => {
    // Only handle KEY_DOWN events (eventKeyAction = 0)
    // eventKeyAction: 0 = KEY_DOWN, 1 = KEY_UP, -1 = default
    if (event.eventKeyAction === 0 || event.eventKeyAction === undefined) {
      const mappedKey = EVENT_TYPE_MAPPING[event.eventType];
      if (mappedKey) {
        if (__DEV__) console.log(`[Kepler] Key pressed: ${mappedKey} (eventType: ${event.eventType})`);
        this.eventEmitter.emit('keyDown', mappedKey);
      }
    }
  };

  addKeydownListener = (listener: (event: SupportedKeys) => void): (() => void) => {
    this.eventEmitter.on('keyDown', listener);
    if (__DEV__) console.log('[RemoteControlManager.kepler] Key listener added');
    return () => this.removeKeydownListener(listener);
  };

  removeKeydownListener = (listener: (event: SupportedKeys) => void): void => {
    this.eventEmitter.off('keyDown', listener);
    if (__DEV__) console.log('[RemoteControlManager.kepler] Key listener removed');
  };

  emitKeyDown = (key: SupportedKeys): void => {
    this.eventEmitter.emit('keyDown', key);
  };

  cleanup = (): void => {
    this.tvEventHandler.disable();
    if (__DEV__) console.log('[RemoteControlManager.kepler] TVEventHandler disabled');
  };
}

export default new RemoteControlManager();
