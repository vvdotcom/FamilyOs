/**
 * Fire OS (Android) build of the native key/value store. Uses AsyncStorage so the TV keeps its
 * pairing session, theme, and local demo household across restarts and reboots, which the Amazon
 * Appstore checks ("reboot must keep the user signed in").
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStore } from './nativeStore';

export const nativeStore: NativeStore = {
  persistent: true,
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
