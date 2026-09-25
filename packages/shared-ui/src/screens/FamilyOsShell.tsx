import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { SpatialNavigationNode, SpatialNavigationRoot } from 'react-tv-space-navigation';
import {
  createDemoClock,
  createDemoCalendarProvider,
  createDemoWeatherProvider,
  createDeterministicBriefing,
  confirmReassignment,
  detectConflicts,
  HouseholdSnapshot,
  loadCalendarData,
  loadWeatherData,
  FamilyBriefing,
  ProviderState,
  ProposedAction,
  proposeReassignment,
  setChoreCompleted,
  togglePreparationItem,
  toggleRoutineStep,
  WeatherForecast,
} from '@familyos/domain';
import { FamilyThemeProvider } from '../theme';
import { DButton, DIcon, DRow, DText, IconName, formatTime, useDesignPalette } from '../design/DesignSystem';
import { WeatherIcon } from '../design/WeatherIcon';
import { createFamilyAgentContext, familyAgentClient } from '../api/familyAgentClient';
import { useBackToHome } from '../hooks/useBackToHome';
import { PageBackContext } from '../hooks/usePageBack';
import FamilyHomeScreen from './FamilyHomeScreen';
import FamilyCalendarScreen from './FamilyCalendarScreen';
import FamilyChoresScreen from './FamilyChoresScreen';
import FamilyMembersScreen from './FamilyMembersScreen';
import FamilySettingsScreen from './FamilySettingsScreen';
import { FamilyMealsScreen, FamilyListsScreen, FamilyPhotosScreen } from './FamilyPlannerScreens';
import { FamilyRoute, focusRegionAfterDirection } from '../navigation/familyNavigation';
import { loadHouseholdSnapshot, resetHouseholdSnapshot, saveHouseholdSnapshot } from './householdStorage';
import { usePlannerData } from './plannerData';

const tabs: { route: FamilyRoute; icon?: IconName; width: number }[] = [
  { route: 'Home', icon: 'home', width: 167 },
  { route: 'Calendar', icon: 'calendar', width: 204 },
  { route: 'Chores', icon: 'chores', width: 180 },
  { route: 'Meals', icon: 'meals', width: 164 },
  { route: 'Lists', icon: 'lists', width: 151 },
  { route: 'Photos', icon: 'photos', width: 179 },
  { route: 'Settings', width: 160 },
];

