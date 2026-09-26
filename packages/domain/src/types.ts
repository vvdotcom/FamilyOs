export type FamilyRole = 'adult' | 'child';

export interface Family {
  id: string;
  name: string;
  timezone: string;
  memberIds: string[];
}

export interface FamilyMember {
  id: string;
  familyId: string;
  name: string;
  initials: string;
  role: FamilyRole;
  accentColor: string;
}

export type EventCategory = 'school' | 'appointment' | 'pickup' | 'sports' | 'meal' | 'family';
export type ResponsibilityType = 'pickup' | 'dropoff' | 'drive';
export type EventSource = 'demo' | 'manual' | 'google' | 'outlook';

export interface PreparationItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface CalendarEvent {
  id: string;
  familyId: string;
  title: string;
  category: EventCategory;
  startAt: string;
  endAt: string;
  ownerMemberId: string;
  memberIds: string[];
  responsibleMemberId?: string;
  responsibilityType?: ResponsibilityType;
  location?: string;
  travelMinutes?: number;
  preparation: PreparationItem[];
  source: EventSource;
}

export type ChoreStatus = 'pending' | 'completed';

export interface Chore {
  id: string;
  familyId: string;
  title: string;
  assignedToMemberId?: string;
  dueAt?: string;
  status: ChoreStatus;
  points?: number;
  recurrence?: 'daily' | 'weekly';
  completedAt?: string;
}

export interface RoutineStep {
  id: string;
  title: string;
  completed: boolean;
}

export interface Routine {
  id: string;
  familyId: string;
  name: string;
  period: 'morning' | 'evening';
  memberId: string;
  steps: RoutineStep[];
}

export type ConflictType = 'event_overlap' | 'responsibility_overlap' | 'travel_buffer' | 'preparation';
export type ConflictSeverity = 'info' | 'warning' | 'critical';

export interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  title: string;
  message: string;
  eventIds: string[];
  memberIds: string[];
  startsAt: string;
  endsAt: string;
  suggestedMemberId?: string;
}

export interface ProposedAction {
  id: string;
  type: 'reassign_responsibility';
  status: 'proposed' | 'confirmed' | 'cancelled';
  eventId: string;
  conflictId: string;
  fromMemberId: string;
  toMemberId: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface FamilyBriefing {
  date: string;
  headline: string;
  summary: string;
  highlights: string[];
  conflictIds: string[];
  provider: 'deterministic' | 'ai';
}

export interface HouseholdListItem {
  id: string;
  listName: string;
  title: string;
  category: string;
  completed: boolean;
  addedBy: string;
}

export interface HouseholdMeal {
  id: string;
  title: string;
  date: string;
  category: 'Breakfast' | 'Lunch' | 'Dinner';
  cookIds: string[];
  servings: number;
  minutes: number;
  ingredients: string[];
  instructions: string[];
}

export interface HouseholdSnapshot {
  family: Family;
  members: FamilyMember[];
  events: CalendarEvent[];
  chores: Chore[];
  routines: Routine[];
  revision?: number;
  listItems?: HouseholdListItem[];
  meals?: HouseholdMeal[];
}
