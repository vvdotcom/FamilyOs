import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Platform, View, useWindowDimensions } from 'react-native';
import { SpatialNavigationNode, SpatialNavigationRoot } from 'react-tv-space-navigation';
import {
  briefingEvents,
  createDemoCalendarProvider,
  createDeterministicBriefing,
  DEMO_NOW,
  confirmReassignment,
  detectConflicts,
  HouseholdSnapshot,
  loadCalendarData,
  loadWeatherData,
  FamilyBriefing,
  openBriefingConflicts,
  pendingApprovals,
  ProviderState,
  ProposedAction,
  proposeReassignment,
  recentDecisions,
  setChoreCompleted,
  togglePreparationItem,
  toggleRoutineStep,
  WeatherForecast,
  Conflict,
} from '@familyos/domain';
import { FamilyThemeProvider } from '../theme';
import { DButton, DIcon, DRow, DText, IconName, formatTime, registerMemberColors, useDesignPalette } from '../design/DesignSystem';
import { WeatherIcon } from '../design/WeatherIcon';
import { createFamilyAgentContext, familyAgentClient, FamilyAgentError } from '../api/familyAgentClient';
import { useBackToHome } from '../hooks/useBackToHome';
import { PageBackContext } from '../hooks/usePageBack';
import FamilyHomeScreen from './FamilyHomeScreen';
import FamilyCalendarScreen from './FamilyCalendarScreen';
import FamilyChoresScreen from './FamilyChoresScreen';
import FamilyMembersScreen from './FamilyMembersScreen';
import FamilySettingsScreen from './FamilySettingsScreen';
import { FamilyMealsScreen, FamilyListsScreen, FamilyPhotosScreen } from './FamilyPlannerScreens';
import { ApprovalOverlay, FamilyApprovalsScreen, FamilyMoveScreen, FamilyNightTVScreen, ProposalOverlay, StarCelebration } from './FamilyTVFeatures';
import { FamilyRoute, focusRegionAfterDirection } from '../navigation/familyNavigation';
import type { TVPairingView } from './familyTypes';
import {
  hydrateHouseholdSnapshot,
  loadHouseholdSnapshot,
  resetHouseholdSnapshot,
  SAMPLE_BUILD,
  saveHouseholdSnapshot,
} from './householdStorage';
import { usePlannerData } from './plannerData';
import { voiceTVAction } from '../navigation/voiceCommands';
import FamilyWallScreen, { WALL_IDLE_SECONDS } from './FamilyWallScreen';
import { dueReminder, Reminder, ReminderToast } from '../components/ReminderToast';
import RemoteControlManager from '../app/remote-control/RemoteControlManager';
import { SupportedKeys } from '../app/remote-control/SupportedKeys';
import { nativeStore } from '../storage/nativeStore';
import { AppErrorBoundary } from '../app/AppErrorBoundary';

const WALL_KEY = 'familyos.wall-calendar';
// A movement break keeps its timer, and the photo slideshow is already ambient.
const WALL_EXEMPT: FamilyRoute[] = ['Move', 'Photos'];

const tabs: { route: FamilyRoute; icon?: IconName; width: number }[] = [
  { route: 'Home', icon: 'home', width: 167 },
  { route: 'Calendar', icon: 'calendar', width: 204 },
  { route: 'Chores', icon: 'chores', width: 180 },
  { route: 'Meals', icon: 'meals', width: 164 },
  { route: 'Lists', icon: 'lists', width: 151 },
  { route: 'Photos', icon: 'photos', width: 179 },
  { route: 'Settings', width: 160 },
];

/** What the family briefing covers right now: today's remaining plans, open problems, recent decisions. */
function briefingFocusFor(household: HouseholdSnapshot, conflicts: Conflict[], now: Date) {
  const events = briefingEvents(household.events, now, household.family.timezone);
  const open = openBriefingConflicts(conflicts, household.events, now);
  const recent = recentDecisions(household.proposals ?? [], now);
  const key = JSON.stringify([
    events.map((event) => [event.id, event.title, event.startAt, event.endAt, event.responsibleMemberId ?? '']),
    open.map((item) => item.id),
    recent,
  ]);
  return { events, open, recent, key };
}

/** The briefing written on the TV: shown at once, and kept if the AI briefing can't be reached. */
function localBriefing(household: HouseholdSnapshot, conflicts: Conflict[], now: Date): FamilyBriefing {
  const focus = briefingFocusFor(household, conflicts, now);
  return createDeterministicBriefing(household.members, focus.events, household.chores, focus.open, now,
    household.family.timezone, focus.recent);
}

/**
 * Runs `task` now, then again `delay()` ms after each run finishes (never two at once). Calling a registered waker
 * runs it straight away, e.g. when the TV comes back from the photo wall. Returns a function that stops it.
 */
function startPolling(task: () => Promise<void>, delay: () => number, wakers: Set<() => void>) {
  let active = true;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (running || !active) return;
    running = true;
    try {
      await task();
    } catch {
      // Each task handles its own errors; this only keeps the loop alive if one slips through.
    } finally {
      running = false;
    }
    if (active) timer = setTimeout(() => void run(), delay());
  };
  const wake = () => void run();
  wakers.add(wake);
  void run();
  return () => {
    active = false;
    wakers.delete(wake);
    if (timer) clearTimeout(timer);
  };
}

