import { Platform } from 'react-native';
import { createDemoHousehold, HouseholdSnapshot } from '@familyos/domain';
import { nativeStore } from '../storage/nativeStore';

const STORAGE_KEY = 'familyos.household.v1';

export function loadHouseholdSnapshot(): HouseholdSnapshot {
  const fallback = createDemoHousehold();
  if (Platform.OS !== 'web') return fallback;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    if (isHouseholdSnapshot(value)) return value;
  } catch {
    // Invalid, unavailable, or blocked browser storage falls back to seeded demo data.
  }
  return fallback;
}

/**
 * Native targets cannot read storage synchronously, so the shell starts from the demo snapshot
 * and swaps in the stored one once this resolves. Returns null on web (already loaded) or when
 * nothing valid is stored.
 */
export async function hydrateHouseholdSnapshot(): Promise<HouseholdSnapshot | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await nativeStore.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isHouseholdSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveHouseholdSnapshot(household: HouseholdSnapshot): void {
  if (Platform.OS !== 'web') {
    void nativeStore.setItem(STORAGE_KEY, JSON.stringify(household)).catch(() => undefined);
    return;
  }
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(household));
  } catch {
    // The in-memory household remains usable when browser storage is unavailable.
  }
}

export function resetHouseholdSnapshot(): HouseholdSnapshot {
  const household = createDemoHousehold();
  saveHouseholdSnapshot(household);
  return household;
}

function isHouseholdSnapshot(value: unknown): value is HouseholdSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HouseholdSnapshot>;
  return (
    candidate.family?.id === 'family-home' &&
    Array.isArray(candidate.members) &&
    Array.isArray(candidate.events) &&
    Array.isArray(candidate.chores) &&
    Array.isArray(candidate.routines)
  );
}
