import { Platform } from 'react-native';
import { nativeStore } from '../storage/nativeStore';

const DEVICE_SESSION_KEY = 'familyos.tv-device-session.v1';
let memoryToken: string | null = null;
let nativeLoaded = false;

/** Native targets read the stored session once, then serve it from memory. */
async function loadNativeToken(): Promise<string | null> {
  if (nativeLoaded) return memoryToken;
  nativeLoaded = true;
  try {
    const stored = await nativeStore.getItem(DEVICE_SESSION_KEY);
    if (stored && !memoryToken) memoryToken = stored;
  } catch {
    // Unreadable device storage leaves the TV unpaired; the user can pair again.
  }
  return memoryToken;
}

export async function getTVDeviceToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.sessionStorage?.getItem(DEVICE_SESSION_KEY) ?? null;
    } catch {
      return memoryToken;
    }
  }
  return loadNativeToken();
}

export async function setTVDeviceToken(token: string): Promise<void> {
  memoryToken = token;
  if (Platform.OS === 'web') {
    try {
      globalThis.sessionStorage?.setItem(DEVICE_SESSION_KEY, token);
    } catch {
      // Keep this local preview session alive in memory if browser storage is blocked.
    }
    return;
  }
  nativeLoaded = true;
  try {
    await nativeStore.setItem(DEVICE_SESSION_KEY, token);
  } catch {
    // The in-memory session still works until the app restarts.
  }
}

export async function clearTVDeviceToken(): Promise<void> {
  memoryToken = null;
  if (Platform.OS === 'web') {
    try {
      globalThis.sessionStorage?.removeItem(DEVICE_SESSION_KEY);
    } catch {
      // The backend revocation remains authoritative if browser storage is unavailable.
    }
    return;
  }
  nativeLoaded = true;
  try {
    await nativeStore.removeItem(DEVICE_SESSION_KEY);
  } catch {
    // The backend revocation remains authoritative if device storage is unavailable.
  }
}
