import type { FamilyRoute } from './familyNavigation';

const ROUTES: FamilyRoute[] = ['Home', 'Calendar', 'Chores', 'Meals', 'Lists', 'Photos', 'Settings', 'Family',
  'Approvals', 'Move', 'FamilyNight'];

export type VoiceTVAction =
  | { kind: 'wall' }
  | { kind: 'route'; route: FamilyRoute; day: string | null }
  | { kind: 'ignore' };

/** What the TV should do with a voice command from the server ("open the calendar for Friday"). */
export function voiceTVAction(command: { screen?: string; day?: string | null }): VoiceTVAction {
  if (command.screen === 'Wall') return { kind: 'wall' };
  const route = ROUTES.find((item) => item === command.screen);
  if (!route) return { kind: 'ignore' };
  const day = route === 'Calendar' && /^\d{4}-\d{2}-\d{2}$/.test(command.day ?? '') ? (command.day as string) : null;
  return { kind: 'route', route, day };
}
