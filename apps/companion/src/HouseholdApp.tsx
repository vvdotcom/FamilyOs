import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  Switch,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import {
  APIRequestError,
  dateKey,
  eventsForDay,
  groceryPlan,
  nextFamilyNight,
  starBalance,
  weekDays,
  type Appearance,
  type Edit,
  type Household,
  type HouseholdAPI,
  type ListItem,
  type PairedTV,
  type ParentAccount,
} from './household';
import { EditorForm, type Editor } from './Editors';
import { MIC_RAISE, MicButton, VoicePanel, useVoiceCommand } from './VoiceCommand';
import { CalendarsScreen, PROVIDER_NAMES, SyncedEventSheet } from './CalendarsScreen';
import {
  ApprovalsScreen,
  ChorePhotoScreen,
  CodeInput,
  FamilyNightScreen,
  ImportsScreen,
  MoveScreen,
  PhotosScreen,
  SportsScreen,
  StarsBar,
  VoiceScreen,
  type ScreenContext,
} from './FamilyScreens';
import {
  Button,
  Card,
  Copy,
  Heading,
  Icon,
  Input,
  Label,
  ThemeContext,
  themes,
  memberTint,
  useTheme,
  layout as s,
  NavRow,
  Segmented,
  type IconName,
} from './ui';
import { StarCelebration } from './Pickers';
import { takePairCode } from './pairLink';
import { SecureStore } from './storage';
import { detectPlace, searchPlace, type WeatherPlace } from './location';

type Page =
  | 'today'
  | 'calendar'
  | 'calendars'
  | 'lists'
  | 'remote'
  | 'settings'
  | 'chores'
  | 'members'
  | 'meal'
  | 'grocery'
  | 'photos'
  | 'more'
  | 'recipes'
  | 'imports'
  | 'rewards'
  | 'approvals'
  | 'chorePhoto'
  | 'sports'
  | 'familyNight'
  | 'move'
  | 'voice';
const SOURCE_LABELS: Record<string, string> = {
  all: 'Anywhere', synced: 'Connected calendars', manual: 'This app', import: 'Imports', voice: 'Voice',
};
const fromSource = (event: { source: string; calendarId?: string | null }, filter: string) =>
  filter === 'all' || (filter === 'synced' ? !!event.calendarId : event.source === filter);
