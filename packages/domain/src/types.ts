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

export type EventCategory = 'school' | 'appointment' | 'pickup' | 'dropoff' | 'drive' | 'sports' | 'meal' | 'family' | 'move';
export type ResponsibilityType = 'pickup' | 'dropoff' | 'drive';
export type EventSource = 'demo' | 'manual' | 'google' | 'outlook' | 'import' | 'voice';

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
  allDay?: boolean;
  seriesId?: string | null;
  teamId?: string | null;
  sportKind?: 'practice' | 'game' | null;
  arrivalMinutes?: number | null;
  uniform?: string | null;
  moveRoutineId?: string | null;
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
  verifyWithPhoto?: boolean;
  photoHint?: string | null;
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

export interface HouseholdReward {
  id: string;
  title: string;
  stars: number;
  available: boolean;
}

export interface HouseholdRedemption {
  id: string;
  memberId: string;
  rewardId: string;
  stars: number;
  status: 'pending' | 'approved' | 'rejected' | 'fulfilled';
  requestedAt: string;
}

export interface StarTransaction {
  id: string;
  memberId: string;
  delta: number;
  reason: 'chore_earned' | 'chore_reversed' | 'reward_redeemed' | 'adjustment' | 'move_completed';
  sourceId: string;
  createdAt: string;
}

/** A change requested by voice (or another indirect source). Nothing changes until someone confirms it. */
export interface HouseholdProposal {
  id: string;
  source: 'voice' | 'companion' | 'tv';
  kind: 'pickup_swap' | 'event' | 'reschedule' | 'chore_done';
  status: 'pending' | 'confirmed' | 'rejected' | 'expired';
  summary: string;
  requestedBy: string;
  createdAt: string;
  expiresAt: string;
  resultMessage?: string | null;
}

export interface ChoreVerification {
  id: string;
  choreId: string;
  memberId: string;
  photoId?: string | null;
  verdict: 'looks_done' | 'unclear' | 'not_done';
  reason: string;
  confidence: number;
  provider: 'demo' | 'bedrock' | 'fallback';
  status: 'pending' | 'approved' | 'rejected' | 'retake';
  submittedAt: string;
}

export interface FamilyNightSettings {
  weekday: number; // Monday = 0
  time: string;
  activityType: 'movie' | 'game' | 'other';
  pickerOrder: string[];
  pickerIndex: number;
}

export interface FamilyNightPoll {
  id: string; // YYYY-MM-DD
  activityType: 'movie' | 'game' | 'other';
  suggestions: Array<{ id: string; title: string; byMemberId: string }>;
  votes: Record<string, string>;
  status: 'open' | 'tie' | 'decided';
  tiedSuggestionIds: string[];
  winnerSuggestionId?: string | null;
  decidedBy?: 'majority' | 'picker' | null;
  pickerMemberId?: string | null;
}

export interface HouseholdPhoto {
  id: string;
  caption: string;
  width: number;
  height: number;
  order: number;
  selected: boolean;
  rotation: 0 | 90 | 180 | 270;
}

export interface HouseholdTeam {
  id: string;
  name: string;
  activity: string;
  memberIds: string[];
  uniform?: string | null;
  gear: string[];
  driverIds: string[];
  rotationIndex: number;
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
  rewards?: HouseholdReward[];
  redemptions?: HouseholdRedemption[];
  starTransactions?: StarTransaction[];
  proposals?: HouseholdProposal[];
  choreVerifications?: ChoreVerification[];
  familyNight?: FamilyNightSettings | null;
  familyNightPolls?: FamilyNightPoll[];
  photos?: HouseholdPhoto[];
  teams?: HouseholdTeam[];
}
