import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import {
  dateKey,
  eventsForDay,
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
  type IconName,
} from './ui';

type Page = 'today' | 'lists' | 'remote' | 'settings' | 'chores' | 'members' | 'meal' | 'grocery';
type Props = {
  api: HouseholdAPI;
  account: ParentAccount;
  dark: boolean;
  appearance: Appearance;
  onAppearance: (value: Appearance) => Promise<void>;
  onSignOut: () => void;
  onServerSettings: () => void;
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
  preview = false,
}: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<Page>('today');
  const [data, setData] = useState<Household | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const editRevision = useRef(0);
  const [confirm, setConfirm] = useState<{ title: string; action: () => Promise<void> } | null>(null);
  const [list, setList] = useState('Groceries');
  const [newItem, setNewItem] = useState('');
  const [listPrompt, setListPrompt] = useState(false);
  const [listDraft, setListDraft] = useState('');
  const [customLists, setCustomLists] = useState<string[]>([]);
  const [pairedTVs, setPairedTVs] = useState<PairedTV[]>([]);
  const [pairPrompt, setPairPrompt] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [pairError, setPairError] = useState('');
  const [pairBusy, setPairBusy] = useState(false);
  const [unpairPrompt, setUnpairPrompt] = useState<PairedTV | null>(null);
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
          });
          setLastSync(new Date());
          setError('');
        }
      } catch (e) {
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
  const navigate = (next: Page) => {
    setPage(next);
    setNotice('');
    if (next === 'remote' && api.pairedTVs) {
      void api.pairedTVs().then(setPairedTVs).catch((e) => {
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
    if (!data) return;
    editRevision.current = data.revision;
    setError('');
    setEditor(next);
  };
  const mutate = async (kind: Edit['kind'], value: object, revision = data?.revision) => {
    if (!data || revision === undefined || writing.current) return false;
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
      if (alive.current) setError(e instanceof Error ? e.message : 'Could not save. Your edit has not been confirmed.');
      return false;
    } finally {
      writing.current = false;
      if (alive.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  };
  const days = weekDays(selectedDate);
  const events = data ? eventsForDay(data.events, selectedDate) : [];
  const meals = data?.meals.filter((m) => m.date === dateKey(selectedDate)) || [];
  const meal = meals.find((m) => m.category === 'Dinner') || meals[0];
  const listNames = Array.from(
    new Set(['Groceries', 'Weekend', 'Camping', ...customLists, ...(data?.listItems.map((i) => i.listName) || [])]),
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
            TV pairing is not connected yet
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
      accessibilityState={{ checked: item.completed, disabled: busy }}
      aria-checked={item.completed}
      disabled={busy}
      onPress={() => void mutate('listItem', { ...item, completed: !item.completed })}
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
          {item.addedBy}
        </Copy>
      )}
    </Pressable>
  );
  const chooseWeek = (offset: number) =>
    setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset * 7, 12));
  const sectionLink = (title: string, subtitle: string, icon: IconName, next: Page) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => navigate(next)}
      style={[s.row, { padding: 16, minHeight: 64, borderBottomWidth: 1, borderColor: t.line }]}
    >
      <Icon name={icon} />
      <View style={s.grow}>
        <Copy>{title}</Copy>
        <Copy size={13} color={t.muted}>
          {subtitle}
        </Copy>
      </View>
      <Icon name="right" size={18} color={t.muted} />
    </Pressable>
  );
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
      case 'today':
        return (
          <>
            <View style={[s.spread, { alignItems: 'flex-end' }]}>
              <View style={[s.grow, { gap: 2 }]}>
                <Label>
                  {greeting}, {account.parentName.split(' ')[0].toUpperCase()}
                </Label>
                <Heading>
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </Heading>
              </View>
              <Button
                label="Add event"
                icon="plus"
                primary
                onPress={() => openEditor({ kind: 'event' })}
                style={{ width: 48, height: 48, paddingHorizontal: 0, borderRadius: 24 }}
              />
            </View>
            {tvCard}
            {weekStrip}
            <View style={s.section}>
              <Label>
                {dateKey(selectedDate) === dateKey(new Date()) ? 'TODAY' : 'SCHEDULE'} · {events.length}{' '}
                {events.length === 1 ? 'EVENT' : 'EVENTS'}
              </Label>
              {!events.length && (
                <Card style={{ padding: 20, gap: 10 }}>
                  <Copy weight={700}>A little room in your day.</Copy>
                  <Copy size={14} color={t.muted}>
                    Add your first event to start the family calendar.
                  </Copy>
                  <Button icon="plus" onPress={() => openEditor({ kind: 'event' })}>
                    Add event
                  </Button>
                </Card>
              )}
              {events.map((event) => {
                const index =
                  event.memberIds.length === data.members.length && data.members.length > 1
                    ? 4
                    : Math.max(
                        0,
                        data.members.findIndex((m) => m.id === event.ownerMemberId),
                      );
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
                      accessibilityLabel={`Edit ${event.title}`}
                      onPress={() => openEditor({ kind: 'event', item: event })}
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
                      </Copy>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            <View style={[s.row, { gap: 10, alignItems: 'stretch' }]}>
              <Pressable
                accessibilityRole="button"
                style={s.grow}
                onPress={() => {
                  setList('Groceries');
                  navigate('grocery');
                }}
              >
                <Card style={{ padding: 14, gap: 2, flex: 1 }}>
                  <Label>GROCERIES</Label>
                  <Copy size={17} weight={700}>
                    {groceries.filter((i) => !i.completed).length} items to buy
                  </Copy>
                </Card>
              </Pressable>
              <Pressable accessibilityRole="button" style={s.grow} onPress={() => navigate('meal')}>
                <Card style={{ padding: 14, gap: 2, flex: 1 }}>
                  <Label>TONIGHT</Label>
                  <Copy size={17} weight={700}>
                    {meal?.title || 'Plan a meal'}
                  </Copy>
                </Card>
              </Pressable>
            </View>
            <View style={s.spread}>
              <Button label="Previous week" icon="left" onPress={() => chooseWeek(-1)} />
              <Button onPress={() => setSelectedDate(new Date())}>Today</Button>
              <Button label="Next week" icon="right" onPress={() => chooseWeek(1)} />
            </View>
            <Card>
              {sectionLink(
                'Family chores',
                `${data.chores.filter((c) => c.status === 'pending').length} to do`,
                'chores',
                'chores',
              )}
              {sectionLink('Your family', `${data.members.length} profiles`, 'people', 'members')}
            </Card>
          </>
        );
      case 'lists':
        return (
          <>
            <View style={[s.spread, { alignItems: 'flex-end' }]}>
              <View style={[s.grow, { gap: 2 }]}>
                <Label>YOUR SHARED HOUSEHOLD LISTS</Label>
                <Heading>{list}</Heading>
              </View>
              <View style={{ padding: 8, borderRadius: 12, backgroundColor: t.soft }}>
                <Copy size={14} weight={700} color={t.muted}>
                  {items.filter((i) => !i.completed).length} left
                </Copy>
              </View>
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
              <Button label="New list" icon="plus" onPress={() => setListPrompt(true)} />
            </ScrollView>
            {itemInput}
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
            {itemInput}
          </>
        );
      case 'meal':
        return (
          <>
            {back('today', 'Today')}
            <View style={s.spread}>
              <Heading small>Meal plan</Heading>
              <Button label="Add meal" icon="plus" onPress={() => openEditor({ kind: 'meal' })} />
            </View>
            {weekStrip}
            {!meals.length ? (
              <Card style={{ padding: 22, gap: 16 }}>
                <Heading small>What’s for dinner?</Heading>
                <Copy color={t.muted}>No meal planned for this day.</Copy>
                <Button primary onPress={() => openEditor({ kind: 'meal' })}>
                  Plan a meal
                </Button>
              </Card>
            ) : (
              meals.map((m) => (
                <Card key={m.id} style={{ padding: 20, gap: 18, borderRadius: 24 }}>
                  <Heading small>{m.title}</Heading>
                  <View style={s.row}>
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
                  </View>
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
                    disabled={busy || !m.ingredients.length}
                    icon="lists"
                    onPress={() => void mutate('mealGroceries' as Edit['kind'], { id: m.id })}
                  >
                    Add ingredients to Groceries
                  </Button>
                </Card>
              ))
            )}
          </>
        );
      case 'chores':
        return (
          <>
            {back('today', 'Today')}
            <View style={s.spread}>
              <Heading>Family chores</Heading>
              <Button label="Add chore" primary icon="plus" onPress={() => openEditor({ kind: 'chore' })} />
            </View>
            <Copy color={t.muted}>
              {data.chores.filter((c) => c.status === 'completed').length} of {data.chores.length} done
            </Copy>
            <Card>
              {!data.chores.length && (
                <Copy style={{ padding: 20 }} color={t.muted}>
                  No chores yet. Add one for your family.
                </Copy>
              )}
              {data.chores.map((chore) => (
                <View key={chore.id} style={[s.row, { padding: 12, borderBottomWidth: 1, borderColor: t.line }]}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={chore.title}
                    accessibilityState={{ checked: chore.status === 'completed', disabled: busy }}
                    aria-checked={chore.status === 'completed'}
                    disabled={busy}
                    onPress={() =>
                      void mutate('chore', { ...chore, status: chore.status === 'completed' ? 'pending' : 'completed' })
                    }
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
                      </Copy>
                    </View>
                  </Pressable>
                  <Button
                    label={`Edit ${chore.title}`}
                    icon="edit"
                    onPress={() => openEditor({ kind: 'chore', item: chore })}
                  />
                </View>
              ))}
            </Card>
          </>
        );
      case 'members':
        return (
          <>
            {back('settings', 'Settings')}
            <View style={s.spread}>
              <Heading>Your family</Heading>
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
      case 'remote':
        return (
          <>
            <View style={s.spread}>
              <View style={s.grow}>
                <Label>YOUR FAMILY TV</Label>
                <Heading>Remote</Heading>
              </View>
              <Button
                label="Put TV to sleep · unavailable"
                icon="moon"
                disabled
                onPress={() => {}}
                style={{ width: 48, height: 48, borderRadius: 24 }}
              />
            </View>
            {pairedTVs.length === 0 ? (
              <Card style={{ padding: 16, gap: 8 }}>
                <Copy weight={700}>No TV connected</Copy>
                <Copy size={14} color={t.muted}>
                  Show the pairing code in TV Settings, then enter it here to connect this TV to your household.
                </Copy>
                {preview ? (
                  <Copy size={13} color={t.muted}>Pairing is disabled in the sample design preview.</Copy>
                ) : (
                  <Button primary icon="tv" onPress={() => { setPairError(''); setPairPrompt(true); }}>
                    Pair a TV
                  </Button>
                )}
              </Card>
            ) : (
              <Card style={{ padding: 14, gap: 10 }}>
                <Copy weight={700}>Connected TVs</Copy>
                {pairedTVs.map((device) => (
                  <View key={device.deviceId} style={[s.spread, { paddingVertical: 8, borderTopWidth: 1, borderColor: t.line }]}>
                    <View style={s.grow}>
                      <Copy weight={700}>{device.deviceName}</Copy>
                      <Copy size={13} color={t.muted}>Household data sync is enabled</Copy>
                    </View>
                    <Button disabled={pairBusy} onPress={() => { setPairError(''); setUnpairPrompt(device); }}>
                      Unpair
                    </Button>
                  </View>
                ))}
                {!preview && <Button onPress={() => { setPairError(''); setPairCode(''); setPairPrompt(true); }}>Pair another TV</Button>}
              </Card>
            )}
          <Label>JUMP TO A SCREEN ON THE TV</Label>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['Calendar', 'Chores', 'Meals', 'Lists', 'Photos'] as const).map((name, i) => (
                <Button
                  key={name}
                  label={`${name} · TV not paired`}
                  textSize={12}
                  disabled
                  onPress={() => {}}
                  style={{
                    flex: 1,
                    minHeight: 68,
                    paddingHorizontal: 0,
                    borderRadius: 16,
                    flexDirection: 'column',
                    gap: 4,
                  }}
                  icon={(['calendar', 'chores', 'meals', 'lists', 'photos'] as IconName[])[i]}
                >
                  {name}
                </Button>
              ))}
            </View>
            <View
              style={{
                width: 232,
                height: 232,
                alignSelf: 'center',
                borderRadius: 116,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: t.card,
              }}
            >
              {(['up', 'down', 'left', 'right'] as const).map((name, i) => (
                <Button
                  key={name}
                  label={`${name} · TV not paired`}
                  icon={name}
                  disabled
                  onPress={() => {}}
                  style={[
                    {
                      position: 'absolute',
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: 'transparent',
                      paddingHorizontal: 0,
                    },
                    [
                      { top: 10, left: 88 },
                      { bottom: 10, left: 88 },
                      { top: 88, left: 10 },
                      { top: 88, right: 10 },
                    ][i],
                  ]}
                />
              ))}
              <Button
                disabled
                primary
                onPress={() => {}}
                style={{ position: 'absolute', top: 70, left: 70, width: 92, height: 92, borderRadius: 46 }}
              >
                OK
              </Button>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['Back', 'Home', 'Hold to talk', 'Options'] as const).map((name, i) => (
                <Button
                  key={name}
                  disabled
                  onPress={() => {}}
                  icon={(['back', 'home', 'mic', 'more'] as IconName[])[i]}
                  textSize={12}
                  style={{ flex: 1, minHeight: 64, paddingHorizontal: 4, flexDirection: 'column' }}
                >
                  {name}
                </Button>
              ))}
            </View>
          </>
        );
      case 'settings':
        return (
          <>
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
            <Card>
              {sectionLink('Family members', `${data.members.length} profiles`, 'people', 'members')}
              {sectionLink(
                'Family chores',
                `${data.chores.filter((c) => c.status === 'pending').length} to do`,
                'chores',
                'chores',
              )}
              <View style={{ padding: 16, gap: 4 }}>
                <Copy weight={700}>{account.householdName}</Copy>
                <Copy size={14} color={t.muted}>
                  {account.email}
                </Copy>
              </View>
            </Card>
            <Label>YOUR TV</Label>
            <Card>
              {sectionLink('Family TV', pairedTVs.length ? `${pairedTVs.length} TV${pairedTVs.length === 1 ? '' : 's'} paired` : 'Not paired', 'tv', 'remote')}
              <View style={[s.spread, { padding: 16 }]}>
                <View style={s.grow}>
                  <Copy>Show weather on TV</Copy>
                  <Copy size={13} color={t.muted}>
                    Available after TV integration
                  </Copy>
                </View>
                <Switch disabled value={false} accessibilityLabel="Show weather on TV · unavailable" />
              </View>
            </Card>
            <Label>WHEN YOU’RE AWAY</Label>
            <Card>
              <View style={[s.spread, { padding: 16 }]}>
                <View style={s.grow}>
                  <Copy>Notify me when plans change</Copy>
                  <Copy size={13} color={t.muted}>
                    Push notifications are not connected yet
                  </Copy>
                </View>
                <Switch disabled value={false} accessibilityLabel="Notifications · unavailable" />
              </View>
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
          </>
        );
    }
  };
  const confirmation = (
    <Card style={{ padding: 20, gap: 16 }}>
      <Copy weight={700}>{confirm?.title}</Copy>
      <Copy size={14} color={t.muted}>
        This removes the item from your household.
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
          Delete
        </Button>
      </View>
    </Card>
  );
  const tabPage =
    page === 'grocery'
      ? 'lists'
      : page === 'chores' || page === 'meal'
        ? 'today'
        : page === 'members'
          ? 'settings'
          : page;
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
        <ScrollView
          key={page}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={loading && !!data} onRefresh={() => void refresh(true)} tintColor={t.ink} />
          }
          contentContainerStyle={[s.body, { paddingTop: Platform.OS === 'web' ? 20 : 12 }]}
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
          {!!notice && (
            <Copy size={13} color={t.ok}>
              {notice}
            </Copy>
          )}
          {renderContent()}
        </ScrollView>
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: 'row',
            gap: 4,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 24),
            borderTopWidth: 1,
            borderColor: t.line,
            backgroundColor: t.card,
          }}
        >
          {(['today', 'lists', 'remote', 'settings'] as const).map((tab, i) => (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityLabel={tab[0].toUpperCase() + tab.slice(1)}
              accessibilityState={{ selected: tabPage === tab }}
              aria-selected={tabPage === tab}
              onPress={() => navigate(tab)}
              style={{ flex: 1, minHeight: 55, alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <Icon
                name={(['calendar', 'lists', 'remote', 'settings'] as IconName[])[i]}
                color={tabPage === tab ? t.ink : t.muted}
              />
              <Copy size={12} weight={tabPage === tab ? 800 : 600} color={tabPage === tab ? t.ink : t.muted}>
                {tab[0].toUpperCase() + tab.slice(1)}
              </Copy>
            </Pressable>
          ))}
        </View>
        <Modal
          visible={!!editor}
          animationType="slide"
          onRequestClose={() => {
            if (!busy) setEditor(null);
            setConfirm(null);
          }}
        >
          {editor && data && (
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
                  {editor.kind === 'event' && editor.item && (
                    <Button
                      icon="trash"
                      disabled={busy}
                      onPress={() =>
                        setConfirm({
                          title: `Delete “${editor.item?.title}” from your calendar?`,
                          action: async () => {
                            if (await mutate('deleteEvent', { id: editor.item?.id }, editRevision.current))
                              setEditor(null);
                          },
                        })
                      }
                      style={{ margin: 20 }}
                    >
                      Delete event
                    </Button>
                  )}
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
        </Modal>
        <Modal visible={!!confirm && !editor} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
          <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}>
            {confirmation}
          </View>
        </Modal>
        <Modal visible={listPrompt} transparent onRequestClose={() => setListPrompt(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}
          >
            <Card style={{ padding: 20, gap: 16 }}>
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
                    setCustomLists((names) => [...names, listDraft.trim()]);
                    setList(listDraft.trim());
                    setListDraft('');
                    setListPrompt(false);
                  }}
                >
                  Create list
                </Button>
              </View>
            </Card>
          </KeyboardAvoidingView>
        </Modal>
        <Modal visible={pairPrompt} transparent animationType="fade" onRequestClose={() => !pairBusy && setPairPrompt(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}
          >
            <Card style={{ padding: 20, gap: 14 }}>
              <Heading small>Connect your TV</Heading>
              <Copy size={14} color={t.muted}>Enter the six digit code shown in FamilyOS TV Settings. The code expires after 10 minutes.</Copy>
              <Input
                label="TV pairing code"
                value={pairCode}
                onChangeText={(value: string) => setPairCode(value.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="123456"
              />
              {!!pairError && <Copy size={13} color={t.danger}>{pairError}</Copy>}
              <View style={s.row}>
                <Button disabled={pairBusy} onPress={() => setPairPrompt(false)}>Cancel</Button>
                <Button primary disabled={pairBusy || pairCode.length !== 6} onPress={() => void submitPairing()}>
                  {pairBusy ? 'Connecting…' : 'Approve TV'}
                </Button>
              </View>
            </Card>
          </KeyboardAvoidingView>
        </Modal>
        <Modal visible={!!unpairPrompt} transparent animationType="fade" onRequestClose={() => !pairBusy && setUnpairPrompt(null)}>
          <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}>
            <Card style={{ padding: 20, gap: 14 }}>
              <Heading small>Unpair {unpairPrompt?.deviceName}?</Heading>
              <Copy size={14} color={t.muted}>This revokes the TV session. It will lose access to household data on its next request.</Copy>
              {!!pairError && <Copy size={13} color={t.danger}>{pairError}</Copy>}
              <View style={s.row}>
                <Button disabled={pairBusy} onPress={() => setUnpairPrompt(null)}>Cancel</Button>
                <Button primary disabled={pairBusy} onPress={() => void revokeTV()}>{pairBusy ? 'Unpairing…' : 'Unpair TV'}</Button>
              </View>
            </Card>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
