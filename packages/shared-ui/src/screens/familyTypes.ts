import {
  CalendarEvent,
  Conflict,
  FamilyBriefing,
  HouseholdSnapshot,
  ProposedAction,
  ProviderState,
  WeatherForecast,
} from '@familyos/domain';
import { FamilyRoute } from '../navigation/familyNavigation';

export type { FamilyRoute } from '../navigation/familyNavigation';

export type TVPairingView = {
  status: 'checking' | 'unpaired' | 'creating' | 'waiting' | 'paired';
  code?: string;
  /** Link for the phone's camera: opens the Hometide web app with this code filled in. */
  pairUrl?: string;
  expiresAt?: string;
  error?: string;
};

export interface FamilyScreenProps {
  household: HouseholdSnapshot;
  conflicts: Conflict[];
  now: Date;
  calendarState: ProviderState<CalendarEvent[]>;
  weatherState: ProviderState<WeatherForecast>;
  briefing?: FamilyBriefing;
  agentStatus?: 'checking' | 'available' | 'unpaired' | 'offline';
  actionHistory?: ProposedAction[];
  focusActive: boolean;
  onNavigate: (route: FamilyRoute) => void;
  onOpenEvent?: (eventId: string) => void;
  initialEventId?: string | null;
  /** Open the calendar's day view on this household date (YYYY-MM-DD), e.g. from a voice request. */
  initialDay?: string | null;
  onFocusNavigation: () => void;
  onCompleteChore: (choreId: string, completed: boolean) => void;
  onToggleRoutineStep: (routineId: string, stepId: string) => void;
  onTogglePreparationItem: (eventId: string, itemId: string) => void;
  onRefreshData: () => void;
  onProposeAction?: (
    conflictId: string,
    eventId: string,
    targetMemberId: string,
  ) => Promise<{ action: ProposedAction; remote: boolean }>;
  onConfirmAction?: (action: ProposedAction, remote: boolean) => Promise<void>;
  onCancelAction?: (action: ProposedAction, remote: boolean) => Promise<void>;
  tvPairing?: TVPairingView;
  onStartPairing?: () => void;
  onUnpairTV?: () => void;
  /** True while a parent has unlocked this paired TV with the four-digit code. */
  tvParentMode?: boolean;
  onUnlockParentMode?: (code: string) => Promise<void>;
  onLockParentMode?: () => Promise<void>;
  /** The idle wall calendar: whether it turns on by itself, and a way to show it now. */
  wallCalendar?: { enabled: boolean; idleSeconds: number; reminderMinutes?: number; onToggle: () => void; onShowNow: () => void };
}
