export type Member = {
  id: string;
  familyId: string;
  name: string;
  initials: string;
  role: 'adult' | 'child';
  accentColor: string;
};
export type PreparationItem = { id: string; label: string; completed: boolean };
export type Event = {
  id: string;
  familyId: string;
  title: string;
  category: 'school' | 'appointment' | 'pickup' | 'dropoff' | 'drive' | 'sports' | 'meal' | 'family' | 'move';
  startAt: string;
  endAt: string;
  ownerMemberId: string;
  memberIds: string[];
  location?: string | null;
  source: string;
  allDay?: boolean;
  responsibleMemberId?: string | null;
  responsibilityType?: 'pickup' | 'dropoff' | 'drive' | null;
  travelMinutes?: number | null;
  preparation?: PreparationItem[];
  seriesId?: string | null;
  recurrence?: 'weekly' | null;
  teamId?: string | null;
  sportKind?: 'practice' | 'game' | null;
  arrivalMinutes?: number | null;
  uniform?: string | null;
  moveRoutineId?: string | null;
  /** Set on events mirrored from a connected calendar. They are read-only in Hometide. */
  calendarId?: string | null;
};
export type CalendarProvider = 'google' | 'icloud' | 'outlook' | 'ics';
export type ConnectedCalendar = {
  id: string;
  label: string;
  provider: CalendarProvider;
  host: string;
  memberIds: string[];
  status: 'pending' | 'ok' | 'error';
  message: string;
  lastSyncedAt?: string | null;
  eventCount: number;
};
export type Chore = {
  id: string;
  familyId: string;
  title: string;
  assignedToMemberId: string | null;
  status: 'pending' | 'completed';
  dueAt?: string | null;
  points?: number | null;
  recurrence?: 'daily' | 'weekly' | null;
  verifyWithPhoto?: boolean;
  photoHint?: string | null;
};
export type ListItem = {
  id: string;
  listName: string;
  title: string;
  category: string;
  completed: boolean;
  addedBy: string;
  ingredientName?: string | null;
  quantity?: number | null;
  unit?: string | null;
};
export type Team = {
  id: string;
  name: string;
  activity: string;
  memberIds: string[];
  uniform?: string | null;
  gear: string[];
  driverIds: string[];
  rotationIndex: number;
  location?: string | null;
  travelMinutes?: number | null;
};
export type FamilyNightSettings = {
  weekday: number;
  time: string;
  activityType: 'movie' | 'game' | 'other';
  pickerOrder: string[];
  pickerIndex: number;
};
export type FamilyNightPoll = {
  id: string;
  activityType: 'movie' | 'game' | 'other';
  suggestions: { id: string; title: string; byMemberId: string }[];
  votes: Record<string, string>;
  status: 'open' | 'tie' | 'decided';
  tiedSuggestionIds: string[];
  winnerSuggestionId?: string | null;
  decidedBy?: 'majority' | 'picker' | null;
  pickerMemberId?: string | null;
};
export type Proposal = {
  id: string;
  source: 'voice' | 'companion' | 'tv' | 'hometide';
  kind: 'pickup_swap' | 'event' | 'reschedule' | 'chore_done' | 'routine';
  status: 'pending' | 'confirmed' | 'rejected' | 'expired';
  summary: string;
  /** Routine suggestions carry why Hometide thinks so and what it will remember. */
  payload?: { detail?: string; learned?: string; evidence?: number; memory?: 'agentcore' | 'local'; [key: string]: unknown };
  requestedBy: string;
  createdAt: string;
  expiresAt: string;
  resultMessage?: string | null;
};
export type ChoreVerification = {
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
};
export type PhotoMeta = {
  id: string;
  caption: string;
  width: number;
  height: number;
  bytes: number;
  order: number;
  selected: boolean;
  rotation: 0 | 90 | 180 | 270;
  createdAt: string;
};
export type VoiceConnection = { id: string; label: string; memberId?: string | null; createdAt: string; lastUsedAt?: string | null };
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
  recipeId?: string | null;
  seriesId?: string | null;
  recurrence?: 'weekly' | 'biweekly' | 'monthly' | null;
};
export type Recipe = {
  id: string;
  name: string;
  ingredients: { name: string; quantity?: number | null; unit?: string | null }[];
  instructions: string[];
  servings: number;
  source: string;
};
export type ImportDraft = {
  id: string;
  sourceType: 'photo' | 'flyer' | 'email' | 'text' | 'ics';
  sourceName: string;
  status: 'review' | 'confirmed' | 'cancelled';
  proposal: {
    kind: 'event' | 'task' | 'recipe';
    title: string;
    description: string;
    date?: string | null;
    startAt?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    location?: string | null;
    ingredients?: string[];
    instructions?: string[];
    fieldsNeedingReview: string[];
    duplicateOf?: string | null;
    provider?: 'rules' | 'bedrock' | 'ics';
  };
};
export type ImportSource = { sourceType: 'photo' | 'flyer' | 'email' | 'text' | 'ics'; sourceName?: string; contentText?: string; contentBase64?: string };
export type StarTransaction = { id: string; memberId: string; delta: number; reason: 'chore_earned' | 'chore_reversed' | 'reward_redeemed' | 'adjustment' | 'move_completed'; sourceId: string; createdAt: string };
export type Reward = { id: string; title: string; stars: number; available: boolean };
export type RedemptionRequest = { id: string; memberId: string; rewardId: string; stars: number; status: 'pending' | 'approved' | 'rejected' | 'fulfilled'; requestedAt: string; approvedAt?: string | null; approvedBy?: string | null };
export type Household = {
  family: { id: string; name: string; timezone: string; memberIds: string[] };
  members: Member[];
  events: Event[];
  chores: Chore[];
  routines: unknown[];
  revision: number;
  listItems: ListItem[];
  meals: Meal[];
  lists?: { id: string; name: string; kind: 'grocery' | 'household' | 'custom' }[];
  recipes?: Recipe[];
  importDrafts?: ImportDraft[];
  rewards?: Reward[];
  redemptions?: RedemptionRequest[];
  starTransactions?: StarTransaction[];
  teams?: Team[];
  familyNight?: FamilyNightSettings | null;
  familyNightPolls?: FamilyNightPoll[];
  proposals?: Proposal[];
  choreVerifications?: ChoreVerification[];
  photos?: PhotoMeta[];
  location?: { latitude: number; longitude: number; label: string; source: 'device' | 'search'; updatedAt: string } | null;
  calendars?: ConnectedCalendar[];
  /** When the TV's wall calendar starts and how early it shows reminders (0 = off). Missing: 4 and 15 minutes. */
  tvSettings?: { wallIdleMinutes: number; reminderMinutes: number } | null;
};
export type Edit = {
  expectedRevision: number;
  kind:
    | 'event' | 'member' | 'chore' | 'listItem' | 'meal' | 'mealGroceries' | 'deleteEvent' | 'deleteMeal' | 'list'
    | 'recipe' | 'mealSeries' | 'importConfirm' | 'importCancel' | 'reward' | 'completeChore' | 'deleteListItem'
    | 'deleteChore' | 'deleteRecipe' | 'listItemToggle' | 'prepToggle' | 'redemptionFulfill' | 'team' | 'deleteTeam'
    | 'familyNightSettings' | 'familyNightSuggest' | 'familyNightVote' | 'familyNightClose' | 'familyNightPick'
    | 'proposalDecide' | 'photoMeta' | 'householdLocation' | 'calendarMeta' | 'tvSettings';
  value: object;
};
export type AccessContext = { accessMode: 'parent' | 'child' | null; memberId: string | null; memberName?: string; elevated?: boolean };
export type ChorePhotoResult = { verification: ChoreVerification; message: string; household: Household };
export type RecipeRequest = {
  description: string;
  date?: string;
  category?: 'Breakfast' | 'Lunch' | 'Dinner';
  groceries?: boolean;
};
export type GeneratedRecipeResult = {
  recipe: Recipe;
  meal: Meal | null;
  minutes: number;
  summary: string;
  /** "bedrock" when Amazon Bedrock wrote it; "cookbook" when AI was unavailable and a built-in recipe was used. */
  provider: 'bedrock' | 'cookbook';
  household: Household;
};
export interface HouseholdAPI {
  household(): Promise<Household>;
  editHousehold(edit: Edit): Promise<Household>;
  approveTV?(code: string): Promise<PairedTV>;
  pairedTVs?(): Promise<PairedTV[]>;
  unpairTV?(deviceId: string): Promise<void>;
  createImportDraft?(body: ImportSource): Promise<{ draft: ImportDraft; drafts?: ImportDraft[]; household: Household }>;
  /** Write a recipe from a short description with AI; it is saved (and planned on `date`) straight away. */
  generateRecipe?(body: RecipeRequest): Promise<GeneratedRecipeResult>;
  setParentAccessCode?(code: string): Promise<void>;
  accessCodeConfigured?(): Promise<boolean>;
  changeParentAccessCode?(oldCode: string, newCode: string): Promise<void>;
  resetParentAccessCode?(newCode: string, password: string, idToken?: string): Promise<void>;
  requestRedemption?(memberId: string, rewardId: string): Promise<{ request: RedemptionRequest; household: Household }>;
  decideRedemption?(id: string, action: 'approve' | 'reject', code: string): Promise<{ request: RedemptionRequest; household: Household }>;
  adjustStars?(memberId: string, delta: number, code: string): Promise<Household>;
  accessContext?(): Promise<AccessContext>;
  startChildSession?(memberId: string): Promise<{ memberId: string; memberName: string }>;
  returnToParentMode?(code: string): Promise<void>;
  lockParentMode?(): Promise<boolean>;
  revokeAllSessions?(): Promise<void>;
  /** Demo account only: put the demo family back to its saved starting point. */
  resetDemo?(): Promise<void>;
  /** Permanently delete the parent account and the household (local servers check the password, hosted ones a fresh ID token). */
  deleteAccount?(password: string, idToken?: string): Promise<void>;
  decideProposal?(id: string, action: 'confirm' | 'reject'): Promise<{ proposal: Proposal; household: Household }>;
  submitChorePhoto?(choreId: string, memberId: string, contentBase64: string): Promise<ChorePhotoResult>;
  decideChorePhoto?(id: string, action: 'approve' | 'reject' | 'retake', code: string): Promise<{ household: Household }>;
  uploadPhoto?(contentBase64: string, caption: string): Promise<{ photo: PhotoMeta; household: Household }>;
  updatePhoto?(id: string, patch: Partial<Pick<PhotoMeta, 'caption' | 'selected' | 'rotation' | 'order'>>): Promise<Household>;
  deletePhoto?(id: string): Promise<Household>;
  imageSource?(path: string): Promise<{ uri: string; headers?: Record<string, string> }>;
  voiceConnections?(): Promise<{ connections: VoiceConnection[]; mcpUrl: string }>;
  createVoiceConnection?(label: string, memberId?: string): Promise<{ connection: VoiceConnection; token: string; mcpUrl: string }>;
  revokeVoiceConnection?(id: string): Promise<void>;
  simulateVoice?(utterance: string): Promise<{ reply: string; mode: 'rules' | 'bedrock'; toolCalls: string[]; proposalIds: string[]; label: string }>;
  connectCalendar?(label: string, url: string, memberIds: string[]): Promise<{ calendar: ConnectedCalendar; household: Household }>;
  syncCalendar?(id: string): Promise<{ calendar: ConnectedCalendar; household: Household }>;
  disconnectCalendar?(id: string): Promise<Household>;
}
/** Error carrying the HTTP status so screens can react to expired sessions. */
export class APIRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'APIRequestError';
  }
}
export type Appearance = 'system' | 'light' | 'dark';
export type ParentAccount = { accountId: string; parentName: string; householdName: string; email: string; demo?: boolean };
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
export type GroceryLine = { name: string; quantity: number | null; unit: string | null; action: 'add' | 'combine' | 'already-listed' };
/** Preview what "Add ingredients to Groceries" will do, using the same matching rules as the server. */
export function groceryPlan(household: Household, mealId: string): GroceryLine[] {
  const meal = household.meals.find((item) => item.id === mealId);
  if (!meal) return [];
  const recipe = household.recipes?.find((item) => item.id === meal.recipeId);
  const wanted = recipe
    ? recipe.ingredients.map((item) => ({ name: item.name, quantity: item.quantity ?? null, unit: item.unit ?? null }))
    : meal.ingredients.map((line) => ({ name: line.trim(), quantity: null, unit: null })).filter((item) => item.name);
  const key = (name: string, unit: string | null) => `${name.trim().toLowerCase()}|${(unit || '').trim().toLowerCase()}`;
  const open = new Set(
    household.listItems
      .filter((item) => item.listName.toLowerCase() === 'groceries' && !item.completed)
      .map((item) => key(item.ingredientName || item.title, item.unit ?? null)),
  );
  const plan: GroceryLine[] = [];
  for (const item of wanted) {
    const existing = open.has(key(item.name, item.unit));
    const earlier = plan.find((line) => key(line.name, line.unit) === key(item.name, item.unit));
    if (earlier) {
      if (item.quantity !== null) earlier.quantity = (earlier.quantity || 0) + item.quantity;
      continue;
    }
    plan.push({ ...item, action: existing ? (item.quantity !== null ? 'combine' : 'already-listed') : 'add' });
  }
  return plan;
}
export function starBalance(household: Household, memberId: string | null | undefined): number {
  return (household.starTransactions || []).filter((item) => item.memberId === memberId).reduce((sum, item) => sum + item.delta, 0);
}
export function pollTally(poll: FamilyNightPoll): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(poll.suggestions.map((item) => [item.id, 0]));
  Object.values(poll.votes).forEach((id) => {
    if (id in counts) counts[id] += 1;
  });
  return counts;
}
/** Next family night on or after `from` (weekday uses Monday = 0, like the server). */
export function nextFamilyNight(settings: FamilyNightSettings, from: Date): string {
  const mondayBased = (from.getDay() + 6) % 7;
  const ahead = (settings.weekday - mondayBased + 7) % 7;
  return dateKey(new Date(from.getFullYear(), from.getMonth(), from.getDate() + ahead, 12));
}
export function validateEvent(title: string, starts: Date, ends: Date, members: string[]): string | null {
  if (!title.trim()) return 'Give your event a title.';
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts)
    return 'The end must be after the start.';
  if (!members.length) return 'Choose at least one family member.';
  return null;
}
