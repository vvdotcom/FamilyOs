export type Member = {
  id: string;
  familyId: string;
  name: string;
  initials: string;
  role: 'adult' | 'child';
  accentColor: string;
};
export type Event = {
  id: string;
  familyId: string;
  title: string;
  category: 'school' | 'appointment' | 'pickup' | 'dropoff' | 'drive' | 'sports' | 'meal' | 'family';
  startAt: string;
  endAt: string;
  ownerMemberId: string;
  memberIds: string[];
  location?: string | null;
  source: string;
  allDay?: boolean;
};
export type Chore = {
  id: string;
  familyId: string;
  title: string;
  assignedToMemberId: string | null;
  status: 'pending' | 'completed';
  dueAt?: string | null;
};
export type ListItem = {
  id: string;
  listName: string;
  title: string;
  category: string;
  completed: boolean;
  addedBy: string;
};
export type Meal = {
  id: string;
  title: string;
  date: string;
  category: 'Breakfast' | 'Lunch' | 'Dinner';
  cookIds: string[];
  servings: number;
  minutes: number;
  ingredients: string[];
  instructions: string[];
};
export type Household = {
  family: { id: string; name: string; timezone: string; memberIds: string[] };
  members: Member[];
  events: Event[];
  chores: Chore[];
  routines: unknown[];
  revision: number;
  listItems: ListItem[];
  meals: Meal[];
};
export type Edit = {
  expectedRevision: number;
  kind: 'event' | 'member' | 'chore' | 'listItem' | 'meal' | 'mealGroceries' | 'deleteEvent' | 'deleteMeal';
  value: object;
};
export interface HouseholdAPI {
  household(): Promise<Household>;
  editHousehold(edit: Edit): Promise<Household>;
  approveTV?(code: string): Promise<PairedTV>;
  pairedTVs?(): Promise<PairedTV[]>;
  unpairTV?(deviceId: string): Promise<void>;
}
export type Appearance = 'system' | 'light' | 'dark';
export type ParentAccount = { accountId: string; parentName: string; householdName: string; email: string };
export type PairedTV = {
  deviceId: string;
  deviceName: string;
  createdAt: string;
  lastSeenAt: string | null;
};

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function weekDays(selected: Date): Date[] {
  const start = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - selected.getDay(), 12);
  return Array.from(
    { length: 7 },
    (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12),
  );
}
export function eventsForDay(events: Event[], day: Date): Event[] {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return events
    .filter((event) => new Date(event.startAt) < end && new Date(event.endAt) > start)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
export function validateEvent(title: string, starts: Date, ends: Date, members: string[]): string | null {
  if (!title.trim()) return 'Give your event a title.';
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts)
    return 'The end must be after the start.';
  if (!members.length) return 'Choose at least one family member.';
  return null;
}
