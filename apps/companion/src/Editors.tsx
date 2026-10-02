import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { randomUUID } from 'expo-crypto';
import { Button, Card, Copy, Input, Label, memberColors, memberTint, layout as s, useTheme } from './ui';
import { DateField, WebDateTimeInput } from './Pickers';
import {
  dateKey,
  validateEvent,
  type Chore,
  type Edit,
  type Event,
  type Household,
  type Meal,
  type Member,
} from './household';

export type Editor =
  | { kind: 'event'; item?: Event; preset?: Partial<Event> }
  | { kind: 'member'; item?: Member }
  | { kind: 'chore'; item?: Chore }
  | { kind: 'meal'; item?: Meal };
export function EditorForm({
  editor,
  household,
  date,
  onSave,
  onCancel,
  onDelete,
  busy,
  error,
  onReload,
}: {
  editor: Editor;
  household: Household;
  date: Date;
  onSave: (kind: Edit['kind'], value: object) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  busy: boolean;
  error: string;
  onReload: () => void;
}) {
  const t = useTheme();
  const initial = editor.item;
  const [id] = useState(() => initial?.id || randomUUID());
  const [title, setTitle] = useState(initial ? ('name' in initial ? initial.name : initial.title) : '');
  const event = editor.kind === 'event' ? editor.item : undefined;
  const preset = editor.kind === 'event' ? editor.preset : undefined;
  const meal = editor.kind === 'meal' ? editor.item : undefined;
  const chore = editor.kind === 'chore' ? editor.item : undefined;
  const member = editor.kind === 'member' ? editor.item : undefined;
  const [selected, setSelected] = useState<string[]>(
    event?.memberIds ||
      (preset?.teamId ? household.teams?.find((item) => item.id === preset.teamId)?.memberIds : undefined) ||
      meal?.cookIds ||
      (chore?.assignedToMemberId ? [chore.assignedToMemberId] : household.members[0] ? [household.members[0].id] : []),
  );
  const [start, setStart] = useState(
    event ? new Date(event.startAt) : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17),
  );
  const [end, setEnd] = useState(() => {
    if (!event) return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18);
    const value = new Date(event.endAt);
    if (event.allDay) value.setDate(value.getDate() - 1); // Stored all-day end is exclusive; the editor shows the last included day.
    return value;
  });
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [location, setLocation] = useState(event?.location || '');
  const [category, setCategory] = useState<Event['category']>(event?.category || preset?.category || 'family');
  const [teamId, setTeamId] = useState(event?.teamId || preset?.teamId || '');
  const team = household.teams?.find((item) => item.id === teamId);
  const [sportKind, setSportKind] = useState<'practice' | 'game'>(event?.sportKind || 'practice');
  const [arrival, setArrival] = useState(String(event?.arrivalMinutes ?? ''));
  const [travel, setTravel] = useState(String(event?.travelMinutes ?? ''));
  const [responsible, setResponsible] = useState(event?.responsibleMemberId || '');
  const [responsibility, setResponsibility] = useState<'pickup' | 'dropoff' | 'drive'>(event?.responsibilityType || 'pickup');
  const [prep, setPrep] = useState((event?.preparation || []).map((item) => item.label).join('\n'));
  const [repeatEvent, setRepeatEvent] = useState(false);
  const [points, setPoints] = useState(String(chore?.points ?? 1));
  const [choreRepeat, setChoreRepeat] = useState<'none' | 'daily' | 'weekly'>(chore?.recurrence || 'none');
  const [verifyPhoto, setVerifyPhoto] = useState(Boolean(chore?.verifyWithPhoto));
  const [photoHint, setPhotoHint] = useState(chore?.photoHint || '');
  const [role, setRole] = useState<Member['role']>(member?.role || 'child');
  const [color, setColor] = useState(member?.accentColor || memberColors[household.members.length % 5]);
  const [mealDate, setMealDate] = useState(meal?.date || dateKey(date));
  const [mealCategory, setMealCategory] = useState<Meal['category']>(meal?.category || 'Dinner');
  const [ingredients, setIngredients] = useState(meal?.ingredients.join('\n') || '');
  const [instructions, setInstructions] = useState(meal?.instructions.join('\n') || '');
  const [servings, setServings] = useState(String(meal?.servings || 4));
  const [minutes, setMinutes] = useState(String(meal?.minutes || 30));
  const [recipeId, setRecipeId] = useState(meal?.recipeId || '');
  const [repeatWeekly, setRepeatWeekly] = useState(meal?.recurrence === 'weekly');
  const [applyFuture, setApplyFuture] = useState(false);
  const [validation, setValidation] = useState('');
  const [picker, setPicker] = useState<{ field: 'start' | 'end'; mode: 'date' | 'time' } | null>(null);
  const toggleMember = (memberId: string) =>
    setSelected((values) =>
      editor.kind === 'chore'
        ? [memberId]
        : values.includes(memberId)
          ? values.filter((v) => v !== memberId)
          : [...values, memberId],
    );
  const save = async () => {
    setValidation('');
    if (!title.trim()) {
      setValidation('Enter a title or name.');
      return;
    }
    if (editor.kind === 'event') {
      const a = allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate()) : start;
      const b = allDay ? new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1) : end;
      const issue = validateEvent(title, a, b, selected);
      if (issue) {
        setValidation(issue);
        return;
      }
      const previousPrep = event?.preparation || [];
      const preparation = prep
        .split('\n')
        .map((label) => label.trim())
        .filter(Boolean)
        .slice(0, 20)
        .map((label, index) => previousPrep.find((item) => item.label === label) || { id: `prep-${index}-${label.slice(0, 20)}`, label, completed: false });
      const minutes = (value: string) => (/^\d{1,3}$/.test(value) ? Number(value) : null);
      await onSave('event', {
        ...event,
        id,
        familyId: household.family.id,
        title: title.trim(),
        category: team ? 'sports' : category,
        startAt: a.toISOString(),
        endAt: b.toISOString(),
        ownerMemberId: selected[0],
        memberIds: selected,
        location: location.trim() || null,
        source: 'manual',
        allDay,
        responsibleMemberId: responsible || null,
        responsibilityType: responsible ? responsibility : null,
        preparation: team && !event && !preparation.length ? [] : preparation,
        travelMinutes: minutes(travel),
        teamId: team ? team.id : null,
        sportKind: team ? sportKind : null,
        arrivalMinutes: team ? minutes(arrival) : null,
        ...(repeatEvent && !event ? { recurrence: 'weekly' } : {}),
      });
    } else if (editor.kind === 'member') {
      await onSave('member', {
        id,
        familyId: household.family.id,
        name: title.trim(),
        initials: title
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((x) => x[0])
          .join('')
          .toUpperCase(),
        role,
        accentColor: color,
      });
    } else if (editor.kind === 'chore') {
      const stars = Number(points);
      if (!Number.isInteger(stars) || stars < 0 || stars > 100) {
        setValidation('Stars must be a whole number from 0 to 100.');
        return;
      }
      await onSave('chore', {
        ...chore,
        id,
        familyId: household.family.id,
        title: title.trim(),
        assignedToMemberId: selected[0] || null,
        status: chore?.status || 'pending',
        points: stars,
        recurrence: choreRepeat === 'none' ? null : choreRepeat,
        verifyWithPhoto: verifyPhoto,
        photoHint: verifyPhoto ? photoHint.trim().slice(0, 160) || null : null,
      });
    } else {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(mealDate) ||
        !Number.isFinite(Date.parse(mealDate)) ||
        !Number.isInteger(Number(servings)) ||
        Number(servings) < 1 ||
        !Number.isInteger(Number(minutes)) ||
        Number(minutes) < 1
      ) {
        setValidation('Enter a valid date, serving count, and cooking time.');
        return;
      }
      const recipe = household.recipes?.find((item) => item.id === recipeId);
      const mealValue = {
        id,
        title: title.trim(),
        date: mealDate,
        category: mealCategory,
        cookIds: selected,
        servings: Number(servings),
        minutes: Number(minutes),
        ingredients: ingredients
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
        instructions: instructions
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
        recipeId: recipeId || null,
        recurrence: repeatWeekly ? 'weekly' : null,
      };
      await onSave(meal?.seriesId ? 'mealSeries' : 'meal', {
        ...mealValue,
        ...(meal?.seriesId ? { seriesId: meal.seriesId, applyToFuture: applyFuture } : {}),
        ...(recipe ? {
          ingredients: recipe.ingredients.map((item) => `${item.quantity ? `${item.quantity} ` : ''}${item.unit ? `${item.unit} ` : ''}${item.name}`),
          instructions: recipe.instructions,
        } : {}),
      });
    }
  };
  const timeLabel = (value: Date) => value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateLabel = (value: Date) =>
    value.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
        <Copy size={20} weight={800}>
          {initial ? 'Edit' : 'New'} {editor.kind === 'member' ? 'member' : editor.kind}
        </Copy>
        {!!(validation || error) && (
          <Card style={{ padding: 14, gap: 8 }}>
            <Copy color={t.danger}>{validation || error}</Copy>
            {error.includes('Refresh') && <Button onPress={onReload}>Reload latest · discard this draft</Button>}
          </Card>
        )}
        <Input
          label={editor.kind === 'member' ? 'Name' : 'Title'}
          value={title}
          onChangeText={setTitle}
          maxLength={editor.kind === 'member' ? 80 : 120}
          autoFocus
          placeholder={editor.kind === 'event' ? 'e.g. Soccer practice' : undefined}
        />
        {editor.kind !== 'member' && (
          <View style={s.section}>
            <Label>{editor.kind === 'event' ? 'WHO’S GOING' : editor.kind === 'meal' ? 'COOKS' : 'ASSIGNED TO'}</Label>
            <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
              {household.members.map((m, i) => {
                const tint = memberTint(i, t.bg === '#1A1714');
                const active = selected.includes(m.id);
                return (
                  <Pressable
                    key={m.id}
                    accessibilityRole="button"
                    accessibilityLabel={m.name}
                    accessibilityState={{ selected: active }}
                    onPress={() => toggleMember(m.id)}
                    style={{
                      minHeight: 44,
                      paddingLeft: 6,
                      paddingRight: 14,
                      borderRadius: 22,
                      borderWidth: 2,
                      borderColor: active ? m.accentColor : t.fieldBorder,
                      backgroundColor: active ? tint.backgroundColor : t.card,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: m.accentColor,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Copy color="#FFFFFF" size={13} weight={800}>
                        {m.initials}
                      </Copy>
                    </View>
                    <Copy size={15} weight={700} color={active ? tint.color : t.muted}>
                      {m.name}
                    </Copy>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        {editor.kind === 'event' && (
          <>
            <Card>
              <View style={[s.spread, { padding: 16 }]}>
                <Copy>All day</Copy>
                <Switch
                  accessibilityLabel="All day"
                  value={allDay}
                  onValueChange={setAllDay}
                  trackColor={{ true: t.ok }}
                />
              </View>
              {(['start', 'end'] as const).map((field) => {
                const value = field === 'start' ? start : end;
                return (
                  <View
                    key={field}
                    style={[s.spread, { padding: 12, borderTopWidth: 1, borderColor: t.line, flexWrap: 'wrap' }]}
                  >
                    <Copy>{field === 'start' ? 'Starts' : 'Ends'}</Copy>
                    <View style={[s.row, { gap: 6 }]}>
                      <Button label={`${field} date`} onPress={() => setPicker({ field, mode: 'date' })}>
                        {dateLabel(value)}
                      </Button>
                      {!allDay && (
                        <Button label={`${field} time`} onPress={() => setPicker({ field, mode: 'time' })}>
                          {timeLabel(value)}
                        </Button>
                      )}
                    </View>
                  </View>
                );
              })}
            </Card>
            {picker && (
              <Card style={{ padding: 12, gap: 8 }}>
                {Platform.OS === 'web' ? (
                  <WebDateTimeInput
                    label={`${picker.field} ${picker.mode}`}
                    mode={picker.mode}
                    value={picker.field === 'start' ? start : end}
                    onChange={(value) => (picker.field === 'start' ? setStart : setEnd)(value)}
                  />
                ) : (
                  <DateTimePicker
                    value={picker.field === 'start' ? start : end}
                    mode={picker.mode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    themeVariant={t.bg === '#1A1714' ? 'dark' : 'light'}
                    onChange={(_event, value) => {
                      if (value) (picker.field === 'start' ? setStart : setEnd)(value);
                      if (Platform.OS !== 'ios') setPicker(null);
                    }}
                  />
                )}
                <Button onPress={() => setPicker(null)}>Done</Button>
              </Card>
            )}
            <Copy size={13} color={t.muted}>
              Times use this phone’s timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.
            </Copy>
            <Input
              label="Location"
              placeholder="Add a place"
              value={location}
              onChangeText={setLocation}
              maxLength={240}
            />
            <Label>CATEGORY</Label>
            <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
              {(['family', 'school', 'appointment', 'sports', 'meal', 'pickup', 'dropoff', 'drive'] as const).map(
                (c) => (
                  <Button key={c} primary={category === c} onPress={() => setCategory(c)}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </Button>
                ),
              )}
            </View>
            {household.teams?.length ? (
              <View style={s.section}>
                <Label>TEAM</Label>
                <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
                  <Button primary={!teamId} onPress={() => setTeamId('')}>No team</Button>
                  {household.teams.map((item) => (
                    <Button key={item.id} primary={teamId === item.id} onPress={() => { setTeamId(item.id); setSelected(item.memberIds); }}>{item.name}</Button>
                  ))}
                </View>
                {team ? (
                  <>
                    <View style={s.row}>
                      {(['practice', 'game'] as const).map((kind) => (
                        <Button key={kind} primary={sportKind === kind} onPress={() => setSportKind(kind)}>{kind === 'game' ? 'Game' : 'Practice'}</Button>
                      ))}
                    </View>
                    <Input label="Arrive early (minutes)" value={arrival} onChangeText={(v: string) => setArrival(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
                    <Copy size={13} color={t.muted}>
                      {event ? 'Driver and gear stay as set below.' : `The next carpool driver (${team.driverIds.length ? 'rotating' : 'none set'}), ${team.uniform ? `uniform (${team.uniform}), ` : ''}and the team gear list are filled in automatically.`}
                    </Copy>
                  </>
                ) : null}
              </View>
            ) : null}
            <Input label="Travel time (minutes)" value={travel} onChangeText={(v: string) => setTravel(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="Used for leave-by reminders" />
            {!(team && !event) ? (
              <View style={s.section}>
                <Label>WHO IS RESPONSIBLE?</Label>
                <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
                  <Button primary={!responsible} onPress={() => setResponsible('')}>Nobody</Button>
                  {household.members.filter((m) => m.role === 'adult').map((m) => (
                    <Button key={m.id} primary={responsible === m.id} onPress={() => setResponsible(m.id)}>{m.name}</Button>
                  ))}
                </View>
                {responsible ? (
                  <View style={s.row}>
                    {(['pickup', 'dropoff', 'drive'] as const).map((kind) => (
                      <Button key={kind} primary={responsibility === kind} onPress={() => setResponsibility(kind)}>{kind === 'dropoff' ? 'Drop-off' : kind[0].toUpperCase() + kind.slice(1)}</Button>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
            {!(team && !event) ? (
              <Input label="Bring or prepare · one per line" value={prep} onChangeText={setPrep} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} placeholder="e.g. Water bottle" />
            ) : null}
            {!event ? (
              <View style={[s.spread, { padding: 12 }]}>
                <Copy>Repeat weekly for 12 weeks</Copy>
                <Switch accessibilityLabel="Repeat event weekly" value={repeatEvent} onValueChange={setRepeatEvent} />
              </View>
            ) : event.seriesId ? (
              <Copy size={13} color={t.muted}>This is one date in a weekly series. Changes apply to this date only.</Copy>
            ) : null}
          </>
        )}
        {editor.kind === 'chore' && (
          <>
            <Input label="Stars earned" value={points} onChangeText={(v: string) => setPoints(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
            <View style={s.row}>
              {(['none', 'daily', 'weekly'] as const).map((value) => (
                <Button key={value} primary={choreRepeat === value} onPress={() => setChoreRepeat(value)}>{value === 'none' ? 'Once' : value === 'daily' ? 'Daily' : 'Weekly'}</Button>
              ))}
            </View>
            <View style={[s.spread, { padding: 12 }]}>
              <View style={s.grow}>
                <Copy>Verify with photo</Copy>
                <Copy size={13} color={t.muted}>The child sends a photo; you approve stars. AI gives advice only.</Copy>
              </View>
              <Switch accessibilityLabel="Verify with photo" value={verifyPhoto} onValueChange={setVerifyPhoto} />
            </View>
            {verifyPhoto ? (
              <Input label="What does done look like?" value={photoHint} onChangeText={setPhotoHint} maxLength={160} placeholder="e.g. bed made, pillows on top" />
            ) : null}
          </>
        )}
        {editor.kind === 'member' && (
          <>
            <Label>PROFILE</Label>
            <View style={s.row}>
              {(['adult', 'child'] as const).map((r) => (
                <Button key={r} primary={role === r} onPress={() => setRole(r)}>
                  {r === 'adult' ? 'Adult' : 'Child'}
                </Button>
              ))}
            </View>
            <Copy size={13} color={t.muted}>
              Profiles organize your calendar. Adding an adult profile does not give them account access.
            </Copy>
            <Label>COLOR</Label>
            <View style={s.row}>
              {memberColors.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Color ${c}`}
                  accessibilityState={{ selected: c === color }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: c,
                    borderColor: t.ink,
                    borderWidth: c === color ? 3 : 0,
                  }}
                />
              ))}
            </View>
          </>
        )}
        {editor.kind === 'meal' && (
          <>
            {household.recipes?.length ? (
              <View style={s.section}>
                <Label>SAVED RECIPE</Label>
                <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
                  <Button onPress={() => setRecipeId('')} style={{ backgroundColor: recipeId ? t.soft : t.card }}>No saved recipe</Button>
                  {household.recipes.map((recipe) => (
                    <Button key={recipe.id} onPress={() => { setRecipeId(recipe.id); setTitle(recipe.name); }}
                      style={{ backgroundColor: recipeId === recipe.id ? t.card : t.soft }}>{recipe.name}</Button>
                  ))}
                </View>
              </View>
            ) : null}
            <DateField label="Date" value={mealDate} onChange={setMealDate} />
            <View style={s.row}>
              {(['Breakfast', 'Lunch', 'Dinner'] as const).map((c) => (
                <Button key={c} primary={mealCategory === c} onPress={() => setMealCategory(c)}>
                  {c}
                </Button>
              ))}
            </View>
            <View style={s.row}>
              <View style={s.grow}>
                <Input label="Serves" keyboardType="number-pad" value={servings} onChangeText={setServings} />
              </View>
              <View style={s.grow}>
                <Input label="Minutes" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} />
              </View>
            </View>
            <Input
              label="Ingredients · one per line"
              multiline
              value={ingredients}
              onChangeText={setIngredients}
              style={{ minHeight: 120, textAlignVertical: 'top', fontSize: 16 }}
            />
            <Input
              label="Instructions · one step per line"
              multiline
              value={instructions}
              onChangeText={setInstructions}
              style={{ minHeight: 140, textAlignVertical: 'top', fontSize: 16 }}
            />
            <View style={[s.spread, { padding: 12 }]}>
              <Copy>Repeat weekly for 12 weeks</Copy>
              <Switch accessibilityLabel="Repeat weekly" value={repeatWeekly} onValueChange={setRepeatWeekly} />
            </View>
            {meal?.seriesId ? (
              <View style={[s.spread, { padding: 12 }]}>
                <Copy>Also update future dates</Copy>
                <Switch accessibilityLabel="Apply meal changes to future dates" value={applyFuture} onValueChange={setApplyFuture} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <View
        style={{
          borderTopWidth: 1,
          borderColor: t.line,
          backgroundColor: t.bg,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        {onDelete && (
          <Button icon="trash" onPress={onDelete} disabled={busy} style={{ alignSelf: 'flex-start' }}>
            Delete event
          </Button>
        )}
        <View style={[s.row, { gap: 12 }]}>
          <Button onPress={onCancel} disabled={busy} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button primary disabled={busy} onPress={() => void save()} style={{ flex: 1 }}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </View>
      </View>
    </View>
  );
}
