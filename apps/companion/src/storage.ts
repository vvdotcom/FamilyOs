import { Platform } from 'react-native';
import * as NativeSecureStore from 'expo-secure-store';

/**
 * Expo Go uses the operating-system secure store. The browser is supported only
 * as a local development preview, where credentials live in this tab's session
 * storage and disappear when the tab is closed.
 */
const localWebPreview = Platform.OS === 'web' && __DEV__;

function requireLocalWebPreview() {
  if (Platform.OS === 'web' && !__DEV__) {
    throw new Error('Browser sign-in is available only for local development. Use the FamilyOS phone app for hosted accounts.');
  }
}

export const SecureStore = {
  getItemAsync(key: string): Promise<string | null> {
    requireLocalWebPreview();
    return localWebPreview
      ? Promise.resolve(typeof window === 'undefined' ? null : window.sessionStorage.getItem(key))
      : NativeSecureStore.getItemAsync(key);
  },
  setItemAsync(key: string, value: string): Promise<void> {
    requireLocalWebPreview();
    if (localWebPreview) {
      if (typeof window !== 'undefined') window.sessionStorage.setItem(key, value);
      return Promise.resolve();
    }
    return NativeSecureStore.setItemAsync(key, value);
  },
  deleteItemAsync(key: string): Promise<void> {
    requireLocalWebPreview();
    if (localWebPreview) {
      if (typeof window !== 'undefined') window.sessionStorage.removeItem(key);
      return Promise.resolve();
    }
    return NativeSecureStore.deleteItemAsync(key);
  },
};