type Props = {
  api: HouseholdAPI;
  account: ParentAccount;
  dark: boolean;
  appearance: Appearance;
  onAppearance: (value: Appearance) => Promise<void>;
  onSignOut: () => void;
  onServerSettings: () => void;
  /** Re-checks the account password; returns a fresh Cognito ID token on hosted servers. */
  onReauthenticate?: (password: string) => Promise<string | undefined>;
  /** Permanently deletes the account and household after checking the password. */
  onDeleteAccount?: (password: string) => Promise<void>;
  preview?: boolean;
};
export default function HouseholdApp(props: Props) {
  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={themes[props.dark ? 'dark' : 'light']}>
        <HouseholdScreens {...props} />
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

function HouseholdScreens({
  api,
  account,
  dark,
  appearance,
  onAppearance,
  onSignOut,
  onServerSettings,
  onReauthenticate,
  onDeleteAccount,
  preview = false,
}: Props) {
  const t = useTheme();
  const [deletePassword, setDeletePassword] = useState('');
  const insets = useSafeAreaInsets();
  // A browser window wide enough for a sidebar gets the desktop layout; phones keep the bottom tabs.
  const { width: windowWidth } = useWindowDimensions();
  const wide = Platform.OS === 'web' && windowWidth >= 900;
  const dialog = wide ? ({ width: '100%', maxWidth: 520, alignSelf: 'center' } as const) : null;
  const [page, setPage] = useState<Page>('today');
  const [tabBarHeight, setTabBarHeight] = useState(90);
  const [accessMode, setAccessMode] = useState<'parent' | 'child'>('parent');
  const [elevated, setElevated] = useState(false);
  const [chorePhotoId, setChorePhotoId] = useState<string | null>(null);
  const [groceryReview, setGroceryReview] = useState<string | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [adjustMember, setAdjustMember] = useState('');
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustCode, setAdjustCode] = useState('');
  const [goalRewardId, setGoalRewardId] = useState('');
  const [addSheet, setAddSheet] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [listEditing, setListEditing] = useState(false);
  const [childPicker, setChildPicker] = useState(false);
  const [rewardsView, setRewardsView] = useState<'kids' | 'parent'>('kids');
  const [celebration, setCelebration] = useState<{ message: string; detail?: string } | null>(null);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [activeChildName, setActiveChildName] = useState('');
  const [data, setData] = useState<Household | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [calendarMode, setCalendarMode] = useState<'day' | 'week' | 'month'>('week');
  const [memberFilter, setMemberFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const editRevision = useRef(0);
  const [confirm, setConfirm] = useState<{ title: string; action: () => Promise<void>; detail?: string; actionLabel?: string } | null>(null);
  const [list, setList] = useState('Groceries');
  const [newItem, setNewItem] = useState('');
  const [listPrompt, setListPrompt] = useState(false);
  const [listDraft, setListDraft] = useState('');
  const [recipeName, setRecipeName] = useState('');
  const [aiRecipePrompt, setAiRecipePrompt] = useState('');
  const [aiRecipeGroceries, setAiRecipeGroceries] = useState(true);
  const [aiRecipeBusy, setAiRecipeBusy] = useState(false);
  const [recipeIngredients, setRecipeIngredients] = useState('');
  const [recipeInstructions, setRecipeInstructions] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [parentCode, setParentCode] = useState('');
  const [oldParentCode, setOldParentCode] = useState('');
  const [newParentCode, setNewParentCode] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [rewardStars, setRewardStars] = useState('10');
  const [parentModeCode, setParentModeCode] = useState('');
  const [pairedTVs, setPairedTVs] = useState<PairedTV[]>([]);
  const [codeConfigured, setCodeConfigured] = useState<boolean | null>(null);
  const [setupHidden, setSetupHidden] = useState(true);
  const setupKey = `familyos.setup-hidden.${account.accountId.replace(/[^A-Za-z0-9._-]/g, '')}`;
  const [pairPrompt, setPairPrompt] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [pairError, setPairError] = useState('');
  const [pairBusy, setPairBusy] = useState(false);
  const [unpairPrompt, setUnpairPrompt] = useState<PairedTV | null>(null);
  useEffect(() => {
    // Arrived from the TV's QR code: open "Connect your TV" with the code filled in.
    if (preview || accessMode !== 'parent' || !api.approveTV) return;
    const code = takePairCode();
    if (code) {
      setPairCode(code);
      setPairError('');
      setPairPrompt(true);
    }
  }, [api, preview, accessMode]);
  const generation = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  const refresh = useCallback(
    async (showLoading = false) => {
      if (writing.current) return;
      const request = ++generation.current;
      if (showLoading) setLoading(true);
      try {
        const result = await api.household();
        if (alive.current && request === generation.current) {
          setData({
            ...result,
            revision: result.revision || 0,
            listItems: result.listItems || [],
            meals: result.meals || [],
            recipes: result.recipes || [],
            lists: result.lists || [],
            importDrafts: result.importDrafts || [],
          });
          setLastSync(new Date());
          setError('');
        }
      } catch (e) {
        if (e instanceof APIRequestError && e.status === 401 && api.accessContext) {
          void api.accessContext().then((context) => {
            if (!alive.current || context.accessMode === null) return;
            setAccessMode(context.accessMode); setActiveChildId(context.memberId); setActiveChildName(context.memberName || '');
            setElevated(Boolean(context.elevated));
          }).catch(() => undefined);
        }
        if (alive.current && request === generation.current)
          setError(e instanceof Error ? e.message : 'Could not refresh your household.');
      } finally {
        if (alive.current && request === generation.current) setLoading(false);
      }
    },
    [api],
  );
  useEffect(() => {
    void refresh(true);
  }, [refresh]);
  const recheckAccess = useCallback(async () => {
    if (!api.accessContext) return;
    try {
      const context = await api.accessContext();
      if (!alive.current) return;
      if (context.accessMode === 'child') {
        setAccessMode('child'); setActiveChildId(context.memberId); setActiveChildName(context.memberName || 'Child');
        setElevated(false);
      } else if (context.accessMode === 'parent') {
        setAccessMode('parent'); setActiveChildId(null); setActiveChildName('');
        setElevated(Boolean(context.elevated));
      }
    } catch {
      /* Keep the current view; the next refresh reports connection problems. */
    }
  }, [api]);
  useEffect(() => {
    void recheckAccess();
  }, [recheckAccess]);
  useEffect(() => {
    if (!preview && api.pairedTVs) void api.pairedTVs().then(setPairedTVs).catch(() => undefined);
  }, [api, preview]);
  /** A 401 after a parent unlock means it expired: return to the child view the phone started in. */
  const handleAuthError = (e: unknown) => {
    if (e instanceof APIRequestError && e.status === 401 && elevated) {
      void recheckAccess().then(() => {
        setNotice('Parent access ended after 15 minutes of inactivity. Back to the child view.');
        void refresh(true);
      });
      return true;
    }
    return false;
  };
  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === 'active' && !editor) void refresh();
    }, 20000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !editor) void refresh();
    });
    return () => {
      clearInterval(interval);
      listener.remove();
    };
  }, [refresh, editor]);
  // A spoken change becomes a request: refresh so the Approvals badge shows it.
  const onVoiceAnswered = useCallback((proposed: boolean) => { if (proposed) void refresh(); }, [refresh]);
  const voice = useVoiceCommand({ api, preview, onAnswered: onVoiceAnswered });
  const navigate = (next: Page) => {
    setPage(next);
    setNotice('');
    if (voice.phase !== 'listening') voice.close();
    if (next === 'remote' && api.pairedTVs) {
      void api
        .pairedTVs()
        .then(setPairedTVs)
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Could not load connected TVs.');
        });
    }
  };
  const submitPairing = async () => {
    if (!/^\d{6}$/.test(pairCode) || !api.approveTV) return;
    setPairBusy(true);
    setPairError('');
    try {
      await api.approveTV(pairCode);
      const devices = (await api.pairedTVs?.()) || [];
      setPairedTVs(devices);
      setPairPrompt(false);
      setPairCode('');
      setNotice('TV connected to your household. Calendar, chores, lists, and meals will refresh on the TV.');
    } catch (e) {
      setPairError(e instanceof Error ? e.message : 'Could not connect that TV. Check its code and try again.');
    } finally {
      setPairBusy(false);
    }
  };
  const revokeTV = async () => {
    const selected = unpairPrompt;
    if (!selected || !api.unpairTV) return;
    setPairBusy(true);
    setPairError('');
    try {
      await api.unpairTV(selected.deviceId);
      setPairedTVs((devices) => devices.filter((device) => device.deviceId !== selected.deviceId));
      setUnpairPrompt(null);
      setNotice(`${selected.deviceName} was unpaired. Its next sync request will be rejected.`);
    } catch (e) {
      setPairError(e instanceof Error ? e.message : 'Could not unpair this TV.');
    } finally {
      setPairBusy(false);
    }
  };
  const openEditor = (next: Editor) => {
    if (!data || accessMode === 'child') return;
    editRevision.current = data.revision;
    setError('');
    setEditor(next);
  };
  const mutate = async (kind: Edit['kind'], value: object, revision = data?.revision) => {
    if (!data || revision === undefined || writing.current) return false;
    if (accessMode === 'child' && !['completeChore', 'familyNightSuggest', 'familyNightVote'].includes(kind)) {
      setError('Child mode can only complete assigned chores, vote, or request rewards.');
      return false;
    }
    writing.current = true;
    generation.current++;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.editHousehold({ kind, value, expectedRevision: revision });
      if (alive.current) {
        setData(result);
        setLastSync(new Date());
        setNotice('Saved to your household.');
      }
      return true;
    } catch (e) {
      if (alive.current && !handleAuthError(e)) setError(e instanceof Error ? e.message : 'Could not save. Your edit has not been confirmed.');
      return false;
    } finally {
      writing.current = false;
      if (alive.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  };
  /** Server calls outside the generic edit route (photos, approvals, voice). */
  const run = async <T,>(work: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await work();
      if (alive.current && success) setNotice(success);
      return result;
    } catch (e) {
      if (alive.current && !handleAuthError(e)) setError(e instanceof Error ? e.message : 'That did not work. Please try again.');
      return undefined;
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const replace = (household: Household) => {
    setData(household);
    setLastSync(new Date());
  };
  // When the TV's wall calendar starts and how early it reminds the family (asked for by families, 2026-10-15).
  const saveTVSettings = async (change: { wallIdleMinutes?: number; reminderMinutes?: number }) => {
    if (await mutate('tvSettings', { id: 'tv', ...change })) setNotice('Saved. Your TV updates within a few seconds.');
  };
  const savePlace = async (find: () => Promise<WeatherPlace>) => {
    const place = await run(find);
    if (!place) return;
    if (await mutate('householdLocation', { id: 'location', ...place })) {
      setPlaceQuery('');
      setNotice(`Weather set to ${place.label}. The TV updates within a few seconds.`);
    }
  };
  const lockParent = async () => {
    const locked = await run(() => api.lockParentMode?.() ?? Promise.resolve(false));
    if (locked) {
      await recheckAccess();
      setNotice('Locked. Back to the child view.');
      navigate('today');
      await refresh(true);
    }
  };
  const days = weekDays(selectedDate);
  const monthFirst = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12);
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1 - monthFirst.getDay(), 12);
  const monthGrid = Array.from({ length: 42 }, (_, index) => new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() + index, 12));
  const events = data ? eventsForDay(data.events, selectedDate) : [];
  const calendarEvents = data
    ? events.filter((event) =>
        (memberFilter === 'all' || event.memberIds.includes(memberFilter)) && fromSource(event, sourceFilter))
    : [];
  const eventRows = data
    ? (page === 'calendar' ? calendarEvents : events).map((event) => {
        const index =
          event.memberIds.length === data.members.length && data.members.length > 1
            ? 4
            : Math.max(0, data.members.findIndex((m) => m.id === event.ownerMemberId));
        const tint = memberTint(index, dark);
        const names = event.memberIds
          .map((id) => data.members.find((m) => m.id === id)?.name)
          .filter(Boolean)
          .join(', ');
        return (
          <View key={event.id} style={[s.row, { alignItems: 'stretch' }]}>
            <Copy size={14} weight={700} color={t.muted} style={{ width: 66, paddingTop: 12 }}>
              {event.allDay
                ? 'All day'
                : new Date(event.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </Copy>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={event.calendarId ? `${event.title}, from ${PROVIDER_NAMES[(data.calendars || []).find((c) => c.id === event.calendarId)?.provider || 'ics']}` : `Edit ${event.title}`}
              disabled={accessMode === 'child'}
              onPress={() => { if (accessMode === 'parent') openEditor({ kind: 'event', item: event }); }}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 16,
                backgroundColor: tint.backgroundColor,
                gap: 2,
              }}
            >
              <Copy size={17} weight={700} color={tint.color}>
                {event.title}
              </Copy>
              <Copy size={13} color={tint.color}>
                {names}
                {event.location ? ` · ${event.location}` : ''}
                {event.responsibleMemberId
                  ? ` · ${data.members.find((m) => m.id === event.responsibleMemberId)?.name} ${event.responsibilityType === 'drive' ? 'drives' : 'picks up'}`
                  : ''}
                {event.calendarId ? ` · ${PROVIDER_NAMES[(data.calendars || []).find((c) => c.id === event.calendarId)?.provider || 'ics'].replace(' Calendar', '')}` : ''}
              </Copy>
            </Pressable>
          </View>
        );
      })
    : [];
  const meals = data?.meals.filter((m) => m.date === dateKey(selectedDate)) || [];
  const visibleChores = data?.chores.filter((chore) => accessMode === 'parent' || chore.assignedToMemberId === activeChildId) || [];
  const meal = meals.find((m) => m.category === 'Dinner') || meals[0];
  const listNames = Array.from(
    new Set(['Groceries', 'Weekend', 'Camping', ...(data?.lists?.map((item) => item.name) || []), ...(data?.listItems.map((i) => i.listName) || [])]),
  );
  const items = (data?.listItems.filter((i) => i.listName === list) || []).sort(
    (a, b) => Number(a.completed) - Number(b.completed),
  );
  const groceries = data?.listItems.filter((i) => i.listName === 'Groceries') || [];
  const greeting =
    new Date().getHours() < 12 ? 'GOOD MORNING' : new Date().getHours() < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  const weekStrip = (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {days.map((day) => {
        const active = dateKey(day) === dateKey(selectedDate);
        return (
          <Pressable
            key={dateKey(day)}
            accessibilityRole="button"
            accessibilityLabel={day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            accessibilityState={{ selected: active }}
            aria-selected={active}
            onPress={() => setSelectedDate(day)}
            style={{
              flex: 1,
              minHeight: 60,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              backgroundColor: active ? t.primary : 'transparent',
            }}
          >
            <Copy size={12} weight={700} color={active ? t.primaryInk : t.muted}>
              {day.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}
            </Copy>
            <Copy size={18} weight={active ? 800 : 700} color={active ? t.primaryInk : t.ink}>
              {day.getDate()}
            </Copy>
          </Pressable>
        );
      })}
    </View>
  );
  const back = (target: Page, label: string) => (
    <Pressable
      onPress={() => navigate(target)}
      accessibilityRole="button"
      style={[s.row, { minHeight: 44, alignSelf: 'flex-start', gap: 4 }]}
    >
      <Icon name="left" color={t.muted} />
      <Copy weight={700} color={t.muted}>
        {label}
      </Copy>
    </Pressable>
  );
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(setupKey).then((value) => active && setSetupHidden(value === 'yes')).catch(() => active && setSetupHidden(false));
    return () => { active = false; };
  }, [setupKey]);
  useEffect(() => {
    if (page !== 'today' || accessMode !== 'parent' || !api.accessCodeConfigured) return;
    let active = true;
    void api.accessCodeConfigured().then((value) => active && setCodeConfigured(value)).catch(() => undefined);
    return () => { active = false; };
  }, [page, accessMode, api]);
  const hideSetup = () => {
    setSetupHidden(true);
    void SecureStore.setItemAsync(setupKey, 'yes').catch(() => undefined);
  };
  const setupSteps: { id: string; title: string; subtitle: string; done: boolean; open: () => void }[] =
    data && accessMode === 'parent'
      ? [
          { id: 'calendars', title: 'Connect your calendars', subtitle: 'Google, iCloud, or Outlook, kept in sync', done: !!data.calendars?.length, open: () => navigate('calendars') },
          { id: 'kids', title: 'Add your kids', subtitle: 'Their chores, stars, and their own view', done: data.members.some((m) => m.role === 'child'), open: () => navigate('members') },
          { id: 'code', title: 'Set a parent code', subtitle: 'Four digits for approvals on the TV', done: codeConfigured === true, open: () => { setRewardsView('parent'); navigate('rewards'); } },
          { id: 'tv', title: 'Pair your Fire TV', subtitle: 'Show the code on the TV, enter it here', done: pairedTVs.length > 0, open: () => navigate('remote') },
          { id: 'weather', title: 'Show weather on the TV', subtitle: 'Set your household’s location once', done: !!data.location, open: () => navigate('settings') },
        ]
      : [];
  const setupDone = setupSteps.filter((step) => step.done).length;
  const showSetup = !preview && !setupHidden && setupSteps.length > 0 && setupDone < setupSteps.length;
  const setupCard = showSetup ? (
    <Card style={{ padding: 16, gap: 10 }}>
      <View style={s.spread}>
        <View style={s.grow}>
          <Label>SWITCH FROM A WALL CALENDAR</Label>
          <Copy size={17} weight={800}>Set up Hometide in 5 minutes</Copy>
        </View>
        <Copy size={13} weight={700} color={t.muted}>{setupDone} of {setupSteps.length}</Copy>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.soft }} accessibilityLabel={`${setupDone} of ${setupSteps.length} steps done`}>
        <View style={{ width: `${(setupDone / setupSteps.length) * 100}%`, height: 6, borderRadius: 3, backgroundColor: t.ok }} />
      </View>
      {setupSteps.map((step, index) => (
        <Pressable key={step.id} accessibilityRole="button" accessibilityLabel={`${step.title}${step.done ? ', done' : ''}`}
          accessibilityState={{ disabled: step.done }} disabled={step.done} onPress={step.open}
          style={[s.row, { minHeight: 48, gap: 12 }]}>
          <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
            backgroundColor: step.done ? t.okBg : 'transparent', borderWidth: step.done ? 0 : 2, borderColor: t.checkBorder }}>
            {step.done ? <Icon name="check" size={16} color={t.ok} /> : <Copy size={12} weight={800} color={t.muted}>{index + 1}</Copy>}
          </View>
          <View style={s.grow}>
            <Copy weight={700} color={step.done ? t.muted : t.ink} style={step.done ? { textDecorationLine: 'line-through' } : undefined}>{step.title}</Copy>
            {step.done ? null : <Copy size={12} color={t.muted}>{step.subtitle}</Copy>}
          </View>
          {step.done ? null : <Icon name="right" size={16} color={t.muted} />}
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={hideSetup} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
        <Copy size={13} weight={700} color={t.muted}>Hide this checklist</Copy>
      </Pressable>
    </Card>
  ) : null;
  const tvCard = (
    <Pressable accessibilityRole="button" onPress={() => navigate('remote')}>
      <Card style={[s.row, { paddingVertical: 12, paddingHorizontal: 14 }]}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: t.soft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="tv" size={22} color={t.muted} />
        </View>
        <View style={s.grow}>
          <Copy size={15} weight={700}>
            Connect your family TV
          </Copy>
          <Copy size={13} weight={500} color={t.muted}>
            Show the code on your TV, then enter it here
          </Copy>
        </View>
        <Icon name="right" size={20} color={t.muted} />
      </Card>
    </Pressable>
  );
  const addItem = async () => {
    if (!newItem.trim() || busy) return;
    const saved = await mutate('listItem', {
      id: randomUUID(),
      title: newItem.trim(),
      listName: list,
      category: 'Other',
      completed: false,
      addedBy: account.parentName,
    });
    if (saved) setNewItem('');
  };
  const saveRecipe = async () => {
    if (!recipeName.trim()) return setError('Add a recipe name first.');
    const saved = await mutate('recipe', {
      id: randomUUID(), name: recipeName.trim(),
      ingredients: recipeIngredients.split('\n').map((name) => name.trim()).filter(Boolean).map((name) => ({ name })),
      instructions: recipeInstructions.split('\n').map((line) => line.trim()).filter(Boolean),
      servings: 4, source: 'family',
    });
    if (saved) {
      setRecipeName('');
      setRecipeIngredients('');
      setRecipeInstructions('');
    }
  };
  const createAIRecipe = async () => {
    const description = aiRecipePrompt.trim();
    if (!api.generateRecipe || description.length < 3 || aiRecipeBusy) return;
    const day = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
    setAiRecipeBusy(true);
    const result = await run(() => api.generateRecipe!({
      description, date: dateKey(selectedDate), category: 'Dinner', groceries: aiRecipeGroceries,
    }));
    if (alive.current) setAiRecipeBusy(false);
    if (!result || !alive.current) return;
    replace(result.household);
    setAiRecipePrompt('');
    setNotice(
      `${result.recipe.name} is ${day}’s dinner and saved to Recipes` +
        (aiRecipeGroceries ? '. Its ingredients are on Groceries.' : '.') +
        (result.provider === 'cookbook' ? ' AI was unavailable, so this one came from Hometide’s built-in recipes.' : ''),
    );
  };
  const scheduleRecipe = async (recipe: NonNullable<Household['recipes']>[number]) => {
    await mutate('meal', {
      id: randomUUID(), title: recipe.name, date: dateKey(selectedDate), category: 'Dinner',
      cookIds: [], servings: recipe.servings, minutes: 30, recipeId: recipe.id,
      ingredients: recipe.ingredients.map((item) => item.name), instructions: recipe.instructions,
    });
    navigate('meal');
  };
  const saveParentCode = async () => {
    if (!/^\d{4}$/.test(parentCode) || !api.setParentAccessCode) return setError('Enter exactly four digits.');
    try {
      await api.setParentAccessCode(parentCode);
      setParentCode('');
      setNotice('Parent approval code saved securely on the server.');
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the parent code.'); }
  };
  const changeParentCode = async () => {
    if (!/^\d{4}$/.test(oldParentCode) || !/^\d{4}$/.test(newParentCode) || !api.changeParentAccessCode)
      return setError('Enter four digits for both the current and new code.');
    try {
      await api.changeParentAccessCode(oldParentCode, newParentCode);
      setOldParentCode(''); setNewParentCode(''); setNotice('Parent access code updated.'); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the parent code.'); }
  };
  const addReward = async () => {
    const stars = Number(rewardStars);
    if (!rewardName.trim() || !Number.isInteger(stars) || stars < 1) return setError('Enter a reward name and a positive whole-star cost.');
    if (await mutate('reward', { id: randomUUID(), title: rewardName.trim(), stars, available: true })) {
      setRewardName(''); setRewardStars('10');
    }
  };
  const requestReward = async (rewardId: string, memberId: string) => {
    if (!api.requestRedemption) return;
    try {
      const result = await api.requestRedemption(memberId, rewardId);
      setData(result.household); setNotice('Reward request sent to a parent for approval.'); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not request this reward.'); }
  };
  const enterChildMode = async (memberId: string) => {
    if (!api.startChildSession) return setError('Child access is unavailable on this server version.');
    setBusy(true); setError('');
    try {
      const context = await api.startChildSession(memberId);
      setAccessMode('child'); setActiveChildId(context.memberId); setActiveChildName(context.memberName); setElevated(false);
      setParentModeCode(''); setNotice(`Child view started for ${context.memberName}. Parent changes are locked until parent mode is unlocked.`);
      navigate('today');
      await refresh(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open child mode.'); }
    finally { setBusy(false); }
  };
  const exitChildMode = async () => {
    if (!api.returnToParentMode || !/^\d{4}$/.test(parentModeCode)) return setError('Enter the four-digit parent access code.');
    setBusy(true); setError('');
    try {
      await api.returnToParentMode(parentModeCode);
      setAccessMode('parent'); setActiveChildId(null); setActiveChildName(''); setParentModeCode(''); setElevated(true);
      setNotice('Parent mode unlocked. It locks again after 15 minutes without activity.');
      await refresh(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not unlock parent mode.'); }
    finally { setBusy(false); }
  };
  const itemInput = (
    <View style={[s.row, { alignItems: 'flex-end', gap: 8 }]}>
      <View style={s.grow}>
        <Input
          label="Add an item"
          placeholder="e.g. Sour cream"
          value={newItem}
          onChangeText={setNewItem}
          maxLength={160}
          onSubmitEditing={() => void addItem()}
          style={{ minHeight: 48, fontSize: 16 }}
        />
      </View>
      <Button
        label="Add item"
        primary
        icon="plus"
        disabled={busy || !newItem.trim()}
        onPress={() => void addItem()}
        style={{ width: 48, height: 48, paddingHorizontal: 0, borderRadius: 14 }}
      />
    </View>
  );
  const itemRow = (item: ListItem, compact = false) => (
    <Pressable
      key={item.id}
      accessibilityRole="checkbox"
      accessibilityLabel={item.title}
      accessibilityState={{ checked: item.completed, disabled: busy || accessMode === 'child' }}
      aria-checked={item.completed}
      disabled={busy || accessMode === 'child'}
      onPress={() => { if (accessMode === 'parent') void mutate('listItem', { ...item, completed: !item.completed }); }}
      style={[
        s.row,
        {
          minHeight: compact ? 44 : 54,
          paddingHorizontal: compact ? 0 : 16,
          paddingVertical: 8,
          borderBottomWidth: compact ? 0 : 1,
          borderColor: t.line,
        },
      ]}
    >
      <View
        style={{
          width: compact ? 22 : 26,
          height: compact ? 22 : 26,
          borderRadius: compact ? 6 : 8,
          borderWidth: item.completed ? 0 : 2,
          borderColor: t.checkBorder,
          backgroundColor: item.completed ? t.ok : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.completed && <Icon name="check" size={16} color={dark ? '#1A1714' : '#FFFFFF'} />}
      </View>
      <Copy
        size={compact ? 15 : 16}
        style={{ flex: 1, textDecorationLine: item.completed ? 'line-through' : 'none' }}
        color={item.completed ? t.muted : t.ink}
      >
        {item.title}
      </Copy>
      {!compact && (
        <Copy size={12} color={t.muted} style={{ maxWidth: 72 }}>
          {item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : item.addedBy}
        </Copy>
      )}
      {!compact && accessMode === 'parent' && listEditing ? (
        <Button
          label={`Remove ${item.title}`}
          icon="trash"
          disabled={busy}
          onPress={() => setConfirm({ title: `Remove “${item.title}” from ${item.listName}?`, action: async () => { await mutate('deleteListItem', { id: item.id }); } })}
          style={{ width: 40, height: 40, paddingHorizontal: 0, backgroundColor: 'transparent' }}
        />
      ) : null}
    </Pressable>
  );
  const chooseWeek = (offset: number) =>
    setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset * 7, 12));
  const pendingVoice = (data?.proposals || []).filter((item) => item.status === 'pending').length;
  const pendingPhotos = (data?.choreVerifications || []).filter((item) => item.status === 'pending').length;
  const pendingRewards = (data?.redemptions || []).filter((item) => item.status === 'pending').length;
  const pendingApprovals = accessMode === 'parent' ? pendingVoice + pendingPhotos + pendingRewards : 0;
  const choresHeader = (current: 'chores' | 'rewards') => (
    <Segmented
      options={[
        { id: 'chores', label: accessMode === 'child' ? 'My chores' : 'Chores' },
        { id: 'rewards', label: accessMode === 'child' ? 'My rewards' : 'Rewards', badge: accessMode === 'parent' ? pendingRewards : 0 },
        // Phones have no Lists tab (the mic sits in the middle of the tab bar), so lists and meals open from here.
        ...(wide ? [] : [{ id: 'lists' as const, label: 'Lists & meals' }]),
      ]}
      value={current}
      onChange={(id) => navigate(id)}
    />
  );
  const listsHeader = (current: 'lists' | 'meal' | 'recipes') => (
    <Segmented
      options={[{ id: 'lists', label: 'Lists' }, { id: 'meal', label: 'Meals' }, { id: 'recipes', label: 'Recipes' }]}
      value={current}
      onChange={(id) => navigate(id)}
    />
  );
  const screenContext = (backTo: Page = 'more', backLabel = 'Family'): ScreenContext | null =>
    data
      ? {
          api, data, busy, dark, accessMode, activeChildId, selectedDate,
          mutate: (kind, value) => mutate(kind, value),
          run, replace, fail: setError,
          celebrate: (message, detail) => setCelebration({ message, detail }),
          openTeamEvent: (teamId) => openEditor({ kind: 'event', preset: { teamId, category: 'sports' } }),
          back: back(backTo, backLabel),
        }
      : null;
  const renderContent = () => {
    if (!data)
      return (
        <View style={{ padding: 20, gap: 16 }}>
          {loading ? (
            <ActivityIndicator color={t.ink} />
          ) : (
            <>
              <Heading>Your household</Heading>
              <Copy>{error || 'Your household could not be loaded.'}</Copy>
              <Button onPress={() => void refresh(true)}>Try again</Button>
              <Button onPress={onSignOut}>Sign out</Button>
            </>
          )}
        </View>
      );
    switch (page) {
      case 'today': {
        const name = (accessMode === 'child' ? activeChildName : account.parentName).split(' ')[0];
        const isToday = dateKey(selectedDate) === dateKey(new Date());
        const myChores = data.chores.filter((c) => c.status === 'pending' && c.assignedToMemberId === activeChildId);
        const around: { icon: IconName; title: string; subtitle: string; page: Page; tint: number }[] = [];
        if (data.familyNight) {
          const night = nextFamilyNight(data.familyNight, new Date());
          const poll = (data.familyNightPolls || []).find((item) => item.id === night);
          const winner = poll?.suggestions.find((item) => item.id === poll.winnerSuggestionId);
          const when = night === dateKey(new Date()) ? 'Tonight' : new Date(`${night}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
          around.push({
            icon: 'moon', tint: 3, page: 'familyNight', title: `Family night · ${when}`,
            subtitle: winner ? winner.title : poll?.status === 'tie' ? 'It’s a tie. The picker decides.' : `${poll?.suggestions.length || 0} ideas · vote open`,
          });
        }
        const soon = Date.now() + 3 * 24 * 3600 * 1000;
        const game = data.events
          .filter((e) => e.category === 'sports' && new Date(e.endAt).getTime() > Date.now() && new Date(e.startAt).getTime() < soon)
          .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
        if (game) {
          const missing = (game.preparation || []).filter((item) => !item.completed).map((item) => item.label);
          around.push({
            icon: 'ball', tint: 2, page: 'sports',
            title: `${game.title} · ${new Date(game.startAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`,
            subtitle: missing.length ? `Still to pack: ${missing.slice(0, 3).join(', ')}` : game.responsibleMemberId
              ? `${data.members.find((m) => m.id === game.responsibleMemberId)?.name} drives · gear packed` : 'Gear packed',
          });
        }
        const move = data.events.find((e) => e.category === 'move' && dateKey(new Date(e.startAt)) === dateKey(new Date()));
        if (move) around.push({ icon: 'run', tint: 1, page: 'move', title: move.title, subtitle: `Today at ${new Date(move.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · start it on the TV` });
        const needs = [
          pendingVoice ? `${pendingVoice} voice request${pendingVoice === 1 ? '' : 's'}` : '',
          pendingPhotos ? `${pendingPhotos} chore photo${pendingPhotos === 1 ? '' : 's'}` : '',
          pendingRewards ? `${pendingRewards} reward request${pendingRewards === 1 ? '' : 's'}` : '',
        ].filter(Boolean);
        return (
          <>
            <View style={[s.spread, { alignItems: 'flex-end' }]}>
              <View style={[s.grow, { gap: 2 }]}>
                <Label>{greeting}, {name.toUpperCase()}</Label>
                <Heading>{selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Heading>
              </View>
              {accessMode === 'parent' ? (
                <Button label="Add" icon="plus" primary onPress={() => setAddSheet(true)}
                  style={{ width: 48, height: 48, paddingHorizontal: 0, borderRadius: 24 }} />
              ) : null}
            </View>
            {accessMode === 'parent' && needs.length ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Needs you: ${needs.join(', ')}`} onPress={() => navigate('approvals')}>
                <View style={[s.row, { padding: 16, borderRadius: 18, backgroundColor: dark ? '#3D3526' : '#F6EBD3', borderWidth: 1, borderColor: dark ? '#685530' : '#EADCBC' }]}>
                  <Icon name="sparkle" color={dark ? '#EDC875' : '#6B5320'} />
                  <View style={s.grow}>
                    <Copy size={12} weight={800} color={dark ? '#EDC875' : '#6B5320'} style={{ letterSpacing: 1.2 }}>NEEDS YOU</Copy>
                    <Copy weight={700}>{needs.join(' · ')}</Copy>
                  </View>
                  <Icon name="right" size={18} color={dark ? '#EDC875' : '#6B5320'} />
                </View>
              </Pressable>
            ) : null}
            {accessMode === 'child' ? (
              <Pressable accessibilityRole="button" onPress={() => navigate('chores')}>
                <Card style={[s.row, { padding: 16 }]}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: memberTint(3, dark).backgroundColor }}>
                    <Icon name="star" color={memberTint(3, dark).color} />
                  </View>
                  <View style={s.grow}>
                    <Copy weight={800}>{myChores.length ? `${myChores.length} chore${myChores.length === 1 ? '' : 's'} to do` : 'All chores done!'}</Copy>
                    <Copy size={13} color={t.muted}>{starBalance(data, activeChildId)} stars saved</Copy>
                  </View>
                  <Icon name="right" size={18} color={t.muted} />
                </Card>
              </Pressable>
            ) : null}
            {setupCard}
            {!showSetup && !pairedTVs.length && accessMode === 'parent' && !preview ? tvCard : null}
            {!showSetup && accessMode === 'parent' && !data.location ? (
              <Card>
                <NavRow icon="sparkle" title="Show weather on your TV" subtitle="Set your household’s location once" last
                  tint={memberTint(4, dark)} onPress={() => navigate('settings')} />
              </Card>
            ) : null}
            {weekStrip}
            <View style={s.section}>
              <Label>{isToday ? 'TODAY' : 'SCHEDULE'} · {events.length} {events.length === 1 ? 'EVENT' : 'EVENTS'}</Label>
              {!events.length && (
                <Card style={{ padding: 20, gap: 10 }}>
                  <Copy weight={700}>A little room in your day.</Copy>
                  {accessMode === 'parent' ? <Button icon="plus" onPress={() => openEditor({ kind: 'event' })}>Add event</Button> : null}
                </Card>
              )}
              {eventRows}
            </View>
            <View style={[s.row, { gap: 10, alignItems: 'stretch' }]}>
              <Pressable accessibilityRole="button" style={s.grow} onPress={() => navigate('meal')}>
                <Card style={{ padding: 14, gap: 2, flex: 1 }}>
                  <Label>{isToday ? 'TONIGHT' : 'DINNER'}</Label>
                  <Copy size={17} weight={700}>{meal?.title || 'Plan a meal'}</Copy>
                </Card>
              </Pressable>
              <Pressable accessibilityRole="button" style={s.grow} onPress={() => { setList('Groceries'); navigate('grocery'); }}>
                <Card style={{ padding: 14, gap: 2, flex: 1 }}>
                  <Label>GROCERIES</Label>
                  <Copy size={17} weight={700}>{groceries.filter((i) => !i.completed).length} to buy</Copy>
                </Card>
              </Pressable>
            </View>
            {around.length ? (
              <View style={s.section}>
                <Label>COMING UP AT HOME</Label>
                <Card>
                  {around.map((item, index) => (
                    <NavRow key={item.title} icon={item.icon} title={item.title} subtitle={item.subtitle}
                      tint={memberTint(item.tint, dark)} last={index === around.length - 1} onPress={() => navigate(item.page)} />
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        );
      }
      case 'calendar':
        return (
          <>
            <View style={[s.spread, { alignItems: 'flex-end' }]}>
              <View style={[s.grow, { gap: 2 }]}>
                <Label>FAMILY CALENDAR</Label>
                <Heading>Calendar</Heading>
              </View>
              {accessMode === 'parent' ? <Button
                label="Add"
                icon="plus"
                primary
                onPress={() => setAddSheet(true)}
                style={{ width: 48, height: 48, paddingHorizontal: 0, borderRadius: 24 }}
              /> : null}
            </View>
            <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
              <View style={s.grow}>
                <Segmented
                  options={[{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }]}
                  value={calendarMode}
                  onChange={setCalendarMode}
                />
              </View>
              <Button icon="settings" label="Filters" primary={showFilters || memberFilter !== 'all' || sourceFilter !== 'all'}
                onPress={() => setShowFilters(!showFilters)}>
                {memberFilter !== 'all' || sourceFilter !== 'all' ? `${(memberFilter !== 'all' ? 1 : 0) + (sourceFilter !== 'all' ? 1 : 0)}` : undefined}
              </Button>
            </View>
            {calendarMode === 'week' ? weekStrip : null}
            {calendarMode === 'month' ? (
              <Card style={{ padding: 10, gap: 8 }}>
                <Copy weight={800}>{selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Copy>
                <View style={{ flexDirection: 'row' }}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => <Copy key={`${label}${index}`} size={12} color={t.muted} style={{ flex: 1, textAlign: 'center' }}>{label}</Copy>)}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {monthGrid.map((day) => {
                    const key = dateKey(day);
                    // Count by the phone's local day (stored times are UTC ISO strings).
                    const count = eventsForDay(data?.events || [], day).filter((event) =>
                      (memberFilter === 'all' || event.memberIds.includes(memberFilter)) && fromSource(event, sourceFilter)).length;
                    const active = key === dateKey(selectedDate);
                    return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${key}, ${count} events`}
                      accessibilityState={{ selected: active }} onPress={() => setSelectedDate(day)}
                      style={{ width: '14.28%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: active ? t.primary : 'transparent', opacity: day.getMonth() === selectedDate.getMonth() ? 1 : 0.4 }}>
                      <Copy size={14} weight={active ? 800 : 500} color={active ? t.primaryInk : t.ink}>{day.getDate()}</Copy>
                      {count > 0 ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: active ? t.primaryInk : t.ink }} /> : null}
                    </Pressable>;
                  })}
                </View>
              </Card>
            ) : null}
            {showFilters ? (
              <Card style={{ padding: 14, gap: 8 }}>
                <Label>WHO</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  <Button primary={memberFilter === 'all'} onPress={() => setMemberFilter('all')}>Everyone</Button>
                  {data.members.map((member) => <Button key={member.id} primary={memberFilter === member.id} onPress={() => setMemberFilter(member.id)}>{member.name}</Button>)}
                </ScrollView>
                <Label>ADDED FROM</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {['all', ...((data.calendars || []).length ? ['synced'] : []), 'manual', 'import', 'voice'].map((source) => <Button key={source} primary={sourceFilter === source} onPress={() => setSourceFilter(source)}>{SOURCE_LABELS[source]}</Button>)}
                </ScrollView>
              </Card>
            ) : null}
            <View style={s.spread}>
              <Copy weight={700}>
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Copy>
              <View style={s.row}>
                <Button label={`Previous ${calendarMode}`} icon="left" onPress={() => calendarMode === 'month' ? setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1, 12)) : chooseWeek(calendarMode === 'day' ? -1 / 7 : -1)} />
                <Button onPress={() => setSelectedDate(new Date())}>Today</Button>
                <Button label={`Next ${calendarMode}`} icon="right" onPress={() => calendarMode === 'month' ? setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1, 12)) : chooseWeek(calendarMode === 'day' ? 1 / 7 : 1)} />
              </View>
            </View>
            <View style={s.section}>
              <Label>
                {calendarEvents.length} {calendarEvents.length === 1 ? 'EVENT' : 'EVENTS'}
                {calendarEvents.length !== events.length ? ` · ${events.length - calendarEvents.length} HIDDEN BY FILTERS` : ''}
              </Label>
              {!calendarEvents.length && (
                <Card style={{ padding: 20, gap: 10 }}>
                  <Copy weight={700}>{events.length ? 'No events match these filters.' : 'Nothing scheduled for this day.'}</Copy>
                  {accessMode === 'parent' ? <Button icon="plus" onPress={() => openEditor({ kind: 'event' })}>Add event</Button> : null}
                </Card>
              )}
              {eventRows}
            </View>
          </>
        );
      case 'lists':
        return (
          <>
            {listsHeader('lists')}
            <View style={[s.spread, { alignItems: 'flex-end' }]}>
              <View style={[s.grow, { gap: 2 }]}>
                <Label>{`${items.filter((i) => !i.completed).length} LEFT TO GET`}</Label>
                <Heading>{list}</Heading>
              </View>
              {accessMode === 'parent' && items.length ? (
                <Button onPress={() => setListEditing(!listEditing)} primary={listEditing}>{listEditing ? 'Done' : 'Edit'}</Button>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 4, padding: 4, backgroundColor: t.soft, borderRadius: 16 }}
            >
              {listNames.map((name) => (
                <Button
                  key={name}
                  onPress={() => {
                    setList(name);
                    setNewItem('');
                  }}
                  style={{ backgroundColor: list === name ? t.card : 'transparent' }}
                >
                  {name}
                </Button>
              ))}
              {accessMode === 'parent' ? <Button label="New list" icon="plus" onPress={() => setListPrompt(true)} /> : null}
            </ScrollView>
            {accessMode === 'parent' ? itemInput : null}
            <Card>
              {items.length ? (
                items.map((i) => itemRow(i))
              ) : (
                <View style={{ padding: 24, gap: 6 }}>
                  <Copy weight={700}>Nothing on the list yet.</Copy>
                  <Copy size={14} color={t.muted}>
                    Add something above. It will be saved to your household.
                  </Copy>
                </View>
              )}
            </Card>
            {list === 'Groceries' && <Button onPress={() => navigate('grocery')}>View grocery details</Button>}
          </>
        );
      case 'grocery':
        return (
          <>
            {back('lists', 'All lists')}
            <Card style={{ padding: 20, gap: 16, borderRadius: 24 }}>
              <Heading small>Groceries</Heading>
              <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
                <Button
                  icon="share"
                  onPress={() => {
                    void Share.share({
                      message: `Groceries\n${groceries
                        .filter((i) => !i.completed)
                        .map((i) => `• ${i.title}`)
                        .join('\n')}`,
                    }).catch(() => setError('Could not open the share sheet.'));
                  }}
                >
                  Share
                </Button>
                <Button
                  icon="edit"
                  onPress={() => {
                    setList('Groceries');
                    navigate('lists');
                  }}
                >
                  Edit list
                </Button>
              </View>
              <Copy size={15} color={t.muted}>
                {groceries.filter((i) => !i.completed).length} of {groceries.length} to buy
              </Copy>
              {!groceries.length && <Copy color={t.muted}>Your grocery list is empty.</Copy>}
              {Array.from(new Set(groceries.map((i) => i.category))).map((category, index) => (
                <View key={category} style={{ gap: 4 }}>
                  <View style={[s.row, { gap: 10 }]}>
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: memberTint(index, dark).color,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Copy size={11} weight={800} color={t.card}>
                        {category[0]}
                      </Copy>
                    </View>
                    <Copy size={15} weight={700}>
                      {category}
                    </Copy>
                  </View>
                  <View style={{ paddingLeft: 32 }}>
                    {groceries.filter((i) => i.category === category).map((i) => itemRow(i, true))}
                  </View>
                </View>
              ))}
            </Card>
            {accessMode === 'parent' ? itemInput : null}
          </>
        );
      case 'meal':
        return (
          <>
            {listsHeader('meal')}
            <View style={s.spread}>
              <Heading small>Meals</Heading>
              {accessMode === 'parent' ? <Button label="Add meal" icon="plus" onPress={() => openEditor({ kind: 'meal' })} /> : null}
            </View>
            {weekStrip}
            {accessMode === 'parent' && api.generateRecipe ? (
              <Card style={{ padding: 20, gap: 14, borderRadius: 24 }}>
                <View style={s.row}>
                  <Icon name="sparkle" color={t.ink} />
                  <Heading small>Create a recipe with AI</Heading>
                </View>
                <Copy size={15} color={t.muted}>
                  Describe what you’d like to cook. Hometide writes the recipe with ingredients and steps, and makes it{' '}
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}’s dinner.
                </Copy>
                <Input
                  label="What would you like to cook?"
                  value={aiRecipePrompt}
                  onChangeText={setAiRecipePrompt}
                  maxLength={300}
                  multiline
                  placeholder="e.g. quick chicken dinner the kids will eat, 30 minutes"
                  style={{ minHeight: 76, textAlignVertical: 'top' }}
                  editable={!aiRecipeBusy}
                />
                <View style={s.spread}>
                  <Copy size={15}>Add the ingredients to Groceries</Copy>
                  <Switch
                    value={aiRecipeGroceries}
                    onValueChange={setAiRecipeGroceries}
                    accessibilityLabel="Add the ingredients to Groceries"
                  />
                </View>
                <Button
                  primary
                  icon="sparkle"
                  disabled={busy || aiRecipeBusy || aiRecipePrompt.trim().length < 3}
                  onPress={() => void createAIRecipe()}
                >
                  {aiRecipeBusy ? 'Writing your recipe…' : 'Create recipe'}
                </Button>
              </Card>
            ) : null}
            {!meals.length ? (
              <Card style={{ padding: 22, gap: 16 }}>
                <Heading small>What’s for dinner?</Heading>
                <Copy color={t.muted}>No meal planned for this day.</Copy>
                {accessMode === 'parent' ? <Button primary onPress={() => openEditor({ kind: 'meal' })}>Plan a meal</Button> : null}
              </Card>
            ) : (
              meals.map((m) => (
                <Card key={m.id} style={{ padding: 20, gap: 18, borderRadius: 24 }}>
                  <Heading small>{m.title}</Heading>
                  {accessMode === 'parent' ? <View style={s.row}>
                    <Button icon="edit" onPress={() => openEditor({ kind: 'meal', item: m })}>
                      Edit
                    </Button>
                    <Button
                      icon="trash"
                      disabled={busy}
                      onPress={() =>
                        setConfirm({
                          title: `Delete “${m.title}” from your meal plan?`,
                          action: async () => {
                            await mutate('deleteMeal', { id: m.id });
                          },
                        })
                      }
                    >
                      Delete
                    </Button>
                  </View> : null}
                  <Copy size={15} color={t.muted}>
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} ·
                    Serves {m.servings} · {m.minutes} min
                  </Copy>
                  <View style={s.section}>
                    <Copy size={15} weight={700}>
                      Category
                    </Copy>
                    <Copy
                      size={14}
                      style={{
                        alignSelf: 'flex-start',
                        padding: 8,
                        borderRadius: 16,
                        backgroundColor: memberTint(4, dark).backgroundColor,
                        color: memberTint(4, dark).color,
                      }}
                    >
                      {m.category}
                    </Copy>
                  </View>
                  <View style={s.section}>
                    <Copy size={15} weight={700}>
                      Cooks
                    </Copy>
                    <Copy size={14} color={t.muted}>
                      {m.cookIds
                        .map((id) => data.members.find((x) => x.id === id)?.name)
                        .filter(Boolean)
                        .join(' & ') || 'Not assigned'}
                    </Copy>
                  </View>
                  <View style={s.section}>
                    <Copy size={15} weight={700}>
                      Ingredients
                    </Copy>
                    {m.ingredients.length ? (
                      m.ingredients.map((line, i) => (
                        <Copy key={i} size={15} weight={500}>
                          – {line}
                        </Copy>
                      ))
                    ) : (
                      <Copy size={14} color={t.muted}>
                        Add ingredients when editing this meal.
                      </Copy>
                    )}
                  </View>
                  <View style={s.section}>
                    <Copy size={15} weight={700}>
                      Instructions
                    </Copy>
                    {m.instructions.map((line, i) => (
                      <Copy key={i} size={15} weight={500}>
                        {i + 1}. {line}
                      </Copy>
                    ))}
                  </View>
                  <Button
                    primary
                    disabled={busy || !m.ingredients.length || accessMode === 'child'}
                    icon="lists"
                    onPress={() => setGroceryReview(m.id)}
                  >
                    Review ingredients for Groceries
                  </Button>
                </Card>
              ))
            )}
          </>
        );
      case 'chores':
        return (
          <>
            {choresHeader('chores')}
            <View style={s.spread}>
              <Heading>{accessMode === 'child' ? 'My chores' : 'Chores'}</Heading>
              {accessMode === 'parent' ? <Button label="Add chore" primary icon="plus" onPress={() => openEditor({ kind: 'chore' })} /> : null}
            </View>
            <Copy color={t.muted}>
              {visibleChores.filter((c) => c.status === 'completed').length} of {visibleChores.length} done · {accessMode === 'child' ? `${starBalance(data, activeChildId)} stars` : 'Chores earn stars'}
            </Copy>
            {accessMode === 'parent' && pendingPhotos ? (
              <Button primary icon="check" onPress={() => navigate('approvals')}>
                {`Review ${pendingPhotos} chore photo${pendingPhotos === 1 ? '' : 's'}`}
              </Button>
            ) : null}
            <Card>
              {!visibleChores.length && (
                <Copy style={{ padding: 20 }} color={t.muted}>
                  No chores yet. Add one for your family.
                </Copy>
              )}
              {visibleChores.map((chore) => (
                <View key={chore.id} style={[s.row, { padding: 12, borderBottomWidth: 1, borderColor: t.line }]}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={chore.title}
                    accessibilityState={{ checked: chore.status === 'completed', disabled: busy || (accessMode === 'child' && chore.status === 'completed') }}
                    aria-checked={chore.status === 'completed'}
                    disabled={busy || (accessMode === 'child' && chore.status === 'completed')}
                    onPress={() => {
                      if (accessMode === 'child' && chore.verifyWithPhoto) {
                        setChorePhotoId(chore.id);
                        navigate('chorePhoto');
                      } else if (accessMode === 'child')
                        void mutate('completeChore', { id: chore.id, memberId: activeChildId }).then((ok) => {
                          if (ok) setCelebration({ message: `+${chore.points ?? 1} stars!`, detail: `${chore.title} is done. Nice work!` });
                        });
                      else void mutate('chore', { ...chore, status: chore.status === 'completed' ? 'pending' : 'completed' });
                    }}
                    style={[s.row, { flex: 1, minHeight: 44 }]}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: t.checkBorder,
                        backgroundColor: chore.status === 'completed' ? t.ok : 'transparent',
                      }}
                    >
                      {chore.status === 'completed' && <Icon name="check" size={22} color={t.card} />}
                    </View>
                    <View style={s.grow}>
                      <Copy style={{ textDecorationLine: chore.status === 'completed' ? 'line-through' : 'none' }}>
                        {chore.title}
                      </Copy>
                      <Copy size={13} color={t.muted}>
                        {data.members.find((m) => m.id === chore.assignedToMemberId)?.name || 'Anyone'}
                        {chore.points ? ` · +${chore.points} ★` : ''}
                        {chore.verifyWithPhoto && chore.status === 'pending'
                          ? (data.choreVerifications || []).some((v) => v.choreId === chore.id && v.status === 'pending')
                            ? ' · photo waiting for a parent'
                            : accessMode === 'child' ? ' · tap to take a photo' : ' · needs a photo'
                          : ''}
                      </Copy>
                    </View>
                  </Pressable>
                  {accessMode === 'parent' ? <Button
                    label={`Edit ${chore.title}`}
                    icon="edit"
                    onPress={() => openEditor({ kind: 'chore', item: chore })}
                  /> : null}
                </View>
              ))}
            </Card>
          </>
        );
      case 'members':
        return (
          <>
            {back('more', 'Family')}
            <View style={s.spread}>
              <Heading>Family</Heading>
              <Button label="Add member" primary icon="plus" onPress={() => openEditor({ kind: 'member' })} />
            </View>
            <Copy size={14} color={t.muted}>
              Profiles help organize events and chores. They are not separate sign-in accounts.
            </Copy>
            <Card>
              {data.members.map((m, i) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${m.name}`}
                  key={m.id}
                  onPress={() => openEditor({ kind: 'member', item: m })}
                  style={[s.row, { padding: 16, borderBottomWidth: 1, borderColor: t.line }]}
                >
                  <View
                    style={{
                      height: 40,
                      width: 40,
                      borderRadius: 20,
                      backgroundColor: memberTint(i, dark).backgroundColor,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Copy weight={800} color={memberTint(i, dark).color}>
                      {m.initials}
                    </Copy>
                  </View>
                  <View style={s.grow}>
                    <Copy weight={700}>{m.name}</Copy>
                    <Copy size={13} color={t.muted}>
                      {m.role === 'adult' ? 'Adult' : 'Child'}
                    </Copy>
                  </View>
                  <Icon name="right" size={18} />
                </Pressable>
              ))}
            </Card>
          </>
        );
      case 'recipes':
        return (
          <>
            {listsHeader('recipes')}
            <Heading>Recipes</Heading>
            <Input label="Recipe name" value={recipeName} onChangeText={setRecipeName} maxLength={120} placeholder="e.g. Sunday pasta" />
            <Input label="Ingredients · one per line" value={recipeIngredients} onChangeText={setRecipeIngredients} multiline style={{ minHeight: 110, textAlignVertical: 'top' }} />
            <Input label="Instructions · one step per line" value={recipeInstructions} onChangeText={setRecipeInstructions} multiline style={{ minHeight: 130, textAlignVertical: 'top' }} />
            <Button primary disabled={busy || !recipeName.trim()} onPress={() => void saveRecipe()}>Save recipe</Button>
            {(data.recipes || []).length ? (data.recipes || []).map((recipe) => (
              <Card key={recipe.id} style={{ padding: 16, gap: 8 }}>
                <Heading small>{recipe.name}</Heading>
                <Copy size={14} color={t.muted}>{recipe.ingredients.length} ingredients · {recipe.servings} servings</Copy>
                <Button icon="calendar" onPress={() => void scheduleRecipe(recipe)}>Plan for {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Button>
              </Card>
            )) : <Card style={{ padding: 18 }}><Copy color={t.muted}>Save a family recipe to reuse it when planning meals.</Copy></Card>}
          </>
        );
      case 'imports':
        return <ImportsScreen {...screenContext('calendar', 'Calendar')!} />;
      case 'approvals':
        return <ApprovalsScreen {...screenContext('today', 'Today')!} />;
      case 'chorePhoto':
        return <ChorePhotoScreen {...screenContext('chores', 'Chores')!} choreId={chorePhotoId} />;
      case 'sports':
        return <SportsScreen {...screenContext()!} />;
      case 'familyNight':
        return <FamilyNightScreen {...screenContext()!} />;
      case 'move':
        return <MoveScreen {...screenContext()!} />;
      case 'voice':
        return <VoiceScreen {...screenContext()!} />;
      case 'rewards': {
        const children = data.members.filter((member) => member.role === 'child');
        const rewardChildId = accessMode === 'child' ? activeChildId || '' : children.some((member) => member.id === selectedChildId) ? selectedChildId : children[0]?.id || '';
        const rewardTitle = (id: string) => data.rewards?.find((reward) => reward.id === id)?.title || 'a reward';
        const goal = (data.rewards || []).find((reward) => reward.id === goalRewardId && reward.available);
        const requests = [...(data.redemptions || [])]
          .filter((item) => accessMode === 'parent' || item.memberId === activeChildId)
          .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
        const toHandOut = requests.filter((item) => item.status === 'approved');
        const statusLabel = { pending: 'Waiting for a parent', approved: 'Approved', rejected: 'Not this time', fulfilled: 'Given' } as const;
        const view = accessMode === 'child' ? 'kids' : rewardsView;
        return (
          <>
            {choresHeader('rewards')}
            {accessMode === 'parent' ? (
              <Segmented
                options={[{ id: 'kids', label: 'For kids', badge: pendingRewards }, { id: 'parent', label: 'Parent settings', badge: toHandOut.length }]}
                value={rewardsView}
                onChange={setRewardsView}
              />
            ) : null}
            {view === 'kids' ? (
              <>
                {accessMode === 'child' ? (
                  <Card style={{ padding: 16, gap: 8 }}>
                    <View style={s.spread}>
                      <Copy weight={800}>{starBalance(data, rewardChildId)} stars saved</Copy>
                      <Icon name="star" color={memberTint(3, dark).color} />
                    </View>
                    <StarsBar data={data} memberId={rewardChildId} target={goal?.stars} dark={dark} />
                    <Copy size={13} color={t.muted}>{goal ? `Saving for ${goal.title}` : 'Pick a reward to save for.'}</Copy>
                  </Card>
                ) : children.length ? (
                  <Card>
                    {children.map((member, index) => (
                      <Pressable key={member.id} accessibilityRole="button" accessibilityState={{ selected: rewardChildId === member.id }}
                        onPress={() => setSelectedChildId(member.id)}
                        style={{ padding: 14, gap: 6, borderBottomWidth: index === children.length - 1 ? 0 : 1, borderColor: t.line, backgroundColor: rewardChildId === member.id ? t.soft : 'transparent' }}>
                        <View style={s.spread}><Copy weight={800}>{member.name}</Copy><Copy weight={800}>{starBalance(data, member.id)} ★</Copy></View>
                        <StarsBar data={data} memberId={member.id} dark={dark} />
                      </Pressable>
                    ))}
                  </Card>
                ) : <Card style={{ padding: 18 }}><Copy color={t.muted}>Add a child profile to start earning stars.</Copy></Card>}
                <Label>REWARDS</Label>
                {(data.rewards || []).filter((reward) => reward.available).map((reward) => (
                  <Card key={reward.id} style={{ padding: 14, gap: 8 }}>
                    <View style={s.spread}><Copy weight={800}>{reward.title}</Copy><Copy weight={700}>{reward.stars} ★</Copy></View>
                    {accessMode === 'child' ? <StarsBar data={data} memberId={rewardChildId} target={reward.stars} dark={dark} /> : null}
                    <View style={[s.row, { gap: 6 }]}>
                      <Button disabled={busy || !api.requestRedemption || !rewardChildId} onPress={() => void requestReward(reward.id, rewardChildId)}>
                        {accessMode === 'child' ? 'Ask for this' : `Request for ${children.find((member) => member.id === rewardChildId)?.name || 'child'}`}
                      </Button>
                      {accessMode === 'child' ? (
                        <Button primary={goalRewardId === reward.id} onPress={() => setGoalRewardId(reward.id)}>{goalRewardId === reward.id ? 'My goal' : 'Save for this'}</Button>
                      ) : null}
                    </View>
                  </Card>
                ))}
                {!(data.rewards || []).some((reward) => reward.available) ? (
                  <Copy size={13} color={t.muted}>{accessMode === 'parent' ? 'No rewards yet. Create one in Parent settings.' : 'No rewards yet. Ask a parent to add one.'}</Copy>
                ) : null}
                <Label>{accessMode === 'child' ? 'MY REQUESTS' : 'REQUESTS'}</Label>
                {accessMode === 'parent' && pendingRewards ? (
                  <Button primary icon="check" onPress={() => navigate('approvals')}>{`Review ${pendingRewards} request${pendingRewards === 1 ? '' : 's'}`}</Button>
                ) : null}
                {requests.slice(0, 8).map((item) => (
                  <View key={item.id} style={[s.spread, { paddingVertical: 6 }]}>
                    <Copy size={14} style={{ flex: 1 }}>{accessMode === 'parent' ? `${children.find((m) => m.id === item.memberId)?.name}: ` : ''}{rewardTitle(item.rewardId)}</Copy>
                    <Copy size={13} weight={700} color={item.status === 'rejected' ? t.danger : item.status === 'pending' ? t.muted : t.ok}>{statusLabel[item.status]}</Copy>
                  </View>
                ))}
                {!requests.length ? <Copy size={13} color={t.muted}>No requests yet.</Copy> : null}
              </>
            ) : (
              <>
                {toHandOut.length ? (
                  <View style={s.section}>
                    <Label>TO HAND OUT</Label>
                    {toHandOut.map((item) => (
                      <Card key={item.id} style={[s.spread, { padding: 14 }]}>
                        <Copy weight={700} style={{ flex: 1 }}>{children.find((m) => m.id === item.memberId)?.name}: {rewardTitle(item.rewardId)}</Copy>
                        <Button disabled={busy} onPress={() => void mutate('redemptionFulfill', { id: item.id })}>Mark given</Button>
                      </Card>
                    ))}
                  </View>
                ) : null}
                <Label>REWARDS</Label>
                <Card style={{ padding: 16, gap: 8 }}>
                  <Input label="New reward" value={rewardName} onChangeText={setRewardName} maxLength={120} placeholder="e.g. Pick the movie" />
                  <Input label="Stars needed" value={rewardStars} onChangeText={setRewardStars} keyboardType="number-pad" maxLength={5} />
                  <Button primary disabled={busy || !rewardName.trim()} onPress={() => void addReward()}>Add reward</Button>
                </Card>
                {(data.rewards || []).length ? (
                  <Card>
                    {(data.rewards || []).map((reward, index) => (
                      <View key={reward.id} style={[s.spread, { padding: 14, borderBottomWidth: index === (data.rewards || []).length - 1 ? 0 : 1, borderColor: t.line }]}>
                        <View style={s.grow}>
                          <Copy weight={700}>{reward.title}</Copy>
                          <Copy size={13} color={t.muted}>{reward.stars} stars · {reward.available ? 'offered' : 'hidden'}</Copy>
                        </View>
                        <Switch value={reward.available} disabled={busy} accessibilityLabel={`Offer ${reward.title}`}
                          onValueChange={(available) => void mutate('reward', { ...reward, available })} />
                      </View>
                    ))}
                  </Card>
                ) : null}
                <Label>STAR CORRECTION</Label>
                <Card style={{ padding: 16, gap: 8 }}>
                  <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
                    {children.map((member) => <Button key={member.id} primary={adjustMember === member.id} onPress={() => setAdjustMember(member.id)}>{member.name}</Button>)}
                  </View>
                  <Input label="Change (e.g. 5 or -3)" value={adjustDelta} onChangeText={(value: string) => setAdjustDelta(value.replace(/[^\d-]/g, '').slice(0, 5))} keyboardType="numbers-and-punctuation" />
                  <CodeInput value={adjustCode} onChange={setAdjustCode} />
                  <Button disabled={busy || !adjustMember || !/^-?\d+$/.test(adjustDelta) || Number(adjustDelta) === 0 || adjustCode.length !== 4}
                    onPress={() => void run(() => api.adjustStars!(adjustMember, Number(adjustDelta), adjustCode), 'Star balance corrected.').then((saved) => {
                      if (saved) { replace(saved); setAdjustDelta(''); setAdjustCode(''); }
                    })}>Save correction</Button>
                </Card>
                <Label>PARENT CODE</Label>
                <Card style={{ padding: 16, gap: 8 }}>
                  <Copy size={13} color={t.muted}>Four digits for approvals and for unlocking parent mode on a child’s phone or the TV. Only a salted verifier is stored.</Copy>
                  <CodeInput value={parentCode} onChange={setParentCode} label="Set code (first time)" />
                  <Button primary onPress={() => void saveParentCode()}>Set code</Button>
                  <View style={{ height: 1, backgroundColor: t.line, marginVertical: 4 }} />
                  <CodeInput value={oldParentCode} onChange={setOldParentCode} label="Current code" />
                  <CodeInput value={newParentCode} onChange={setNewParentCode} label="New code" />
                  <Button onPress={() => void changeParentCode()}>Change code</Button>
                  <View style={{ height: 1, backgroundColor: t.line, marginVertical: 4 }} />
                  <Copy weight={700}>Forgot the code?</Copy>
                  <Input label="Account password" value={recoveryPassword} onChangeText={setRecoveryPassword} secureTextEntry autoCapitalize="none" />
                  <CodeInput value={recoveryCode} onChange={setRecoveryCode} label="New code" />
                  <Button disabled={busy || !recoveryPassword || recoveryCode.length !== 4 || !api.resetParentAccessCode}
                    onPress={() => void run(async () => {
                      const idToken = await onReauthenticate?.(recoveryPassword);
                      await api.resetParentAccessCode!(recoveryCode, recoveryPassword, idToken);
                      return true;
                    }, 'Parent code reset.').then((done) => { if (done) { setRecoveryPassword(''); setRecoveryCode(''); } })}>
                    Reset code
                  </Button>
                </Card>
              </>
            )}
          </>
        );
      }
      case 'photos':
        return <PhotosScreen {...screenContext()!} />;
      case 'calendars':
        return <CalendarsScreen {...screenContext()!} />;
      case 'more': {
        const children = data.members.filter((member) => member.role === 'child');
        const tvLabel = pairedTVs.length ? `${pairedTVs.length} TV${pairedTVs.length === 1 ? '' : 's'} connected` : 'Not connected yet';
        return (
          <>
            <View style={{ gap: 2 }}>
              <Label>{data.family.name.toUpperCase()}</Label>
              <Heading>{accessMode === 'child' ? `${activeChildName}’s view` : 'Family'}</Heading>
            </View>
            <View style={s.section}>
              <Label>FAMILY TIME</Label>
              <Card>
                <NavRow icon="moon" tint={memberTint(3, dark)} title="Family night" onPress={() => navigate('familyNight')}
                  subtitle={data.familyNight ? 'Suggest ideas and vote' : 'Set up a weekly night together'} last={accessMode === 'child'} />
                {accessMode === 'parent' ? (
                  <>
                    <NavRow icon="run" tint={memberTint(1, dark)} title="Move breaks" subtitle="Short guided movement on the TV" onPress={() => navigate('move')} />
                    <NavRow icon="ball" tint={memberTint(2, dark)} title="Sports & carpools"
                      subtitle={(data.teams || []).length ? `${(data.teams || []).length} team${(data.teams || []).length === 1 ? '' : 's'} · drivers and gear` : 'Teams, drivers, and gear'} onPress={() => navigate('sports')} />
                    <NavRow icon="photos" tint={memberTint(0, dark)} title="Photos" last
                      subtitle={(data.photos || []).length ? `${(data.photos || []).length} in the TV slideshow` : 'Share photos to the TV'} onPress={() => navigate('photos')} />
                  </>
                ) : null}
              </Card>
            </View>
            {accessMode === 'child' ? (
              <Card style={{ padding: 16, gap: 10 }}>
                <Copy weight={800}>Parent unlock</Copy>
                <Copy size={14} color={t.muted}>A parent can enter the four-digit code to make family changes on this phone.</Copy>
                <CodeInput value={parentModeCode} onChange={setParentModeCode} label="Parent code" />
                <Button primary disabled={busy || !/^\d{4}$/.test(parentModeCode)} onPress={() => void exitChildMode()}>Unlock parent mode</Button>
              </Card>
            ) : (
              <>
                <View style={s.section}>
                  <Label>YOUR HOUSEHOLD</Label>
                  <Card>
                    <NavRow icon="people" title="Family members" subtitle={`${data.members.length} profiles`} onPress={() => navigate('members')} />
                    <NavRow icon="calendar" title="Connected calendars" onPress={() => navigate('calendars')}
                      subtitle={(data.calendars || []).length ? `${(data.calendars || []).length} connected${(data.calendars || []).some((c) => c.status === 'error') ? ' · needs attention' : ''}` : 'Google, iCloud, or Outlook'}
                      badge={(data.calendars || []).filter((c) => c.status === 'error').length} />
                    <NavRow icon="tv" title="TV" subtitle={tvLabel} onPress={() => navigate('remote')} />
                    <NavRow icon="mic" title="Voice · Alexa+" subtitle="Ask about your day, suggest changes" onPress={() => navigate('voice')} />
                    <NavRow icon="star" title="Hand this phone to a child" last
                      subtitle={children.length ? 'Child view with their chores and rewards' : 'Add a child profile first'}
                      onPress={() => (children.length ? setChildPicker(true) : navigate('members'))} />
                  </Card>
                </View>
                <View style={s.section}>
                  <Label>ACCOUNT</Label>
                  <Card>
                    <NavRow icon="settings" title="Settings" subtitle="Appearance, parent code, and sign-in" last onPress={() => navigate('settings')} />
                  </Card>
                </View>
              </>
            )}
          </>
        );
      }
      case 'remote':
        return (
          <>
            {back('more', 'Family')}
            <View style={{ gap: 2 }}>
              <Label>YOUR FAMILY TV</Label>
              <Heading>TV</Heading>
            </View>
            {pairedTVs.length === 0 ? (
              <Card style={{ padding: 16, gap: 8 }}>
                <Copy weight={700}>No TV connected</Copy>
                <Copy size={14} color={t.muted}>
                  Show the pairing code in TV Settings, then enter it here to connect this TV to your household.
                </Copy>
                {preview ? (
                  <Copy size={13} color={t.muted}>
                    Pairing is disabled in the sample design preview.
                  </Copy>
                ) : (
                  <Button
                    primary
                    icon="tv"
                    onPress={() => {
                      setPairError('');
                      setPairPrompt(true);
                    }}
                  >
                    Pair a TV
                  </Button>
                )}
              </Card>
            ) : (
              <Card style={{ padding: 14, gap: 10 }}>
                <Copy weight={700}>Connected TVs</Copy>
                {pairedTVs.map((device) => (
                  <View
                    key={device.deviceId}
                    style={[s.spread, { paddingVertical: 8, borderTopWidth: 1, borderColor: t.line }]}
                  >
                    <View style={s.grow}>
                      <Copy weight={700}>{device.deviceName}</Copy>
                      <Copy size={13} color={t.muted}>
                        Household data sync is enabled
                      </Copy>
                    </View>
                    <Button
                      disabled={pairBusy}
                      onPress={() => {
                        setPairError('');
                        setUnpairPrompt(device);
                      }}
                    >
                      Unpair
                    </Button>
                  </View>
                ))}
                {!preview && (
                  <Button
                    onPress={() => {
                      setPairError('');
                      setPairCode('');
                      setPairPrompt(true);
                    }}
                  >
                    Pair another TV
                  </Button>
                )}
              </Card>
            )}
            <Card style={{ padding: 16, gap: 12 }}>
              <Copy weight={700}>On the TV</Copy>
              <View style={{ gap: 6 }}>
                <Copy size={14} color={t.muted}>Wall calendar after this long without the remote</Copy>
                <Segmented
                  options={[
                    { id: '1', label: '1 min' }, { id: '4', label: '4 min' }, { id: '10', label: '10 min' },
                    { id: '30', label: '30 min' }, { id: '0', label: 'Off' },
                  ]}
                  value={String(data?.tvSettings?.wallIdleMinutes ?? 4) as '1' | '4' | '10' | '30' | '0'}
                  onChange={(id) => void saveTVSettings({ wallIdleMinutes: Number(id) })}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Copy size={14} color={t.muted}>Reminder on the TV before each event</Copy>
                <Segmented
                  options={[{ id: '10', label: '10 min' }, { id: '15', label: '15 min' }, { id: '30', label: '30 min' }, { id: '0', label: 'Off' }]}
                  value={String(data?.tvSettings?.reminderMinutes ?? 15) as '10' | '15' | '30' | '0'}
                  onChange={(id) => void saveTVSettings({ reminderMinutes: Number(id) })}
                />
              </View>
              <Copy size={13} color={t.muted}>
                Applies to every TV in your household within a few seconds. Reminders show while Hometide is on the TV screen.
              </Copy>
            </Card>
            <Card style={{ padding: 16, gap: 6 }}>
              <Copy weight={700}>What the TV shows</Copy>
              <Copy size={14} color={t.muted}>
                Your calendar, chores, lists, meals, family night vote, and photo slideshow. It refreshes about every 5 seconds.
                Use the TV remote to check things off; parent changes on the TV need your four-digit code.
              </Copy>
            </Card>
          </>
        );
      case 'settings':
        return (
          <>
            {back('more', 'Family')}
            <View style={{ gap: 2 }}>
              <Label>FAMILY ACCOUNT</Label>
              <Heading>Settings</Heading>
            </View>
            <Label>APPEARANCE</Label>
            <Card style={{ padding: 12, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['light', 'dark', 'system'] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityLabel={mode === 'system' ? 'Automatic' : mode === 'light' ? 'Light' : 'Dark'}
                    accessibilityState={{ selected: appearance === mode }}
                    aria-pressed={appearance === mode}
                    onPress={() => {
                      void onAppearance(mode).catch(() => setError('Could not save the appearance setting.'));
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      paddingHorizontal: 6,
                      gap: 6,
                      alignItems: 'center',
                      borderRadius: 14,
                      borderWidth: 2,
                      borderColor: appearance === mode ? t.primary : 'transparent',
                    }}
                  >
                    <View
                      style={{
                        width: '100%',
                        height: 44,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: t.line,
                        backgroundColor: mode === 'dark' ? '#1A1714' : '#F7F5F0',
                        padding: 6,
                        flexDirection: 'row',
                        gap: 4,
                        alignItems: 'flex-end',
                      }}
                    >
                      <View
                        style={{
                          flex: 1,
                          height: 10,
                          borderRadius: 3,
                          backgroundColor: mode === 'dark' ? '#4A433A' : '#DCE7F7',
                        }}
                      />
                      <View
                        style={{
                          flex: 1,
                          height: 16,
                          borderRadius: 3,
                          backgroundColor: mode === 'light' ? '#D9EEDA' : '#463A10',
                        }}
                      />
                    </View>
                    <Copy size={14} weight={700}>
                      {mode === 'system' ? 'Automatic' : mode === 'light' ? 'Light' : 'Dark'}
                    </Copy>
                  </Pressable>
                ))}
              </View>
              <Copy size={13} weight={500} color={t.muted}>
                Applies to this phone. TV appearance sync will follow pairing.
              </Copy>
            </Card>
            <Label>YOUR HOUSEHOLD</Label>
            <Card style={{ padding: 16, gap: 4 }}>
              <Copy weight={700}>{account.householdName}</Copy>
              <Copy size={14} color={t.muted}>{account.email}</Copy>
            </Card>
            {account.demo && api.resetDemo && accessMode === 'parent' && !preview ? (
              <>
                <Label>DEMO FAMILY</Label>
                <Card style={{ padding: 16, gap: 10 }}>
                  <Copy size={13} color={t.muted}>
                    This is the shared demo account. Reset puts the demo family back to its starting point, with
                    Tuesday’s pickup clash waiting to be fixed, so the next person sees the whole story. Paired TVs stay
                    connected and update on their own.
                  </Copy>
                  <Button
                    icon="refresh"
                    disabled={busy}
                    onPress={() =>
                      setConfirm({
                        title: 'Reset the demo family?',
                        detail: 'Every change made in this demo account is undone. Paired TVs stay connected.',
                        actionLabel: 'Reset demo family',
                        action: async () => {
                          if (await run(async () => { await api.resetDemo!(); return true; }, 'Demo family reset')) {
                            await refresh(true);
                          }
                        },
                      })
                    }
                  >
                    Reset the demo family
                  </Button>
                </Card>
              </>
            ) : null}
            <Label>WEATHER ON THE TV</Label>
            <Card style={{ padding: 16, gap: 10 }}>
              <View style={s.spread}>
                <View style={s.grow}>
                  <Copy weight={700}>{data.location ? data.location.label : 'No location yet'}</Copy>
                  <Copy size={13} color={t.muted}>
                    {data.location
                      ? `${data.location.source === 'device' ? 'From this phone' : 'Searched'} · time zone ${data.family.timezone.replace('_', ' ')}`
                      : 'Set it once so the TV shows your local forecast.'}
                  </Copy>
                </View>
                {data.location ? (
                  <Button label="Remove weather location" icon="trash" disabled={busy}
                    onPress={() => void mutate('householdLocation', { id: 'location', clear: true })} />
                ) : null}
              </View>
              <Button primary icon="home" disabled={busy || preview} onPress={() => void savePlace(detectPlace)}>Use my location</Button>
              <View style={[s.row, { alignItems: 'flex-end', gap: 8 }]}>
                <View style={s.grow}>
                  <Input label="Or search a city or ZIP" value={placeQuery} onChangeText={setPlaceQuery} maxLength={80}
                    placeholder="e.g. Phoenix, AZ or 85004" autoCapitalize="words" returnKeyType="search"
                    onSubmitEditing={() => void savePlace(() => searchPlace(placeQuery))} />
                </View>
                <Button disabled={busy || preview || !placeQuery.trim()} onPress={() => void savePlace(() => searchPlace(placeQuery))}
                  style={{ minHeight: 52 }}>Set</Button>
              </View>
              <Copy size={12} color={t.muted}>Saved as an approximate area (about 1 km), never your address. Forecasts cover US locations.</Copy>
            </Card>
            <Label>PARENT CODE</Label>
            <Card>
              <NavRow icon="star" title="Rewards and parent code" subtitle="Set, change, or recover the four-digit code" last
                onPress={() => { setRewardsView('parent'); navigate('rewards'); }} />
            </Card>
            <Button icon="refresh" disabled={loading || busy} onPress={() => void refresh(true)}>
              Refresh household
            </Button>
            <Copy size={13} color={t.muted}>
              {lastSync
                ? `Last refreshed ${lastSync.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Checks for updates every 20 seconds while open.`
                : 'Not refreshed yet.'}
            </Copy>
            <Button onPress={onServerSettings}>Server settings</Button>
            <Button onPress={onSignOut}>Sign out</Button>
            {api.revokeAllSessions && !preview ? (
              <Button
                onPress={() =>
                  setConfirm({
                    title: 'Sign out on every phone, including child views started from this account?',
                    detail: 'Paired TVs stay connected. Unpair them from Remote if needed.',
                    actionLabel: 'Sign out everywhere',
                    action: async () => {
                      if (await run(async () => { await api.revokeAllSessions!(); return true; })) onSignOut();
                    },
                  })
                }
              >
                Sign out everywhere
              </Button>
            ) : null}
            {onDeleteAccount && !preview ? (
              <>
                <Label>DELETE ACCOUNT</Label>
                <Card style={{ padding: 16, gap: 10 }}>
                  <Copy size={13} color={t.muted}>
                    Permanently deletes your account and everything in this household: family members, children’s profiles,
                    events, chores, rewards, lists, meals, photos and connected calendars. Phones, child views, TVs and voice
                    assistants are disconnected. This can’t be undone.
                  </Copy>
                  <Input label="Account password" value={deletePassword} onChangeText={setDeletePassword} secureTextEntry autoCapitalize="none" />
                  <Button
                    disabled={busy || !deletePassword}
                    onPress={() =>
                      setConfirm({
                        title: 'Delete your Hometide account and all household data?',
                        detail: 'Everyone in the household loses access, and paired TVs show the pairing screen again. This can’t be undone.',
                        actionLabel: 'Delete account',
                        action: async () => {
                          await run(async () => { await onDeleteAccount(deletePassword); return true; });
                        },
                      })
                    }
                  >
                    Delete account
                  </Button>
                </Card>
              </>
            ) : null}
          </>
        );
    }
  };
  const confirmation = (
    <Card style={[{ padding: 20, gap: 16 }, dialog]}>
      <Copy weight={700}>{confirm?.title}</Copy>
      <Copy size={14} color={t.muted}>
        {confirm?.detail || 'This removes the item from your household.'}
      </Copy>
      <View style={s.row}>
        <Button onPress={() => setConfirm(null)}>Cancel</Button>
        <Button
          primary
          disabled={busy}
          onPress={() => {
            const action = confirm?.action;
            setConfirm(null);
            void action?.();
          }}
        >
          {confirm?.actionLabel || 'Delete'}
        </Button>
      </View>
    </Card>
  );
  const TAB_OF: Partial<Record<Page, Page>> = {
    grocery: 'lists', meal: 'lists', recipes: 'lists', rewards: 'chores', chorePhoto: 'chores', imports: 'calendar',
    approvals: 'today', members: 'more', photos: 'more', remote: 'more', settings: 'more', sports: 'more',
    familyNight: 'more', move: 'more', voice: 'more', calendars: 'more',
  };
  const tabPage = TAB_OF[page] || page;
  // Hold-to-talk "Ask Hometide" in the phone tab bar. The voice endpoint is for parents, so child mode hides it.
  const showMic = !wide && accessMode === 'parent';
  const tabs: { page: Page; label: string; icon: IconName; badge?: number }[] = [
    { page: 'today', label: 'Today', icon: 'home', badge: pendingApprovals },
    { page: 'calendar', label: 'Calendar', icon: 'calendar' },
    { page: 'chores', label: 'Chores', icon: 'chores' },
    { page: 'lists', label: 'Lists', icon: 'lists' },
    { page: 'more', label: 'Family', icon: 'people' },
  ];
  // The phone tab bar drops Lists (reached from Chores) so the mic is centred: Today, Calendar, mic, Chores, Family.
  const phoneTabs = tabs.filter((tab) => tab.page !== 'lists');
  const phoneTabPage = tabPage === 'lists' ? 'chores' : tabPage;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={t.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {preview && (
          <View style={{ backgroundColor: t.soft, padding: 6 }}>
            <Copy size={12} color={t.muted} style={{ textAlign: 'center' }}>
              DESIGN PREVIEW · sample data, no cloud writes
            </Copy>
          </View>
        )}
        <View style={{ flex: 1, flexDirection: 'row' }}>
        {wide ? (
          <View
            accessibilityRole="tablist"
            style={{ width: 248, paddingHorizontal: 16, paddingTop: 28, paddingBottom: 20, gap: 4, borderRightWidth: 1, borderColor: t.navLine, backgroundColor: t.nav }}
          >
            <View style={[s.row, { paddingHorizontal: 12, marginBottom: 24, gap: 10 }]}>
              <Image source={require('../assets/brand-mark.png')} style={{ width: 32, height: 32 }} accessibilityIgnoresInvertColors />
              <Copy size={19} weight={800}>Hometide</Copy>
            </View>
            {tabs.map((tab) => {
              const selected = tabPage === tab.page;
              return (
                <Pressable
                  key={tab.page}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.badge ? `${tab.label}, ${tab.badge} waiting` : tab.label}
                  accessibilityState={{ selected }}
                  aria-selected={selected}
                  onPress={() => navigate(tab.page)}
                  style={(state) => [
                    s.row,
                    {
                      minHeight: 46, paddingHorizontal: 12, borderRadius: 12,
                      backgroundColor: selected ? t.navActive : (state as { hovered?: boolean }).hovered ? t.navHover : 'transparent',
                    },
                  ]}
                >
                  <Icon name={tab.icon} size={22} color={selected ? t.navActiveInk : t.navMuted} />
                  <Copy size={15} weight={selected ? 800 : 600} color={selected ? t.navActiveInk : t.navMuted} style={{ flex: 1 }}>
                    {tab.label}
                  </Copy>
                  {tab.badge ? (
                    <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: t.danger }}>
                      <Copy size={12} weight={800} color="#FFFFFF">{tab.badge}</Copy>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <Copy size={13} color={t.navMuted} style={{ paddingHorizontal: 12 }}>
              {account.parentName}
            </Copy>
          </View>
        ) : null}
        <ScrollView
          key={page}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={loading && !!data} onRefresh={() => void refresh(true)} tintColor={t.ink} />
          }
          contentContainerStyle={[
            s.body,
            { paddingTop: Platform.OS === 'web' ? 20 : 12 },
            wide && { width: '100%', maxWidth: 880, alignSelf: 'center', paddingHorizontal: 40, paddingTop: 36, paddingBottom: 48 },
          ]}
        >
          {!!error && data && (
            <Card style={{ padding: 14, gap: 8 }}>
              <Copy color={t.danger} size={14}>
                {error}
              </Copy>
              <Copy size={13} color={t.muted}>
                Showing the last loaded data. Changes require a connection.
              </Copy>
              <Button onPress={() => void refresh(true)}>Refresh</Button>
            </Card>
          )}
          {accessMode === 'child' ? (
            <View accessibilityRole="summary" style={[s.spread, { padding: 10, borderRadius: 14, backgroundColor: t.soft }]}>
              <Copy size={13} weight={800}>{`Child mode · ${activeChildName}`}</Copy>
              <Button textSize={12} onPress={() => navigate('more')} style={{ minHeight: 36 }}>Parent unlock</Button>
            </View>
          ) : elevated ? (
            <View accessibilityRole="summary" style={[s.spread, { padding: 10, borderRadius: 14, backgroundColor: t.soft }]}>
              <Copy size={13} weight={800} style={{ flex: 1 }}>Parent unlocked · locks after 15 idle minutes</Copy>
              <Button textSize={12} disabled={busy} onPress={() => void lockParent()} style={{ minHeight: 36 }}>Lock</Button>
            </View>
          ) : null}
          {!!notice && (
            <Copy size={13} color={t.ok}>
              {notice}
            </Copy>
          )}
          {renderContent()}
        </ScrollView>
        </View>
        {!wide && <View style={{ position: 'relative', zIndex: 2 }}>
        {voice.phase !== 'idle' ? (
          // Rides on top of the tab bar (so it moves up with the keyboard) and clears the raised mic.
          <VoicePanel voice={voice} onReview={() => navigate('approvals')} bottom={tabBarHeight + MIC_RAISE + 14} />
        ) : null}
        <View
          accessibilityRole="tablist"
          onLayout={(event) => setTabBarHeight(Math.round(event.nativeEvent.layout.height))}
          style={{
            position: 'relative',
            zIndex: 2,
            flexDirection: 'row',
            gap: showMic ? 0 : 4,
            paddingHorizontal: showMic ? 6 : 12,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 24),
            borderTopWidth: 1,
            borderColor: t.navLine,
            backgroundColor: t.nav,
          }}
        >
          {phoneTabs.map((tab, index) => {
            const selected = phoneTabPage === tab.page;
            return (
            <React.Fragment key={tab.page}>
            {showMic && index === 2 ? <MicButton voice={voice} /> : null}
            <Pressable
              accessibilityRole="tab"
              accessibilityLabel={tab.badge ? `${tab.label}, ${tab.badge} waiting` : tab.label}
              accessibilityState={{ selected }}
              aria-selected={selected}
              onPress={() => navigate(tab.page)}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 58, alignItems: 'center', justifyContent: 'center', opacity: pressed && !selected ? 0.7 : 1 })}
            >
              {/* The current tab sits on a filled pill so it reads at a glance. */}
              <View
                style={{
                  width: '100%', maxWidth: 78, minHeight: 54, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 16,
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                  backgroundColor: selected ? t.navActive : 'transparent',
                }}
              >
                <View>
                  <Icon name={tab.icon} color={selected ? t.navActiveInk : t.navMuted} />
                  {tab.badge ? (
                    <View style={{ position: 'absolute', top: -4, right: -7, width: 12, height: 12, borderRadius: 6, borderWidth: 2,
                      borderColor: selected ? t.navActive : t.nav, backgroundColor: t.danger }} />
                  ) : null}
                </View>
                <Copy size={11} weight={selected ? 800 : 600} color={selected ? t.navActiveInk : t.navMuted}>
                  {tab.label}
                </Copy>
              </View>
            </Pressable>
            </React.Fragment>
            );
          })}
        </View>
        </View>}
        <Modal
          visible={!!editor}
          transparent={wide}
          animationType={wide ? 'fade' : 'slide'}
          onRequestClose={() => {
            if (!busy) setEditor(null);
            setConfirm(null);
          }}
        >
          <View style={wide ? { flex: 1, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', padding: 32 } : { flex: 1 }}>
          <View style={wide ? { width: '100%', maxWidth: 680, height: '100%', maxHeight: 860, borderRadius: 22, overflow: 'hidden', backgroundColor: t.bg } : { flex: 1 }}>
          {editor && data && editor.kind === 'event' && editor.item?.calendarId ? (
            <ThemeContext.Provider value={t}>
              <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
                <SyncedEventSheet data={data} event={editor.item} onClose={() => setEditor(null)} />
              </SafeAreaView>
            </ThemeContext.Provider>
          ) : null}
          {editor && data && !(editor.kind === 'event' && editor.item?.calendarId) && (
            <ThemeContext.Provider value={t}>
              <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <EditorForm
                    key={`${editor.kind}:${editor.item?.id || 'new'}`}
                    editor={editor}
                    household={data}
                    date={selectedDate}
                    busy={busy}
                    error={error}
                    onCancel={() => {
                      setEditor(null);
                      setError('');
                    }}
                    onDelete={
                      editor.kind === 'event' && editor.item
                        ? () =>
                            setConfirm({
                              title: `Delete “${editor.item?.title}” from your calendar?`,
                              action: async () => {
                                if (await mutate('deleteEvent', { id: editor.item?.id }, editRevision.current))
                                  setEditor(null);
                              },
                            })
                        : undefined
                    }
                    onReload={() => {
                      void (async () => {
                        try {
                          const result = await api.household();
                          setData(result);
                          editRevision.current = result.revision;
                          setEditor(null);
                          setNotice('Latest household loaded. Reopen the item to make your change.');
                          setError('');
                        } catch {
                          setError('Could not refresh. Check your connection.');
                        }
                      })();
                    }}
                    onSave={async (kind, value) => {
                      if (await mutate(kind, value, editRevision.current)) setEditor(null);
                    }}
                  />
                </KeyboardAvoidingView>
                {!!confirm && (
                  <View
                    accessibilityViewIsModal
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      right: 0,
                      backgroundColor: '#00000088',
                      justifyContent: 'center',
                      padding: 24,
                    }}
                  >
                    {confirmation}
                  </View>
                )}
              </SafeAreaView>
            </ThemeContext.Provider>
          )}
          </View>
          </View>
        </Modal>
        <Modal visible={!!confirm && !editor} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
          <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}>
            {confirmation}
          </View>
        </Modal>
        <Modal visible={addSheet} transparent animationType="fade" onRequestClose={() => setAddSheet(false)}>
          <Pressable accessibilityLabel="Close" onPress={() => setAddSheet(false)} style={{ flex: 1, backgroundColor: '#00000066', justifyContent: wide ? 'center' : 'flex-end' }}>
            <Card style={[{ margin: 12, marginBottom: Math.max(insets.bottom, 12), borderRadius: 22 }, dialog]}>
              <NavRow icon="calendar" title="New event" subtitle="Add it to the family calendar" onPress={() => { setAddSheet(false); openEditor({ kind: 'event' }); }} />
              <NavRow icon="import" title="From a flyer, email, or file" subtitle="Take a photo or choose a PDF, email, or team calendar" onPress={() => { setAddSheet(false); navigate('imports'); }} />
              <NavRow icon="refresh" title="Connect Google, iCloud, or Outlook" subtitle="Keep a calendar you already use in sync" onPress={() => { setAddSheet(false); navigate('calendars'); }} />
              <NavRow icon="chores" title="New chore" subtitle="Assign it and set its stars" last onPress={() => { setAddSheet(false); openEditor({ kind: 'chore' }); }} />
            </Card>
          </Pressable>
        </Modal>
        <Modal visible={childPicker} transparent animationType="fade" onRequestClose={() => setChildPicker(false)}>
          <Pressable accessibilityLabel="Close" onPress={() => setChildPicker(false)} style={{ flex: 1, backgroundColor: '#00000066', justifyContent: wide ? 'center' : 'flex-end' }}>
            <Card style={[{ margin: 12, marginBottom: Math.max(insets.bottom, 12), borderRadius: 22, padding: 16, gap: 10 }, dialog]}>
              <Heading small>Hand this phone to…</Heading>
              <Copy size={13} color={t.muted}>They’ll see their own chores and rewards. Your four-digit code unlocks parent mode again.</Copy>
              {(data?.members || []).filter((m) => m.role === 'child').map((m) => (
                <Button key={m.id} disabled={busy || !api.startChildSession} onPress={() => { setChildPicker(false); void enterChildMode(m.id); }}>{m.name}</Button>
              ))}
            </Card>
          </Pressable>
        </Modal>
        <StarCelebration message={celebration?.message || null} detail={celebration?.detail} onDone={() => setCelebration(null)} />
        <Modal visible={!!groceryReview} transparent animationType="fade" onRequestClose={() => setGroceryReview(null)}>
          <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}>
            <Card style={[{ padding: 20, gap: 12 }, dialog]}>
              <Heading small>Add to Groceries?</Heading>
              <Copy size={13} color={t.muted}>Review before adding. Matching items are combined; nothing is added twice.</Copy>
              {data && groceryReview
                ? groceryPlan(data, groceryReview).map((line) => (
                    <View key={`${line.name}|${line.unit}`} style={s.spread}>
                      <Copy size={15} style={{ flex: 1 }}>
                        {line.quantity !== null ? `${line.quantity}${line.unit ? ` ${line.unit}` : ''} ` : ''}
                        {line.name}
                      </Copy>
                      <Copy size={12} weight={700} color={line.action === 'add' ? t.ok : t.muted}>
                        {line.action === 'add' ? 'Add' : line.action === 'combine' ? 'Combine' : 'Already listed'}
                      </Copy>
                    </View>
                  ))
                : null}
              <View style={s.row}>
                <Button onPress={() => setGroceryReview(null)}>Cancel</Button>
                <Button
                  primary
                  disabled={busy}
                  onPress={() => {
                    const id = groceryReview;
                    setGroceryReview(null);
                    if (id) void mutate('mealGroceries', { id });
                  }}
                >
                  Add to Groceries
                </Button>
              </View>
            </Card>
          </View>
        </Modal>
        <Modal visible={listPrompt} transparent onRequestClose={() => setListPrompt(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}
          >
            <Card style={[{ padding: 20, gap: 16 }, dialog]}>
              <Input label="List name" value={listDraft} onChangeText={setListDraft} maxLength={60} />
              <Copy size={13} color={t.muted}>
                Your list is saved to the cloud when you add its first item.
              </Copy>
              <View style={s.row}>
                <Button onPress={() => setListPrompt(false)}>Cancel</Button>
                <Button
                  primary
                  disabled={!listDraft.trim()}
                  onPress={() => {
                    const name = listDraft.trim();
                    void mutate('list', { id: randomUUID(), name, kind: 'custom' }).then((saved) => {
                      if (!saved) return;
                      setList(name);
                      setListDraft('');
                      setListPrompt(false);
                    });
                  }}
                >
                  Create list
                </Button>
              </View>
            </Card>
          </KeyboardAvoidingView>
        </Modal>
        <Modal
          visible={pairPrompt}
          transparent
          animationType="fade"
          onRequestClose={() => !pairBusy && setPairPrompt(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}
          >
            <Card style={[{ padding: 20, gap: 14 }, dialog]}>
              <Heading small>Connect your TV</Heading>
              <Copy size={14} color={t.muted}>
                Enter the six digit code shown in Hometide TV Settings. The code expires after 10 minutes.
              </Copy>
              <Input
                label="TV pairing code"
                value={pairCode}
                onChangeText={(value: string) => setPairCode(value.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="123456"
              />
              {!!pairError && (
                <Copy size={13} color={t.danger}>
                  {pairError}
                </Copy>
              )}
              <View style={s.row}>
                <Button disabled={pairBusy} onPress={() => setPairPrompt(false)}>
                  Cancel
                </Button>
                <Button primary disabled={pairBusy || pairCode.length !== 6} onPress={() => void submitPairing()}>
                  {pairBusy ? 'Connecting…' : 'Approve TV'}
                </Button>
              </View>
            </Card>
          </KeyboardAvoidingView>
        </Modal>
        <Modal
          visible={!!unpairPrompt}
          transparent
          animationType="fade"
          onRequestClose={() => !pairBusy && setUnpairPrompt(null)}
        >
          <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}>
            <Card style={[{ padding: 20, gap: 14 }, dialog]}>
              <Heading small>Unpair {unpairPrompt?.deviceName}?</Heading>
              <Copy size={14} color={t.muted}>
                This revokes the TV session. It will lose access to household data on its next request.
              </Copy>
              {!!pairError && (
                <Copy size={13} color={t.danger}>
                  {pairError}
                </Copy>
              )}
              <View style={s.row}>
                <Button disabled={pairBusy} onPress={() => setUnpairPrompt(null)}>
                  Cancel
                </Button>
                <Button primary disabled={pairBusy} onPress={() => void revokeTV()}>
                  {pairBusy ? 'Unpairing…' : 'Unpair TV'}
                </Button>
              </View>
            </Card>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
