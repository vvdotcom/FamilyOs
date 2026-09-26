import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { randomUUID } from 'expo-crypto';
import { Button, Card, Copy, Input, Label, memberColors, memberTint, layout as s, useTheme } from './ui';
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
  | { kind: 'event'; item?: Event }
  | { kind: 'member'; item?: Member }
  | { kind: 'chore'; item?: Chore }
  | { kind: 'meal'; item?: Meal };
export function EditorForm({
  editor,
  household,
  date,
  onSave,
  onCancel,
  busy,
  error,
  onReload,
}: {
  editor: Editor;
  household: Household;
  date: Date;
  onSave: (kind: Edit['kind'], value: object) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
  error: string;
  onReload: () => void;
}) {
  const t = useTheme();
  const initial = editor.item;
  const [id] = useState(() => initial?.id || randomUUID());
  const [title, setTitle] = useState(initial ? ('name' in initial ? initial.name : initial.title) : '');
  const event = editor.kind === 'event' ? editor.item : undefined;
  const meal = editor.kind === 'meal' ? editor.item : undefined;
  const chore = editor.kind === 'chore' ? editor.item : undefined;
  const member = editor.kind === 'member' ? editor.item : undefined;
  const [selected, setSelected] = useState<string[]>(
    event?.memberIds ||
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
  const [category, setCategory] = useState<Event['category']>(event?.category || 'family');
  const [role, setRole] = useState<Member['role']>(member?.role || 'child');
  const [color, setColor] = useState(member?.accentColor || memberColors[household.members.length % 5]);
  const [mealDate, setMealDate] = useState(meal?.date || dateKey(date));
  const [mealCategory, setMealCategory] = useState<Meal['category']>(meal?.category || 'Dinner');
  const [ingredients, setIngredients] = useState(meal?.ingredients.join('\n') || '');
  const [instructions, setInstructions] = useState(meal?.instructions.join('\n') || '');
  const [servings, setServings] = useState(String(meal?.servings || 4));
  const [minutes, setMinutes] = useState(String(meal?.minutes || 30));
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
      await onSave('event', {
        ...event,
        id,
        familyId: household.family.id,
        title: title.trim(),
        category,
        startAt: a.toISOString(),
        endAt: b.toISOString(),
        ownerMemberId: selected[0],
        memberIds: selected,
        location: location.trim() || null,
        source: 'manual',
        allDay,
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
      await onSave('chore', {
        ...chore,
        id,
        familyId: household.family.id,
        title: title.trim(),
        assignedToMemberId: selected[0] || null,
        status: chore?.status || 'pending',
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
      await onSave('meal', {
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
      });
    }
  };
  const timeLabel = (value: Date) => value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateLabel = (value: Date) =>
    value.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
      <View style={s.spread}>
        <Button onPress={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Copy size={17} weight={800}>
          {initial ? 'Edit' : 'New'} {editor.kind === 'member' ? 'member' : editor.kind}
        </Copy>
        <Button primary disabled={busy} onPress={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </View>
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
                <Input
                  label={`${picker.field} ${picker.mode} (${picker.mode === 'date' ? 'YYYY-MM-DD' : 'HH:MM'})`}
                  defaultValue={
                    picker.mode === 'date'
                      ? dateKey(picker.field === 'start' ? start : end)
                      : `${(picker.field === 'start' ? start : end).getHours().toString().padStart(2, '0')}:${(picker.field === 'start' ? start : end).getMinutes().toString().padStart(2, '0')}`
                  }
                  onChangeText={(v) => {
                    const current = new Date(picker.field === 'start' ? start : end);
                    if (picker.mode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
                      const [y, m, d] = v.split('-').map(Number);
                      current.setFullYear(y, m - 1, d);
                    } else if (picker.mode === 'time' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
                      const [h, m] = v.split(':').map(Number);
                      current.setHours(h, m);
                    } else return;
                    (picker.field === 'start' ? setStart : setEnd)(current);
                  }}
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
            {(['family', 'school', 'appointment', 'sports', 'meal', 'pickup', 'dropoff', 'drive'] as const).map((c) => (
              <Button key={c} primary={category === c} onPress={() => setCategory(c)}>
                {c[0].toUpperCase() + c.slice(1)}
              </Button>
            ))}
          </View>
          <Card style={{ padding: 16 }}>
            <Copy size={14} color={t.muted}>
              Saved to your household calendar. TV pop-ups, recurring events, and reminders will be connected in a later
              update.
            </Copy>
          </Card>
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
          <Input label="Date (YYYY-MM-DD)" value={mealDate} onChangeText={setMealDate} />
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
        </>
      )}
    </ScrollView>
  );
}
