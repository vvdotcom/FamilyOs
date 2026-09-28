export type FamilyRoute =
  | 'Home' | 'Calendar' | 'Chores' | 'Meals' | 'Lists' | 'Photos' | 'Family' | 'Settings'
  | 'Approvals' | 'Move' | 'FamilyNight';
export type FocusRegion = 'navigation' | 'content';

export function focusRegionAfterDirection(region: FocusRegion, direction: string): FocusRegion {
  if (region === 'navigation' && direction === 'down') return 'content';
  if (region === 'content' && direction === 'up') return 'navigation';
  return region;
}

export function backDestination(
  route: FamilyRoute,
  region: FocusRegion,
): { route: FamilyRoute; focusRegion: FocusRegion } {
  if (route !== 'Home') return { route: 'Home', focusRegion: 'content' };
  return { route: 'Home', focusRegion: region === 'navigation' ? 'content' : 'navigation' };
}
