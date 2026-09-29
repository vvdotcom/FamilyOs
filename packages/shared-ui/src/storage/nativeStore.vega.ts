/**
 * Vega build of the native key/value store. Uses the Vega port of AsyncStorage so the TV keeps
 * its pairing session, theme, and local demo household across app restarts.
 */
import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import type { NativeStore } from './nativeStore';

export const nativeStore: NativeStore = {
  persistent: true,
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