export default function FamilyOsShell() {
  return (
    <FamilyThemeProvider>
      <FamilyOsShellContent />
    </FamilyThemeProvider>
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
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [household, setHousehold] = useState<HouseholdSnapshot>(loadHouseholdSnapshot);
  const [calendarState, setCalendarState] = useState<ProviderState<HouseholdSnapshot['events']>>({ status: 'loading' });
  const [weatherState, setWeatherState] = useState<ProviderState<WeatherForecast>>({ status: 'loading' });
  const clock = useMemo(() => createDemoClock(), [demoVersion]);
  const now = useMemo(() => clock.now(), [clock]);
  const conflicts = useMemo(() => detectConflicts(household.members, household.events, { now }), [household, now]);
  const [briefing, setBriefing] = useState<FamilyBriefing>(() =>
    createDeterministicBriefing(
      household.members,
      household.events,
      household.chores,
      conflicts,
      now,
      household.family.timezone,
    ),
  );
  const [agentStatus, setAgentStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [actionHistory, setActionHistory] = useState<ProposedAction[]>([]);
  const planner = usePlannerData();
  const briefingInputRef = useRef({ household, conflicts, now });
  briefingInputRef.current = { household, conflicts, now };
  const briefingRequestId = useRef(0);
  const p = useDesignPalette();

  useEffect(() => saveHouseholdSnapshot(household), [household]);
  useEffect(() => {
    let active = true;
    const requestId = ++briefingRequestId.current;
    setCalendarState({ status: 'loading' });
    setWeatherState({ status: 'loading' });
    void loadCalendarData(createDemoCalendarProvider(household), household.events).then((result) => {
      if (!active || requestId !== briefingRequestId.current) return;
      setCalendarState(result);
      if (result.data) setHousehold((current) => ({ ...current, events: result.data! }));
    });
    void loadWeatherData(createDemoWeatherProvider(), 'Tucson, AZ', now.toISOString()).then((result) => {
      if (active) setWeatherState(result);
    });
    return () => {
      active = false;
    };
  }, [demoVersion, refreshVersion]);

  useEffect(() => {
    let active = true;
    const requestId = ++briefingRequestId.current;
    const input = briefingInputRef.current;
    const fallback = createDeterministicBriefing(
      input.household.members,
      input.household.events,
      input.household.chores,
      input.conflicts,
      input.now,
      input.household.family.timezone,
    );
    setBriefing(fallback);
    setAgentStatus('checking');
    void Promise.all([
      familyAgentClient.getHealth(),
      familyAgentClient.createBriefing(createFamilyAgentContext(input.household, input.conflicts, input.now)),
    ])
      .then(([, response]) => {
        if (!active || requestId !== briefingRequestId.current) return;
        setBriefing(response.data);
        setAgentStatus('available');
      })
      .catch(() => {
        if (!active || requestId !== briefingRequestId.current) return;
        setBriefing(fallback);
        setAgentStatus('offline');
      });
    void familyAgentClient
      .getActionHistory()
      .then((response) => {
        if (active) setActionHistory(response.data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [demoVersion, refreshVersion]);

  const pageBack = useRef<(() => void) | null>(null);
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
    setFocusRegion(next === 'Photos' ? 'navigation' : 'content');
    setMenuOpen(false);
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
    focusActive: focusRegion === 'content' && !menuOpen,
    onNavigate: visit,
    onFocusNavigation: () => setFocusRegion('navigation'),
    initialEventId: calendarEventId,
    onOpenEvent: (id: string) => {
      setCalendarEventId(id);
      setRoute('Calendar');
      setFocusRegion('content');
    },
    onCompleteChore: (id: string, completed: boolean) =>
      setHousehold((current) => setChoreCompleted(current, id, completed, now.toISOString())),
    onToggleRoutineStep: (routineId: string, stepId: string) =>
      setHousehold((current) => toggleRoutineStep(current, routineId, stepId)),
    onTogglePreparationItem: (eventId: string, itemId: string) =>
      setHousehold((current) => togglePreparationItem(current, eventId, itemId)),
    onRefreshData: () => setRefreshVersion((value) => value + 1),
    onProposeAction: async (conflictId: string, eventId: string, targetMemberId: string) => {
      if (agentStatus !== 'offline') {
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
      if (remote && agentStatus !== 'offline') {
        try {
          const response = await familyAgentClient.confirmAction(action.id);
          briefingRequestId.current += 1;
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
          setBriefing(
            createDeterministicBriefing(
              nextHousehold.members,
              nextHousehold.events,
              nextHousehold.chores,
              detectConflicts(nextHousehold.members, nextHousehold.events, { now }),
              now,
              nextHousehold.family.timezone,
            ),
          );
          return;
        } catch {
          // The explicit confirmation can still be applied to the local demo snapshot.
        }
      }
      const result = confirmReassignment(household, action, now.toISOString());
      briefingRequestId.current += 1;
      setHousehold(result.household);
      setActionHistory((current) => [result.action, ...current.filter((item) => item.id !== result.action.id)]);
      setBriefing(
        createDeterministicBriefing(
          result.household.members,
          result.household.events,
          result.household.chores,
          detectConflicts(result.household.members, result.household.events, { now }),
          now,
          result.household.family.timezone,
        ),
      );
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
        return <FamilyMealsScreen {...props} planner={planner} />;
      case 'Lists':
        return <FamilyListsScreen {...props} planner={planner} />;
      case 'Photos':
        return <FamilyPhotosScreen {...props} />;
      case 'Family':
        return <FamilyMembersScreen {...props} />;
      case 'Settings':
        return <FamilySettingsScreen {...props} onResetDemo={resetDemo} />;
    }
  };
  const navActive = focusRegion === 'navigation' && !menuOpen;
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
        <SpatialNavigationRoot
          key={`navigation-${route}`}
          isActive={navActive}
          onDirectionHandledWithoutMovement={(direction) =>
            setFocusRegion(focusRegionAfterDirection('navigation', String(direction)))
          }>
          <SpatialNavigationNode orientation="horizontal">
            <View testID="family-top-navigation" style={{ height: 80, marginBottom: 28 }}>
              <DButton
                label="Open FamilyOS menu"
                onPress={() => setMenuOpen(true)}
                active={navActive}
                radius={18}
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 0,
                  width: 64,
                  height: 64,
                  backgroundColor: '#F2B25C',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <DText heading size={34} weight={800} color="#1A1714">
                  f
                </DText>
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
            <View key={route} style={{ flex: 1, minHeight: 0 }}>
              {screen()}
            </View>
          </PageBackContext.Provider>
        </SpatialNavigationRoot>
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
              {[...tabs.map((tab) => tab.route), 'Family' as const].map((item, index) => (
                <DButton
                  key={item}
                  label={item}
                  onPress={() => visit(item)}
                  defaultFocus={index === 0}
                  style={{ height: 58, justifyContent: 'center', paddingHorizontal: 20 }}>
                  <DText size={26}>{item}</DText>
                </DButton>
              ))}
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
