import { Platform } from 'react-native';
import { createDemoHousehold, HouseholdSnapshot } from '@familyos/domain';
import { nativeStore } from '../storage/nativeStore';

const STORAGE_KEY = 'familyos.household.v1';

/** The device's own time zone, so an unpaired TV shows the real local date and clock. */
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Phoenix';
  } catch {
    return 'America/Phoenix';
  }
}

/**
 * An unpaired TV has no family yet: no members, events, chores, meals, or lists. Everything appears
 * once the TV is paired with a Hometide account and the household syncs from the server.
 */
export function createEmptyHousehold(): HouseholdSnapshot {
  return {
    family: { id: 'family-home', name: 'Your family', timezone: deviceTimezone(), memberIds: [] },
    members: [],
    events: [],
    chores: [],
    routines: [],
    revision: 0,
    listItems: [],
    meals: [],
    rewards: [],
    redemptions: [],
    starTransactions: [],
    proposals: [],
    choreVerifications: [],
    familyNight: null,
    familyNightPolls: [],
    photos: [],
    teams: [],
    location: null,
    calendars: [],
  };
}

/**
 * Store screenshots only: a web build made with EXPO_PUBLIC_HOMETIDE_SAMPLE=1 shows the fictional sample family at
 * its fixed demo time. Fire TV builds never set it, so a real TV stays empty until it is paired.
 */
export const SAMPLE_BUILD = process.env.EXPO_PUBLIC_HOMETIDE_SAMPLE === '1';

export function loadHouseholdSnapshot(): HouseholdSnapshot {
  return SAMPLE_BUILD ? createDemoHousehold() : createEmptyHousehold();
}

/** Unpaired TVs no longer keep a local household, so there is nothing to restore. */
export async function hydrateHouseholdSnapshot(): Promise<HouseholdSnapshot | null> {
  return null;
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
  const household = createEmptyHousehold();
  saveHouseholdSnapshot(household);
  return household;
}
