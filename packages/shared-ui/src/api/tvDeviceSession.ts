import { Platform } from 'react-native';

const DEVICE_SESSION_KEY = 'familyos.tv-device-session.v1';
let memoryToken: string | null = null;

export async function getTVDeviceToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.sessionStorage?.getItem(DEVICE_SESSION_KEY) ?? null;
    } catch {
      return memoryToken;
    }
  }
  return memoryToken;
}

export async function setTVDeviceToken(token: string): Promise<void> {
  memoryToken = token;
  if (Platform.OS === 'web') {
    try {
      globalThis.sessionStorage?.setItem(DEVICE_SESSION_KEY, token);
    } catch {
      // Keep this local preview session alive in memory if browser storage is blocked.
    }
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
  }
}
