import { CalendarEvent, Chore, Family, FamilyMember, HouseholdSnapshot, Routine } from './types';

export const DEFAULT_TRAVEL_BUFFER_MINUTES = 20;
export const DEMO_NOW = '2026-09-22T14:30:00-07:00';

export function createDemoHousehold(): HouseholdSnapshot {
  const family: Family = {
    id: 'family-home',
    name: 'The Rivera Family',
    timezone: 'America/Phoenix',
    memberIds: ['alex', 'jordan', 'emma', 'leo'],
  };
  const members: FamilyMember[] = [
    { id: 'alex', familyId: family.id, name: 'Alex', initials: 'A', role: 'adult', accentColor: '#65C7F7' },
    { id: 'jordan', familyId: family.id, name: 'Jordan', initials: 'J', role: 'adult', accentColor: '#FF7A7A' },
    { id: 'emma', familyId: family.id, name: 'Emma', initials: 'E', role: 'child', accentColor: '#A98BF3' },
    { id: 'leo', familyId: family.id, name: 'Leo', initials: 'L', role: 'child', accentColor: '#FFD166' },
  ];
  const events: CalendarEvent[] = [
    event('school-emma', 'School', 'school', '07:45', '08:15', ['emma']),
    event('school-leo', 'School', 'school', '07:45', '08:15', ['leo']),
    event('dentist-jordan', 'Dentist', 'appointment', '14:45', '15:30', ['jordan'], { location: 'Desert Dental' }),
    event('emma-pickup', 'Emma pickup', 'pickup', '15:15', '15:30', ['emma'], {
      responsibleMemberId: 'jordan',
      responsibilityType: 'pickup',
      location: 'Riverside School',
      travelMinutes: 15,
    }),
    event('soccer-emma', 'Soccer practice', 'sports', '17:00', '18:00', ['emma'], {
      location: 'Kino Sports Complex',
      travelMinutes: 20,
      preparation: [
        { id: 'soccer-ball', label: 'Soccer ball', completed: true },
        { id: 'water-bottle', label: 'Water bottle', completed: false },
      ],
    }),
    event('family-dinner', 'Family dinner', 'meal', '18:30', '19:15', ['alex', 'jordan', 'emma', 'leo']),
  ];
  const chores: Chore[] = [
    {
      id: 'pack-backpack',
      familyId: family.id,
      title: 'Pack backpack',
      assignedToMemberId: 'emma',
      dueAt: '2026-09-23T07:30:00-07:00',
      status: 'pending',
      points: 5,
      recurrence: 'daily',
    },
    {
      id: 'feed-cat',
      familyId: family.id,
      title: 'Feed the cat',
      assignedToMemberId: 'leo',
      dueAt: '2026-09-22T17:00:00-07:00',
      status: 'completed',
      completedAt: '2026-09-22T07:30:00-07:00',
      points: 5,
      recurrence: 'daily',
    },
    {
      id: 'shoes-door',
      familyId: family.id,
      title: 'Put shoes by the door',
      dueAt: '2026-09-22T20:00:00-07:00',
      status: 'pending',
      points: 2,
      recurrence: 'daily',
    },
  ];
  const routines: Routine[] = [
    {
      id: 'emma-morning',
      familyId: family.id,
      name: 'Emma’s morning routine',
      period: 'morning',
      memberId: 'emma',
      steps: [
        { id: 'brush-teeth', title: 'Brush teeth', completed: true },
        { id: 'get-dressed', title: 'Get dressed', completed: true },
        { id: 'eat-breakfast', title: 'Eat breakfast', completed: true },
        { id: 'pack-backpack-step', title: 'Pack backpack', completed: false },
        { id: 'shoes-on', title: 'Shoes on', completed: false },
      ],
    },
    {
      id: 'leo-evening',
      familyId: family.id,
      name: 'Leo’s evening routine',
      period: 'evening',
      memberId: 'leo',
      steps: [
        { id: 'feed-cat-step', title: 'Feed the cat', completed: true },
        { id: 'put-toys-away', title: 'Put toys away', completed: false },
        { id: 'brush-teeth-evening', title: 'Brush teeth', completed: false },
      ],
    },
  ];

  return { family, members, events, chores, routines };
}

function event(
  id: string,
  title: string,
  category: CalendarEvent['category'],
  start: string,
  end: string,
  memberIds: string[],
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    familyId: 'family-home',
    title,
    category,
    startAt: `2026-09-22T${start}:00-07:00`,
    endAt: `2026-09-22T${end}:00-07:00`,
    ownerMemberId: memberIds[0] ?? 'alex',
    memberIds,
    preparation: [],
    source: 'demo',
    ...overrides,
  };
}

export interface DemoClock {
  now(): Date;
  set(value: string | Date): Date;
  advance(milliseconds: number): Date;
  reset(): Date;
}

export function createDemoClock(initialValue: string | Date = DEMO_NOW): DemoClock {
  const initial = toDate(initialValue);
  let timestamp = initial.getTime();
  return {
    now: () => new Date(timestamp),
    set: (value) => {
      timestamp = toDate(value).getTime();
      return new Date(timestamp);
    },
    advance: (milliseconds) => {
      if (!Number.isFinite(milliseconds)) throw new Error('Clock advance must be a finite number of milliseconds.');
      timestamp += milliseconds;
      return new Date(timestamp);
    },
    reset: () => {
      timestamp = initial.getTime();
      return new Date(timestamp);
    },
  };
}

function toDate(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Demo clock requires a valid date.');
  return date;
}

export interface DemoHouseholdRepository {
  getHousehold(): Family;
  listMembers(): FamilyMember[];
  listEvents(from?: string, to?: string): CalendarEvent[];
  listChores(): Chore[];
  listRoutines(): Routine[];
  snapshot(): HouseholdSnapshot;
  reset(): HouseholdSnapshot;
}

export function createDemoHouseholdRepository(): DemoHouseholdRepository {
  let data = createDemoHousehold();
  return {
    getHousehold: () => clone(data.family),
    listMembers: () => clone(data.members),
    listEvents: (from, to) => clone(data.events.filter((item) => inRange(item, from, to))),
    listChores: () => clone(data.chores),
    listRoutines: () => clone(data.routines),
    snapshot: () => clone(data),
    reset: () => {
      data = createDemoHousehold();
      return clone(data);
    },
  };
}

function inRange(event: CalendarEvent, from?: string, to?: string): boolean {
  const start = Date.parse(event.startAt);
  const end = Date.parse(event.endAt);
  return (!from || end > Date.parse(from)) && (!to || start < Date.parse(to));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