export default function FamilyOsShell() {
  return (
    <AppErrorBoundary>
      <FamilyThemeProvider>
        <FamilyOsShellContent />
      </FamilyThemeProvider>
    </AppErrorBoundary>
  );
}

function FamilyOsShellContent() {
  const { width, height } = useWindowDimensions();
  const scale = Math.min(width / 1920, height / 1080);
  const [route, setRoute] = useState<FamilyRoute>('Home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [calendarEventId, setCalendarEventId] = useState<string | null>(null);
  const [focusRegion, setFocusRegion] = useState<'navigation' | 'content'>('content');
  const [demoVersion, setDemoVersion] = useState(0);
  // Bumped by rare events (pairing, unpairing, "Refresh data"): reloads everything. A household change from the
  // phone bumps changeVersion instead, so it doesn't restart the sync, the calendar, the weather and the briefing.
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [changeVersion, setChangeVersion] = useState(0);
  const [household, setHousehold] = useState<HouseholdSnapshot>(loadHouseholdSnapshot);
  const householdRef = useRef(household);
  householdRef.current = household;
  registerMemberColors(household.members);
  const [calendarState, setCalendarState] = useState<ProviderState<HouseholdSnapshot['events']>>({ status: 'loading' });
  const [weatherState, setWeatherState] = useState<ProviderState<WeatherForecast>>({ status: 'loading' });
  const weatherCacheRef = useRef<WeatherForecast | undefined>(undefined);
  if (weatherState.data) weatherCacheRef.current = weatherState.data;
  const [tvPairing, setTVPairing] = useState<TVPairingView & { challengeId?: string; pollingToken?: string }>({ status: 'checking' });
  // The TV always follows the real clock. Unpaired it has an empty household; once paired, today's
  // events from the phone appear here.
  const [now, setNow] = useState(() => (SAMPLE_BUILD ? new Date(DEMO_NOW) : new Date()));
  useEffect(() => {
    if (SAMPLE_BUILD) return;
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  // The clock ticks every 30 seconds; checking hundreds of events for clashes every 5 minutes is plenty.
  const conflictWindow = Math.floor(now.getTime() / 300_000);
  const conflicts = useMemo(
    () => detectConflicts(household.members, household.events, { now: new Date(conflictWindow * 300_000) }),
    [household, conflictWindow],
  );
  const briefingFocus = useMemo(() => briefingFocusFor(household, conflicts, now), [household, conflicts, now]);
  const [briefing, setBriefing] = useState<FamilyBriefing>(() => localBriefing(household, conflicts, now));
  const [agentStatus, setAgentStatus] = useState<'checking' | 'available' | 'unpaired' | 'offline'>('checking');
  const [actionHistory, setActionHistory] = useState<ProposedAction[]>([]);
  const planner = usePlannerData(false, SAMPLE_BUILD);
  const [toast, setToast] = useState('');
  const [celebration, setCelebration] = useState<{ memberId: string; stars: number; detail: string } | null>(null);
  const [tvElevated, setTVElevated] = useState(false);
  const [dismissedProposals, setDismissedProposals] = useState<string[]>([]);
  // Chore photos and reward requests that arrive while the TV is on pop up as a card; ones already waiting
  // when the TV starts stay in Approvals (and on Home) instead of interrupting.
  const seenApprovals = useRef<Set<string> | null>(null);
  const [approvalQueue, setApprovalQueue] = useState<string[]>([]);
  const [wallEnabled, setWallEnabled] = useState(true);
  // Set by a parent in the phone app (Family → TV); without it the TV uses its own defaults.
  const wallIdleSeconds = household.tvSettings ? household.tvSettings.wallIdleMinutes * 60 : WALL_IDLE_SECONDS;
  const reminderMinutes = household.tvSettings ? household.tvSettings.reminderMinutes : 15;
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const remindedRef = useRef(new Set<string>());
  const [wallMode, setWallMode] = useState(false);
  const lastInputRef = useRef(Date.now());
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const [voiceVisit, setVoiceVisit] = useState(0);
  const commandSeq = useRef(-1);
  const paired = tvPairing.status === 'paired';
  const pairedRef = useRef(paired);
  pairedRef.current = paired;
  // Polling slows down while the photo wall is up and almost stops in the background; it picks up again at once.
  const wallModeRef = useRef(wallMode);
  wallModeRef.current = wallMode;
  const backgroundRef = useRef(false);
  const pollWakers = useRef(new Set<() => void>());
  const pollDelay = (normal: number, idle: number) => (backgroundRef.current ? 60_000 : wallModeRef.current ? idle : normal);
  const briefingInputRef = useRef({ household, conflicts, now, focus: briefingFocus });
  briefingInputRef.current = { household, conflicts, now, focus: briefingFocus };
  const briefingVersionRef = useRef('');
  const briefingRequestId = useRef(0);
  const calendarRequestId = useRef(0);
  const p = useDesignPalette();

  useEffect(() => {
    let active = true;
    void familyAgentClient.tvDeviceToken().then((token) => {
      if (!active) return;
      setTVPairing({ status: token ? 'paired' : 'unpaired' });
      if (token) setRefreshVersion((value) => value + 1);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (tvPairing.status !== 'paired') return;
    let active = true;
    let polls = 0;
    let sessionCheckedAt = 0;
    const syncHousehold = async () => {
      try {
        const token = await familyAgentClient.tvDeviceToken();
        if (!token || !active) return;
        const known = householdRef.current.revision ?? 0;
        // Most polls only ask whether anything changed since this revision (a tiny reply). The first poll, and one a
        // minute, take a full copy and compare it, so a change that didn't move the revision still reaches the TV.
        const first = polls === 0;
        const full = polls % 12 === 0;
        polls += 1;
        const response = full ? await familyAgentClient.getHousehold() : await familyAgentClient.householdSince(known);
        if (!active) return;
        if (Date.now() - sessionCheckedAt >= 30_000) {
          sessionCheckedAt = Date.now();
          void familyAgentClient.tvSession().then((session) => active && setTVElevated(session.data.elevated)).catch(() => undefined);
        }
        if ('unchanged' in response.data) return;
        const next = response.data;
        const changed = first || next.revision !== known
          || ((full || !next.revision) && JSON.stringify(next) !== JSON.stringify(householdRef.current));
        if (!changed) return;
        const waiting = pendingApprovals(next).map((item) => item.id);
        if (seenApprovals.current === null) seenApprovals.current = new Set(waiting);
        else {
          const fresh = waiting.filter((id) => !seenApprovals.current!.has(id));
          fresh.forEach((id) => seenApprovals.current!.add(id));
          if (fresh.length) setApprovalQueue((queue) => [...queue, ...fresh]);
        }
        householdRef.current = next;
        setHousehold(next);
        planner.syncHousehold(next);
        setCalendarState({
          status: next.events.length ? 'available' : 'empty',
          data: next.events,
          source: 'Hometide household service',
        });
        setChangeVersion((value) => value + 1);
      } catch (error) {
        if (active && error instanceof FamilyAgentError && error.status === 401) {
          await familyAgentClient.clearTVDeviceToken();
          const demo = resetHouseholdSnapshot();
          householdRef.current = demo;
          setHousehold(demo);
          planner.reset();
          setTVPairing({ status: 'unpaired', error: 'This TV session was revoked. Pair again to reconnect.' });
        }
        // Keep the last paired snapshot visible during a temporary connection failure.
      }
    };
    const stop = startPolling(syncHousehold, () => pollDelay(5_000, 15_000), pollWakers.current);
    return () => {
      active = false;
      stop();
    };
  }, [tvPairing.status, refreshVersion]);

  // Wake the polling when the TV comes back from the background or from the photo wall.
  useEffect(() => {
    let subscription: { remove: () => void } | undefined;
    try {
      subscription = AppState.addEventListener('change', (state) => {
        const background = state === 'background';
        const returning = backgroundRef.current && !background;
        backgroundRef.current = background;
        if (returning) pollWakers.current.forEach((wake) => wake());
      });
    } catch {
      // Some platforms don't report app state; polling then keeps its normal pace.
    }
    return () => subscription?.remove();
  }, []);
  const wallWasOn = useRef(false);
  useEffect(() => {
    if (wallWasOn.current && !wallMode) pollWakers.current.forEach((wake) => wake());
    wallWasOn.current = wallMode;
  }, [wallMode]);

  // Native storage is async (Vega): restore the saved local household before saving over it.
  const [householdRestored, setHouseholdRestored] = useState(Platform.OS === 'web');
  useEffect(() => {
    if (householdRestored) return;
    let active = true;
    void hydrateHouseholdSnapshot().then((stored) => {
      if (!active) return;
      // A paired TV shows the household from the server, not the copy saved while it was unpaired.
      if (stored && !pairedRef.current) {
        householdRef.current = stored;
        setHousehold(stored);
        setRefreshVersion((value) => value + 1);
      }
      setHouseholdRestored(true);
    });
    return () => {
      active = false;
    };
  }, [householdRestored]);

  useEffect(() => {
    if (householdRestored && tvPairing.status === 'unpaired') saveHouseholdSnapshot(household);
  }, [household, tvPairing.status, householdRestored]);

  useEffect(() => {
    if (tvPairing.status !== 'waiting' || !tvPairing.challengeId || !tvPairing.pollingToken) return;
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await familyAgentClient.claimPairing(tvPairing.challengeId!, tvPairing.pollingToken!);
        if (active && response.data.status === 'approved' && response.data.deviceToken) {
          setTVPairing({ status: 'paired' });
          setRefreshVersion((value) => value + 1);
        }
      } catch (error) {
        if (active && error instanceof FamilyAgentError && [404, 410].includes(error.status || 0)) {
          setTVPairing({ status: 'unpaired', error: error.message });
        }
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 2500);
    return () => { active = false; clearInterval(interval); };
  }, [tvPairing.status, tvPairing.challengeId, tvPairing.pollingToken]);
  useEffect(() => {
    // A paired TV's calendar comes from the household sync above; this loads the TV's own (unpaired) calendar.
    if (paired) return;
    let active = true;
    // Separate from briefingRequestId: the briefing effect below runs in the same commit and
    // would otherwise invalidate this request, leaving the calendar stuck on "loading".
    const requestId = ++calendarRequestId.current;
    setCalendarState({ status: 'loading' });
    void loadCalendarData(createDemoCalendarProvider(household), household.events).then((result) => {
      // Pairing may have finished meanwhile: never put the local calendar over the household from the server.
      if (!active || requestId !== calendarRequestId.current || pairedRef.current) return;
      setCalendarState(result);
      if (result.data) setHousehold((current) => ({ ...current, events: result.data! }));
    });
    return () => {
      active = false;
    };
  }, [demoVersion, refreshVersion, paired]);

  const weatherLabel = household.location?.label ?? '';
  useEffect(() => {
    let active = true;
    if (!weatherCacheRef.current) setWeatherState({ status: 'loading' });
    const weatherProvider = {
      name: 'National Weather Service',
      async getForecast() {
        return (await familyAgentClient.getWeather()).data;
      },
    };
    const refreshWeather = () => {
      const stamp = (SAMPLE_BUILD ? new Date(DEMO_NOW) : new Date()).toISOString();
      void loadWeatherData(weatherProvider, householdRef.current.location?.label ?? '', stamp, weatherCacheRef.current).then((result) => {
        if (active) setWeatherState(result);
      });
    };
    refreshWeather();
    const weatherInterval = setInterval(refreshWeather, 15 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(weatherInterval);
    };
  }, [demoVersion, refreshVersion, paired, weatherLabel]);

  // The briefing is rewritten whenever what it covers changes (a confirmed swap, a routine, a plan that
  // ended), not only when the app starts. The TV's own version shows at once; the AI version follows.
  useEffect(() => {
    let active = true;
    const requestId = ++briefingRequestId.current;
    // The household sync bumps refreshVersion on every change, so only a first load or a demo reset counts as
    // a reload; anything else is a change to the day, which waits a moment and keeps the agent status.
    const version = String(demoVersion);
    const reload = briefingVersionRef.current !== version;
    briefingVersionRef.current = version;
    const first = briefingInputRef.current;
    setBriefing(localBriefing(first.household, first.conflicts, first.now));
    if (reload) setAgentStatus('checking');
    // Wait a moment after a change, so a burst (confirm, then the routine) asks for one briefing, not several.
    const timer = setTimeout(() => {
      const input = briefingInputRef.current;
      const fallback = localBriefing(input.household, input.conflicts, input.now);
      const health = familyAgentClient.getHealth().then(
        () => true,
        () => false,
      );
      void Promise.all([
        health,
        familyAgentClient.createBriefing(createFamilyAgentContext(input.household, input.focus.open, input.now, undefined, {
          events: input.focus.events,
          recentChanges: input.focus.recent,
        })),
      ])
        .then(([reachable, response]) => {
          if (!active || requestId !== briefingRequestId.current) return;
          setBriefing(response.data);
          setAgentStatus(reachable ? 'available' : 'offline');
        })
        .catch(async (error) => {
          if (!active || requestId !== briefingRequestId.current) return;
          setBriefing(fallback);
          // A hosted service answers an unpaired TV with 401/403: it is reachable, the TV just is not paired yet.
          const refused = error instanceof FamilyAgentError && (error.status === 401 || error.status === 403);
          const reachable = await health;
          if (!active || requestId !== briefingRequestId.current) return;
          setAgentStatus(reachable && refused ? 'unpaired' : 'offline');
        });
    }, reload ? 0 : 1500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [demoVersion, refreshVersion, briefingFocus.key]);

  useEffect(() => {
    let active = true;
    void familyAgentClient
      .getActionHistory()
      .then((response) => {
        if (active) setActionHistory(response.data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [demoVersion, refreshVersion, changeVersion]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  /** Paired TVs save shared-screen changes on the server; the server decides what the TV may change. */
  const applyServerHousehold = (next: HouseholdSnapshot) => {
    householdRef.current = next;
    setHousehold(next);
    planner.syncHousehold(next);
    setCalendarState({ status: next.events.length ? 'available' : 'empty', data: next.events, source: 'Hometide household service' });
  };
  const serverEdit = async (kind: string, value: Record<string, unknown>) => {
    try {
      const response = await familyAgentClient.editHousehold(kind, value, householdRef.current.revision ?? 0);
      applyServerHousehold(response.data);
      return true;
    } catch (error) {
      setToast(
        error instanceof FamilyAgentError && error.code === 'PARENT_CODE_REQUIRED'
          ? 'Ask a parent to unlock the TV in Settings with the four-digit code.'
          : error instanceof FamilyAgentError && error.code === 'PHOTO_REQUIRED'
            ? 'This chore needs a photo from the phone app so a parent can approve it.'
            : error instanceof Error
              ? error.message
              : 'That change could not be saved.',
      );
      if (error instanceof FamilyAgentError && error.status === 409) {
        void familyAgentClient.getHousehold().then((response) => applyServerHousehold(response.data)).catch(() => undefined);
      }
      return false;
    }
  };
  const plannerView = paired
    ? {
        ...planner,
        toggleItem: (listId: string, itemId: string) => {
          planner.toggleItem(listId, itemId);
          void serverEdit('listItemToggle', { id: itemId });
        },
        clearChecked: () => {
          const checked = planner.data.lists.flatMap((list) => list.items.filter((item) => item.done));
          void (async () => {
            for (const item of checked) if (!(await serverEdit('deleteListItem', { id: item.id }))) return;
          })();
        },
        addItems: (listId: string, texts: string[]) => {
          const listName = planner.data.lists.find((list) => list.id === listId)?.name || 'Groceries';
          void (async () => {
            for (const text of texts.map((value) => value.trim()).filter(Boolean)) {
              const saved = await serverEdit('listItem', {
                id: `tv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                listName, title: text.slice(0, 160), category: 'Other', completed: false, addedBy: 'TV',
              });
              if (!saved) return;
            }
          })();
        },
        setMeal: (key: string, title: string) => {
          const [date, category] = key.split(':');
          const existing = (householdRef.current.meals || []).find((meal) => meal.date === date && meal.category === category);
          if (!title.trim()) {
            if (existing) void serverEdit('deleteMeal', { id: existing.id });
            return;
          }
          void serverEdit('meal', existing
            ? { ...existing, title: title.trim().slice(0, 120) }
            : { id: `tv-${date}-${category}`, title: title.trim().slice(0, 120), date, category, cookIds: [], servings: 4, minutes: 30, ingredients: [], instructions: [] });
        },
        generateRecipe: async (key: string, description: string) => {
          const [date, category] = key.split(':');
          try {
            const response = await familyAgentClient.generateRecipe({
              description, date, category: category as 'Breakfast' | 'Lunch' | 'Dinner',
            });
            applyServerHousehold(response.data.household);
            setToast(
              response.data.provider === 'bedrock'
                ? `${response.data.recipe.name} is on the meal plan.`
                : `${response.data.recipe.name} is on the meal plan (from Hometide's built-in recipes).`,
            );
            return null;
          } catch (error) {
            return error instanceof Error ? error.message : 'Hometide could not write that recipe. Try again.';
          }
        },
        addMealGroceries: async (key: string) => {
          const [date, category] = key.split(':');
          const meal = (householdRef.current.meals || []).find((item) => item.date === date && item.category === category);
          return meal ? serverEdit('mealGroceries', { id: meal.id }) : false;
        },
      }
    : planner;
  const unlockTVParentMode = async (code: string) => {
    await familyAgentClient.unlockParentMode(code);
    setTVElevated(true);
  };
  const lockTVParentMode = async () => {
    await familyAgentClient.lockParentMode().catch(() => undefined);
    setTVElevated(false);
  };
  const pendingProposal = paired
    ? (household.proposals || []).find((item) => item.status === 'pending' && !dismissedProposals.includes(item.id))
    : undefined;
  const activeApproval = paired && !pendingProposal
    ? pendingApprovals(household).find((item) => approvalQueue.includes(item.id))
    : undefined;
  const overlayOpen = !!pendingProposal || !!activeApproval;
  const waitingApprovals = paired
    ? (household.choreVerifications || []).filter((item) => item.status === 'pending').length +
      (household.redemptions || []).filter((item) => item.status === 'pending').length
    : 0;

  const pageBack = useRef<(() => void) | null>(null);
  // Wall calendar: restore the family's choice, leave on any key, and return after idle minutes.
  useEffect(() => {
    let active = true;
    const read = Platform.OS === 'web'
      ? Promise.resolve((() => { try { return globalThis.localStorage?.getItem(WALL_KEY) ?? null; } catch { return null; } })())
      : nativeStore.getItem(WALL_KEY).catch(() => null);
    void read.then((stored) => { if (active && stored === 'off') setWallEnabled(false); });
    return () => { active = false; };
  }, []);
  const toggleWall = () => {
    const next = !wallEnabled;
    setWallEnabled(next);
    const value = next ? 'on' : 'off';
    if (Platform.OS === 'web') {
      try { globalThis.localStorage?.setItem(WALL_KEY, value); } catch { /* Session-only when storage is blocked. */ }
    } else void nativeStore.setItem(WALL_KEY, value).catch(() => undefined);
  };
  useEffect(() => {
    const onKey = (key: SupportedKeys) => {
      lastInputRef.current = Date.now();
      if (wallMode) {
        setWallMode(false);
        return;
      }
      if (key === SupportedKeys.Menu && !overlayOpen) setMenuOpen((open) => !open);
    };
    RemoteControlManager.addKeydownListener(onKey);
    const onWebKey = () => {
      lastInputRef.current = Date.now();
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('keydown', onWebKey);
    return () => {
      RemoteControlManager.removeKeydownListener(onKey);
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('keydown', onWebKey);
    };
  }, [wallMode, overlayOpen]);
  // A pairing code must stay readable for its whole 10 minutes, so the wall never covers it.
  const pairingOnScreen = tvPairing.status === 'creating' || tvPairing.status === 'waiting';
  useEffect(() => {
    if (!wallEnabled || wallMode || wallIdleSeconds <= 0) return;
    const timer = setInterval(() => {
      if (Date.now() - lastInputRef.current >= wallIdleSeconds * 1000 && !WALL_EXEMPT.includes(route) && !menuOpen && !celebration && !pairingOnScreen) {
        setWallMode(true);
      }
    }, wallIdleSeconds <= 60 ? 2_000 : 10_000);
    return () => clearInterval(timer);
  }, [wallEnabled, wallMode, wallIdleSeconds, route, menuOpen, celebration, pairingOnScreen]);
  // A reminder before each timed event, once, while Hometide is on screen (family feedback, 2026-10-15).
  useEffect(() => {
    const next = dueReminder(household.events, household.members, now, reminderMinutes, remindedRef.current);
    if (!next) return;
    remindedRef.current.add(next.key);
    setReminder(next);
  }, [now, household.events, household.members, reminderMinutes]);
  useEffect(() => {
    if (!reminder) return;
    const timer = setTimeout(() => setReminder(null), 20_000);
    return () => clearTimeout(timer);
  }, [reminder]);
  const leaveWall = () => {
    lastInputRef.current = Date.now();
    setWallMode(false);
  };
  const showWall = wallMode && !overlayOpen;
  // Voice ("Alexa, ask family o. s. to open the calendar") reaches this TV through the household service.
  useEffect(() => {
    if (!paired) return;
    let active = true;
    commandSeq.current = -1;
    const poll = async () => {
      try {
        const reply = await familyAgentClient.tvCommands(commandSeq.current);
        if (!active) return;
        const starting = commandSeq.current < 0;
        commandSeq.current = reply.data.latest;
        if (starting) return;
        for (const command of reply.data.commands) {
          const action = voiceTVAction(command);
          if (action.kind === 'ignore') continue;
          lastInputRef.current = Date.now();
          setMenuOpen(false);
          if (action.kind === 'wall') {
            setWallMode(true);
          } else {
            setWallMode(false);
            setVoiceVisit((value) => value + 1);
            visit(action.route);
            setCalendarDay(action.day); // After visit(), which clears it for ordinary navigation.
          }
          setToast(`Voice: ${command.label || command.screen}`);
        }
      } catch {
        // Keep the current screen; the next poll retries.
      }
    };
    // Every 1.5 seconds while someone is watching; voice can still wake the photo wall, just a little slower.
    const stop = startPolling(poll, () => pollDelay(1_500, 4_000), pollWakers.current);
    return () => {
      active = false;
      stop();
    };
  }, [paired]);
  useBackToHome(route, setRoute, focusRegion, setFocusRegion, () => {
    if (menuOpen) {
      setMenuOpen(false);
      return true;
    }
    if (pageBack.current) {
      pageBack.current();
      return true;
    }
    return false;
  });
  const visit = (next: FamilyRoute) => {
    setRoute(next);
    setCalendarEventId(null);
    setCalendarDay(null);
    setFocusRegion(next === 'Photos' ? 'navigation' : 'content');
    setMenuOpen(false);
  };
  const startTVPairing = async () => {
    setTVPairing({ status: 'creating' });
    try {
      const response = await familyAgentClient.createPairingChallenge('Hometide TV');
      setTVPairing({
        status: 'waiting',
        code: response.data.code,
        pairUrl: response.data.pairUrl,
        expiresAt: response.data.expiresAt,
        challengeId: response.data.challengeId,
        pollingToken: response.data.pollingToken,
      });
    } catch (error) {
      setTVPairing({ status: 'unpaired', error: error instanceof Error ? error.message : 'Could not create a pairing code.' });
    }
  };
  const unpairTV = async () => {
    try {
      await familyAgentClient.unpairTV();
      const demo = resetHouseholdSnapshot();
      householdRef.current = demo;
      setHousehold(demo);
      planner.reset();
      setTVPairing({ status: 'unpaired' });
      setRefreshVersion((value) => value + 1);
    } catch (error) {
      setTVPairing((current) => ({ ...current, error: error instanceof Error ? error.message : 'Could not unpair this TV.' }));
    }
  };
  const resetDemo = () => {
    void familyAgentClient.resetDemo().catch(() => undefined);
    setHousehold(resetHouseholdSnapshot());
    setActionHistory([]);
    planner.reset();
    setDemoVersion((value) => value + 1);
  };
  const props = {
    household,
    conflicts,
    now,
    calendarState,
    weatherState,
    briefing,
    agentStatus,
    actionHistory,
    tvPairing,
    onStartPairing: startTVPairing,
    onUnpairTV: () => { void unpairTV(); },
    focusActive: focusRegion === 'content' && !menuOpen && !overlayOpen,
    tvParentMode: tvElevated,
    onUnlockParentMode: unlockTVParentMode,
    onLockParentMode: lockTVParentMode,
    wallCalendar: {
      enabled: wallEnabled,
      idleSeconds: wallIdleSeconds,
      reminderMinutes,
      onToggle: toggleWall,
      onShowNow: () => {
        setMenuOpen(false);
        setWallMode(true);
      },
    },
    onNavigate: visit,
    onFocusNavigation: () => setFocusRegion('navigation'),
    initialEventId: calendarEventId,
    initialDay: calendarDay,
    onOpenEvent: (id: string) => {
      setCalendarEventId(id);
      setRoute('Calendar');
      setFocusRegion('content');
    },
    onCompleteChore: (id: string, completed: boolean) => {
      const chore = householdRef.current.chores.find((item) => item.id === id);
      const cheer = () => {
        if (completed && chore?.assignedToMemberId)
          setCelebration({ memberId: chore.assignedToMemberId, stars: chore.points ?? 1, detail: `${chore.title} is done.` });
      };
      if (!paired) {
        setHousehold((current) => setChoreCompleted(current, id, completed, now.toISOString()));
        cheer();
        return;
      }
      if (!chore) return;
      // Completing is a shared-screen action; undoing needs a parent (the server enforces both).
      void (completed ? serverEdit('completeChore', { id }) : serverEdit('chore', { ...chore, status: 'pending' })).then((ok) => {
        if (ok) cheer();
      });
    },
    onToggleRoutineStep: (routineId: string, stepId: string) =>
      setHousehold((current) => toggleRoutineStep(current, routineId, stepId)),
    onTogglePreparationItem: (eventId: string, itemId: string) => {
      if (paired) void serverEdit('prepToggle', { id: eventId, itemId });
      else setHousehold((current) => togglePreparationItem(current, eventId, itemId));
    },
    onRefreshData: () => setRefreshVersion((value) => value + 1),
    onProposeAction: async (conflictId: string, eventId: string, targetMemberId: string) => {
      if (paired) {
        // A paired household never falls back to a local-only change that the next sync would undo.
        try {
          const response = await familyAgentClient.proposeAction({ conflictId, eventId, targetMemberId });
          return { action: response.data, remote: true };
        } catch (error) {
          throw new Error(
            error instanceof FamilyAgentError && error.status === 403
              ? 'Unlock parent mode in Settings with the four-digit code to change pickups on the TV.'
              : 'The pickup suggestion could not be prepared. Refresh and try again.',
          );
        }
      }
      if (agentStatus === 'available') {
        try {
          const response = await familyAgentClient.proposeAction({ conflictId, eventId, targetMemberId });
          return { action: response.data, remote: true };
        } catch {
          // Local proposal keeps the family demo working if the service drops during review.
        }
      }
      const conflict = conflicts.find((item) => item.id === conflictId);
      const event = household.events.find((item) => item.id === eventId);
      const member = household.members.find((item) => item.id === targetMemberId);
      const action =
        conflict && event && member ? proposeReassignment(event, conflict, member, now.toISOString()) : undefined;
      if (!action) throw new Error('That pickup suggestion is no longer available.');
      return { action, remote: false };
    },
    onConfirmAction: async (action: ProposedAction, remote: boolean) => {
      if (remote && agentStatus === 'available') {
        try {
          const response = await familyAgentClient.confirmAction(action.id);
          briefingRequestId.current += 1;
          calendarRequestId.current += 1;
          const nextHousehold = {
            ...household,
            events: household.events.map((event) =>
              event.id === response.data.event.id
                ? { ...event, responsibleMemberId: response.data.event.responsibleMemberId }
                : event,
            ),
          };
          setHousehold(nextHousehold);
          setActionHistory((current) => [
            response.data.action,
            ...current.filter((item) => item.id !== response.data.action.id),
          ]);
          setBriefing(localBriefing(nextHousehold, detectConflicts(nextHousehold.members, nextHousehold.events, { now }), now));
          return;
        } catch (error) {
          if (paired) throw new Error(error instanceof Error ? error.message : 'The pickup change could not be saved.');
          // The explicit confirmation can still be applied to the local demo snapshot.
        }
      }
      const result = confirmReassignment(household, action, now.toISOString());
      briefingRequestId.current += 1;
      calendarRequestId.current += 1;
      setHousehold(result.household);
      setActionHistory((current) => [result.action, ...current.filter((item) => item.id !== result.action.id)]);
      setBriefing(localBriefing(result.household, detectConflicts(result.household.members, result.household.events, { now }), now));
    },
    onCancelAction: async (action: ProposedAction, remote: boolean) => {
      if (remote) await familyAgentClient.cancelAction(action.id).catch(() => undefined);
    },
  };
  const screen = () => {
    switch (route) {
      case 'Home':
        return <FamilyHomeScreen {...props} />;
      case 'Calendar':
        return <FamilyCalendarScreen {...props} />;
      case 'Chores':
        return <FamilyChoresScreen {...props} />;
      case 'Meals':
        return <FamilyMealsScreen {...props} planner={plannerView} />;
      case 'Lists':
        return <FamilyListsScreen {...props} planner={plannerView} />;
      case 'Photos':
        return <FamilyPhotosScreen {...props} />;
      case 'Family':
        return <FamilyMembersScreen {...props} />;
      case 'Settings':
        return <FamilySettingsScreen {...props} onResetDemo={resetDemo} />;
      case 'Approvals':
        return <FamilyApprovalsScreen {...props} />;
      case 'Move':
        return <FamilyMoveScreen {...props} />;
      case 'FamilyNight':
        return <FamilyNightTVScreen {...props} />;
    }
  };
  const navActive = focusRegion === 'navigation' && !menuOpen && !overlayOpen;
  const navButton = (tab: (typeof tabs)[number]) => (
    <DButton
      key={tab.route}
      label={`${tab.route}${route === tab.route ? ', current page' : ''}`}
      onPress={() => visit(tab.route)}
      selected={route === tab.route}
      active={navActive}
      defaultFocus={route === tab.route}
      radius={32}
      style={{
        width: tab.width,
        height: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: route === tab.route ? p.selected : 'transparent',
      }}>
      {tab.icon ? <DIcon name={tab.icon} color={route === tab.route ? p.onSelected : p.muted} /> : null}
      <DText size={26} weight={route === tab.route ? 700 : 600} color={route === tab.route ? p.onSelected : p.muted}>
        {tab.route}
      </DText>
    </DButton>
  );

  return (
    <View style={{ flex: 1, backgroundColor: p.background, overflow: 'hidden' }}>
      <View
        testID="design-canvas"
        style={{
          position: 'absolute',
          width: 1920,
          height: 1080,
          left: (width - 1920) / 2,
          top: (height - 1080) / 2,
          transform: [{ scale }],
          backgroundColor: p.background,
          paddingHorizontal: 96,
          paddingTop: 54,
          paddingBottom: 40,
        }}>
        {showWall ? (
          <FamilyWallScreen household={household} now={now} weatherState={weatherState} paired={paired} onExit={leaveWall} conflicts={conflicts} />
        ) : null}
        {showWall ? null : (
        <>
        <SpatialNavigationRoot
          key={`navigation-${route}`}
          isActive={navActive}
          onDirectionHandledWithoutMovement={(direction) =>
            setFocusRegion(focusRegionAfterDirection('navigation', String(direction)))
          }>
          <SpatialNavigationNode orientation="horizontal">
            <View testID="family-top-navigation" style={{ height: 80, marginBottom: 28 }}>
              <DButton
                label="Open Hometide menu"
                onPress={() => setMenuOpen(true)}
                active={navActive}
                radius={18}
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 0,
                  width: 64,
                  height: 64,
                  backgroundColor: '#1D2B36',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Image
                  source={require('../assets/images/hometide-mark.png')}
                  style={{ width: 46, height: 46 }}
                  accessibilityIgnoresInvertColors
                />
              </DButton>
              <DRow
                style={{
                  position: 'absolute',
                  left: 100,
                  top: 0,
                  height: 80,
                  padding: 8,
                  gap: 8,
                  borderRadius: 44,
                  backgroundColor: p.card,
                  shadowColor: p.ink,
                  shadowOpacity: p.dark ? 0 : 0.06,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                }}>
                {tabs.map(navButton)}
              </DRow>
              <View style={{ position: 'absolute', right: 0, height: 80, alignItems: 'flex-end', gap: 2 }}>
                <DText size={40} weight={700} heading>
                  {formatTime(now, household.family.timezone)}
                </DText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {weatherState.data ? (
                    <WeatherIcon condition={weatherState.data.condition} size={26} color={p.muted} />
                  ) : null}
                  <DText size={22} color={p.muted}>
                    {weatherState.data ? `${weatherState.data.temperatureF}°F` : 'Weather unavailable'}
                  </DText>
                </View>
              </View>
            </View>
          </SpatialNavigationNode>
        </SpatialNavigationRoot>
        <SpatialNavigationRoot
          isActive={props.focusActive}
          onDirectionHandledWithoutMovement={(direction) =>
            setFocusRegion(focusRegionAfterDirection('content', String(direction)))
          }>
          <PageBackContext.Provider value={pageBack}>
            <View key={`${route}-${voiceVisit}`} style={{ flex: 1, minHeight: 0 }}>
              {screen()}
            </View>
          </PageBackContext.Provider>
        </SpatialNavigationRoot>
        </>
        )}
        {toast ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ position: 'absolute', zIndex: 70, bottom: 48, left: 480, right: 480, padding: 22, borderRadius: 24, backgroundColor: p.selected, alignItems: 'center' }}>
            <DText size={26} weight={700} color={p.onSelected}>{toast}</DText>
          </View>
        ) : null}
        {reminder ? <ReminderToast reminder={reminder} timezone={household.family.timezone} /> : null}
        {celebration ? (
          <StarCelebration
            member={household.members.find((member) => member.id === celebration.memberId)}
            stars={celebration.stars}
            detail={celebration.detail}
            onDone={() => setCelebration(null)}
          />
        ) : null}
        {pendingProposal ? (
          <ProposalOverlay
            key={pendingProposal.id}
            proposal={pendingProposal}
            onDismiss={() => setDismissedProposals((ids) => [...ids, pendingProposal.id])}
            onDone={(message) => {
              setDismissedProposals((ids) => [...ids, pendingProposal.id]);
              setToast(message);
              void familyAgentClient.getHousehold().then((response) => applyServerHousehold(response.data)).catch(() => undefined);
            }}
          />
        ) : null}
        {activeApproval ? (
          <ApprovalOverlay
            key={activeApproval.id}
            household={household}
            approval={activeApproval}
            onDismiss={() => setApprovalQueue((queue) => queue.filter((id) => id !== activeApproval.id))}
            onDone={(message, celebrate) => {
              setApprovalQueue((queue) => queue.filter((id) => id !== activeApproval.id));
              setToast(message);
              if (celebrate) setCelebration(celebrate);
              void familyAgentClient.getHousehold().then((response) => applyServerHousehold(response.data)).catch(() => undefined);
            }}
          />
        ) : null}
        {menuOpen ? (
          <View
            style={{
              position: 'absolute',
              left: 96,
              top: 150,
              width: 380,
              padding: 20,
              gap: 8,
              borderRadius: 24,
              backgroundColor: p.card,
              borderWidth: 2,
              borderColor: p.border,
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 6 },
              zIndex: 20,
            }}>
            <SpatialNavigationRoot isActive>
              {[...tabs.map((tab) => tab.route), 'Family' as const, 'Approvals' as const, 'Move' as const, 'FamilyNight' as const].map((item, index) => {
                const text =
                  item === 'FamilyNight' ? 'Family night' : item === 'Move' ? 'Movement break'
                    : item === 'Approvals' && waitingApprovals ? `Approvals (${waitingApprovals})` : item;
                return (
                  <DButton
                    key={item}
                    label={text}
                    onPress={() => visit(item)}
                    defaultFocus={index === 0}
                    style={{ height: 50, justifyContent: 'center', paddingHorizontal: 20 }}>
                    <DText size={24}>{text}</DText>
                  </DButton>
                );
              })}
              <DButton
                label="Wall calendar"
                onPress={() => {
                  setMenuOpen(false);
                  setWallMode(true);
                }}
                style={{ height: 50, justifyContent: 'center', paddingHorizontal: 20 }}>
                <DText size={24}>Wall calendar</DText>
              </DButton>
              <DButton
                label="Close menu"
                onPress={() => setMenuOpen(false)}
                style={{ height: 58, justifyContent: 'center', paddingHorizontal: 20 }}>
                <DText size={24} color={p.muted}>
                  Close menu
                </DText>
              </DButton>
            </SpatialNavigationRoot>
          </View>
        ) : null}
      </View>
    </View>
  );
}
