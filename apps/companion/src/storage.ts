import { Platform } from 'react-native';
import * as NativeSecureStore from 'expo-secure-store';

/**
 * Phones (Expo Go or an app build) use the operating-system secure store.
 *
 * The web app keeps its session in this tab's session storage by default, so it is gone when the
 * tab or home-screen app closes. A parent can choose "Keep me signed in on this device"; then the
 * session moves to local storage on that browser until they sign out. Browser storage is readable
 * by scripts on the page, which is why the hosted web app is served from the API's own origin with
 * a strict Content-Security-Policy (see services/family-agent/app/main.py).
 */
const web = Platform.OS === 'web';
const REMEMBER_KEY = 'familyos.remember-device';

function browserStore(kind: 'session' | 'local'): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null; // Storage can be blocked (private mode, cookie settings).
  }
}

function remembering(): boolean {
  return browserStore('local')?.getItem(REMEMBER_KEY) === '1';
}

function activeStore(): Storage | null {
  return browserStore(remembering() ? 'local' : 'session');
}

/** Web only: whether this browser keeps the parent signed in after the tab closes. */
export function rememberThisDevice(): boolean {
  return web && remembering();
}

/** Web only: move the Hometide keys between tab-only and device storage. */
export function setRememberThisDevice(remember: boolean): void {
  if (!web) return;
  const local = browserStore('local');
  const session = browserStore('session');
  if (!local || !session) return;
  const [from, to] = remember ? [session, local] : [local, session];
  const keys: string[] = [];
  for (let index = 0; index < from.length; index += 1) {
    const key = from.key(index);
    if (key && key.startsWith('familyos.') && key !== REMEMBER_KEY) keys.push(key);
  }
  for (const key of keys) {
    const value = from.getItem(key);
    if (value !== null) to.setItem(key, value);
    from.removeItem(key);
  }
  if (remember) local.setItem(REMEMBER_KEY, '1');
  else local.removeItem(REMEMBER_KEY);
}

/** Where a person turns camera, photo, or location access back on, worded for their device. */
export function permissionSettingsName(): string {
  if (Platform.OS === 'ios') return 'iPhone Settings';
  if (Platform.OS === 'android') return 'Android Settings';
  return 'your browser’s site settings';
}

export const SecureStore = {
  getItemAsync(key: string): Promise<string | null> {
    if (web) return Promise.resolve(activeStore()?.getItem(key) ?? null);
    return NativeSecureStore.getItemAsync(key);
  },
  setItemAsync(key: string, value: string): Promise<void> {
    if (web) {
      activeStore()?.setItem(key, value);
      return Promise.resolve();
    }
    return NativeSecureStore.setItemAsync(key, value);
  },
  deleteItemAsync(key: string): Promise<void> {
    if (web) {
      // Clear both so a key never lingers after the remember choice changes.
      browserStore('session')?.removeItem(key);
      browserStore('local')?.removeItem(key);
      return Promise.resolve();
    }
    return NativeSecureStore.deleteItemAsync(key);
  },
};
