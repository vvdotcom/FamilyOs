import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import {
  SpatialNavigationNode,
  SpatialNavigationRoot,
  SpatialNavigationScrollView,
  useLockSpatialNavigation,
} from 'react-tv-space-navigation';
import {
  Check,
  DAction,
  DButton,
  DFooter,
  DIcon,
  DPanel,
  DRow,
  DText,
  designFont,
  formatDate,
  localDateKey,
  useDesignPalette,
} from '../design/DesignSystem';
import { calendarDays } from './FamilyCalendarScreen';
import { FamilyScreenProps } from './familyTypes';
import { mealTypes, Planner } from './plannerData';
import { usePageBack } from '../hooks/usePageBack';

type PlannerProps = FamilyScreenProps & { planner: Planner };
const ingredients = [
  '1 lb ground turkey',
  '8 corn tortillas',
  '1 packet taco seasoning',
  '1 cup shredded cheese',
  '2 avocados',
  '1 jar salsa verde',
  '2 limes',
  'Lettuce & tomatoes',
];
const shoppingNames = [
  'Ground turkey',
  'Tortillas',
  'Taco seasoning',
  'Shredded cheese',
  'Avocados (3)',
  'Salsa verde',
  'Limes',
  'Lettuce & tomatoes',
];
const instructions = [
  'Brown the turkey in a large skillet until fully cooked.',
  'Stir in the seasoning and ¼ cup water. Simmer 5 minutes.',
  'Warm the tortillas in a dry pan.',
  'Slice avocados and limes. Set out cheese, lettuce, tomatoes and salsa.',
  'Build tacos at the table.',
];

export function FamilyMealsScreen({ planner, now, household, focusActive, onNavigate }: PlannerProps) {
  const p = useDesignPalette();
  const today = localDateKey(now, household.family.timezone);
  const days = calendarDays(today);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [added, setAdded] = useState(false);
  const [needed, setNeeded] = useState<number[]>([0, 4, 5, 6]);
  const selectedTitle = selected ? planner.data.meals[selected] : '';
  usePageBack(() => {
    if (editing) {
      setEditing(false);
      if (!selectedTitle) setSelected(null);
    } else setSelected(null);
  }, selected !== null);
  const open = (key: string) => {
    setSelected(key);
    setAdded(false);
    setEditing(!planner.data.meals[key]);
    setDraft(planner.data.meals[key] ?? '');
  };
  const editor =
    editing && selected ? (
      <Editor
        title="Plan a meal"
        label="Meal name"
        value={draft}
        onChange={setDraft}
        onCancel={() => {
          setEditing(false);
          if (!selectedTitle) setSelected(null);
        }}
        onSave={() => {
          if (draft.trim()) {
            planner.setMeal(selected, draft);
            setEditing(false);
          }
        }}
      />
    ) : null;
  if (selected)
    return (
      <View style={{ flex: 1, gap: 24 }}>
        <DRow style={{ flex: 1, gap: 30 }}>
          <SpatialNavigationNode orientation="vertical">
            <View style={{ width: 480, gap: 12 }}>
              <DAction
                label="All meals"
                onPress={() => setSelected(null)}
                active={focusActive && !editing}
                style={{ height: 56, minHeight: 56 }}
              />
              {days.map((day) => {
                const key = `${day.key}:Dinner`;
                return (
                  <DButton
                    key={key}
                    label={`Dinner ${day.label}: ${planner.data.meals[key] || 'Plan'}`}
                    onPress={() => open(key)}
                    active={focusActive && !editing}
                    radius={20}
                    style={{
                      minHeight: 82,
                      flexDirection: 'row',
                      gap: 24,
                      alignItems: 'center',
                      padding: 16,
                      borderWidth: selected === key ? 3 : 1,
                      borderColor: selected === key ? p.ink : p.border,
                      backgroundColor: p.card,
                    }}>
                    <View style={{ width: 64, alignItems: 'center' }}>
                      <DText size={16} weight={800}>
                        {day.label}
                      </DText>
                      <DText size={30} weight={700}>
                        {day.date.getUTCDate()}
                      </DText>
                    </View>
                    <DText size={26} weight={700} style={{ flex: 1 }}>
                      {planner.data.meals[key] || '+ Plan'}
                    </DText>
                  </DButton>
                );
              })}
            </View>
          </SpatialNavigationNode>
          <DPanel style={{ flex: 1, padding: 46, gap: 20 }}>
            <DRow style={{ alignItems: 'center', gap: 12 }}>
              <DText size={64} weight={800} heading style={{ flex: 1, letterSpacing: -1.28 }} numberOfLines={2}>
                {selectedTitle || 'Plan a meal'}
              </DText>
              <DAction
                label="Edit"
                size={22}
                onPress={() => {
                  setDraft(selectedTitle);
                  setEditing(true);
                }}
                active={focusActive && !editing}
              />
              <DAction
                label="Delete"
                size={22}
                onPress={() => {
                  planner.setMeal(selected, '');
                  setSelected(null);
                }}
                active={focusActive && !editing}
              />
            </DRow>
            <DText size={22} color={p.muted}>
              {formatDate(new Date(`${selected.split(':')[0]}T12:00:00Z`), 'UTC')} · {selected.split(':')[1]}
              {selectedTitle === 'Taco night' ? ' · Serves 4 · 35 min' : ''}
            </DText>
            {selectedTitle === 'Taco night' ? (
              <DRow style={{ flex: 1, gap: 48 }}>
                <View style={{ flex: 1, gap: 12 }}>
                  <DText size={26} weight={800}>
                    Ingredients
                  </DText>
                  <SpatialNavigationScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 7 }}>
                    {ingredients.map((ingredient, i) => (
                      <DButton
                        key={ingredient}
                        role="checkbox"
                        checked={!needed.includes(i)}
                        label={`${ingredient}, ${needed.includes(i) ? 'needed' : 'have it'}`}
                        onPress={() =>
                          setNeeded((current) =>
                            current.includes(i) ? current.filter((n) => n !== i) : [...current, i],
                          )
                        }
                        active={focusActive && !editing}
                        style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                        <Check done={!needed.includes(i)} size={28} color="#2C7B3B" />
                        <DText size={24} weight={500} style={{ flex: 1 }}>
                          {ingredient}
                        </DText>
                        {needed.includes(i) ? (
                          <DText size={18} weight={800} color={p.warningInk}>
                            Need
                          </DText>
                        ) : null}
                      </DButton>
                    ))}
                  </SpatialNavigationScrollView>
                  <DAction
                    label={added ? 'Open Groceries' : `Add ${needed.length} missing items to Groceries`}
                    onPress={() => {
                      if (added) onNavigate('Lists');
                      else {
                        planner.addItems(
                          'groceries',
                          needed.map((i) => shoppingNames[i]),
                        );
                        setAdded(true);
                      }
                    }}
                    primary
                    active={focusActive && !editing}
                    defaultFocus
                    size={24}
                    style={{ minHeight: 68, paddingHorizontal: 14 }}
                  />
                </View>
                <View style={{ flex: 0.9, gap: 24 }}>
                  <DText size={26} weight={800}>
                    Instructions
                  </DText>
                  {instructions.map((step, i) => (
                    <View key={step} style={{ flexDirection: 'row', gap: 18 }}>
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          backgroundColor: p.soft,
                          borderRadius: 20,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                        <DText size={20} weight={800}>
                          {i + 1}
                        </DText>
                      </View>
                      <DText size={24} weight={500} style={{ flex: 1, lineHeight: 31.2 }}>
                        {step}
                      </DText>
                    </View>
                  ))}
                </View>
              </DRow>
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
                <DText heading size={34} weight={700}>
                  On the family menu
                </DText>
                <DText size={26} color={p.muted}>
                  No recipe has been saved for this meal yet.
                </DText>
                <DText size={22} color={p.muted}>
                  The local preview includes a sample recipe for Taco night.
                </DText>
              </View>
            )}
          </DPanel>
        </DRow>
        <DFooter action="Select" detail="Local meal plan" />
        {editor}
      </View>
    );
  return (
    <View style={{ flex: 1, gap: 28 }}>
      <DRow style={{ height: 106, alignItems: 'flex-end' }}>
        <View style={{ flex: 1, gap: 10 }}>
          <DText size={24} weight={700} color={p.muted} style={{ letterSpacing: 1.2 }}>
            WEEK OF{' '}
            {days[0].date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).toUpperCase()}
          </DText>
          <DText size={68} heading weight={800} style={{ letterSpacing: -1.36 }}>
            What’s for dinner
          </DText>
        </View>
        <DAction label="Grocery list" onPress={() => onNavigate('Lists')} active={focusActive} />
      </DRow>
      <View style={{ height: 50, flexDirection: 'row', marginLeft: 186, gap: 16 }}>
        {days.map((day) => (
          <View
            key={day.key}
            style={{ flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
            <DText size={22} weight={800} color={p.muted} style={{ letterSpacing: 1.1 }}>
              {day.label}
            </DText>
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: day.key === today ? p.selected : 'transparent',
              }}>
              <DText size={30} weight={800} color={day.key === today ? p.onSelected : p.ink}>
                {day.date.getUTCDate()}
              </DText>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flex: 1, gap: 16 }}>
        {mealTypes.map((type, slot) => (
          <DRow key={type} style={{ flex: slot === 2 ? 1.5 : 1, gap: 16 }}>
            <View style={{ width: 170, justifyContent: 'center', gap: 12 }}>
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: ['#E2A331', '#608ED3', '#DD7448'][slot],
                }}
              />
              <DText size={30} weight={700}>
                {type}
              </DText>
            </View>
            {days.map((day) => {
              const key = `${day.key}:${type}`;
              const name = planner.data.meals[key];
              const tonight = day.key === today && type === 'Dinner';
              return (
                <DButton
                  key={key}
                  label={`${day.label} ${type}: ${name || 'Plan'}`}
                  onPress={() => open(key)}
                  active={focusActive}
                  defaultFocus={tonight}
                  radius={18}
                  style={{
                    flex: 1,
                    padding: 16,
                    borderWidth: day.key === today || !name ? 3 : 2,
                    borderStyle: name ? 'solid' : 'dashed',
                    borderColor: day.key === today ? p.ink : p.border,
                    backgroundColor: name ? p.card : 'transparent',
                    justifyContent: name ? 'space-between' : 'center',
                    shadowColor: p.ink,
                    shadowOpacity: p.dark ? 0 : 0.06,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                  }}>
                  <DText
                    size={name ? (slot === 2 ? 30 : 22) : 22}
                    weight={name ? 700 : 600}
                    color={name ? p.ink : p.muted}
                    style={!name ? { textAlign: 'center' } : undefined}>
                    {name || '+ Plan'}
                  </DText>
                  {tonight && name ? (
                    <View
                      style={{
                        backgroundColor: p.selected,
                        alignSelf: 'flex-start',
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                      }}>
                      <DText size={20} weight={800} color={p.onSelected}>
                        TONIGHT
                      </DText>
                    </View>
                  ) : null}
                </DButton>
              );
            })}
          </DRow>
        ))}
      </View>
      <DFooter action="Open meal" detail="Local meal plan" />
    </View>
  );
}

export function FamilyListsScreen({ planner, focusActive }: PlannerProps) {
  const p = useDesignPalette();
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  usePageBack(() => setAdding(null), adding !== null);
  return (
    <View style={{ flex: 1, gap: 28 }}>
      <DRow style={{ height: 106, alignItems: 'flex-end' }}>
        <View style={{ flex: 1, gap: 10 }}>
          <DText size={24} weight={700} color={p.muted} style={{ letterSpacing: 1.2 }}>
            SHARED WITH THE WHOLE FAMILY
          </DText>
          <DText size={68} heading weight={800} style={{ letterSpacing: -1.36 }}>
            Lists
          </DText>
        </View>
        <DText size={22} color={p.muted}>
          Check off together · Saved on this browser
        </DText>
      </DRow>
      <DRow style={{ flex: 1, gap: 24 }}>
        {planner.data.lists.map((list, index) => (
          <SpatialNavigationNode key={list.id} orientation="vertical">
            <DPanel style={{ flex: 1, padding: 26, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 18, height: 48, borderRadius: 9, backgroundColor: list.color }} />
                <DText size={38} heading weight={700} style={{ flex: 1 }}>
                  {list.name}
                </DText>
                <View style={{ backgroundColor: p.soft, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16 }}>
                  <DText size={22} weight={700} color={p.muted}>
                    {list.items.filter((item) => !item.done).length} left
                  </DText>
                </View>
              </View>
              <SpatialNavigationScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 7, gap: 6 }}>
                {list.items.map((item, i) => (
                  <DButton
                    key={item.id}
                    role="checkbox"
                    checked={item.done}
                    label={`${list.name}: ${item.text}`}
                    active={focusActive && !adding}
                    defaultFocus={index === 0 && i === 1}
                    onPress={() => planner.toggleItem(list.id, item.id)}
                    radius={14}
                    style={{ height: 60, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        borderWidth: item.done ? 0 : 3,
                        borderColor: '#A89E8C',
                        backgroundColor: item.done ? list.color : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      {item.done ? <DIcon name="check" color="#FFFFFF" size={20} /> : null}
                    </View>
                    <DText
                      size={26}
                      weight={600}
                      color={item.done ? p.muted : p.ink}
                      numberOfLines={1}
                      style={{ flex: 1, textDecorationLine: item.done ? 'line-through' : 'none' }}>
                      {item.text}
                    </DText>
                  </DButton>
                ))}
              </SpatialNavigationScrollView>
            </DPanel>
          </SpatialNavigationNode>
        ))}
      </DRow>
      <DFooter action="Check off">
        <DAction
          label="Add item"
          onPress={() => {
            setDraft('');
            setAdding('groceries');
          }}
          active={focusActive && !adding}
          size={22}
          style={{ minHeight: 44 }}
        />
        <DAction
          label="Clear checked items"
          onPress={planner.clearChecked}
          active={focusActive && !adding}
          size={22}
          style={{ minHeight: 44 }}
        />
      </DFooter>
      {adding ? (
        <Editor
          title={`Add to ${planner.data.lists.find((list) => list.id === adding)?.name}`}
          label="List item"
          choices={
            <DRow style={{ gap: 14 }}>
              {planner.data.lists.map((list) => (
                <DAction
                  key={list.id}
                  label={list.name}
                  onPress={() => setAdding(list.id)}
                  primary={adding === list.id}
                  size={22}
                />
              ))}
            </DRow>
          }
          value={draft}
          onChange={setDraft}
          onCancel={() => setAdding(null)}
          onSave={() => {
            if (draft.trim()) {
              planner.addItems(adding, [draft]);
              setAdding(null);
            }
          }}
        />
      ) : null}
    </View>
  );
}

function Editor({
  title,
  label,
  value,
  onChange,
  onCancel,
  onSave,
  choices,
}: {
  title: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSave: () => void;
  choices?: React.ReactNode;
}) {
  const p = useDesignPalette();
  const { lock, unlock } = useLockSpatialNavigation();
  useEffect(() => {
    lock();
    return unlock;
  }, [lock, unlock]);
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        backgroundColor: p.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityViewIsModal>
      <SpatialNavigationRoot>
        <DPanel style={{ width: 900, gap: 28, padding: 40 }}>
          <DText size={44} heading weight={700}>
            {title}
          </DText>
          <DText size={24} color={p.muted}>
            {label}
          </DText>
          {choices}
          <TextInput
            autoFocus
            accessibilityLabel={label}
            value={value}
            onChangeText={onChange}
            onSubmitEditing={onSave}
            maxLength={100}
            style={{
              height: 72,
              borderWidth: 2,
              borderColor: p.border,
              borderRadius: 16,
              paddingHorizontal: 20,
              color: p.ink,
              backgroundColor: p.soft,
              fontFamily: designFont(28, 600),
              fontSize: 28,
            }}
          />
          <DRow style={{ gap: 18 }}>
            <DAction label="Save" onPress={onSave} primary defaultFocus />
            <DAction label="Cancel" onPress={onCancel} />
          </DRow>
        </DPanel>
      </SpatialNavigationRoot>
    </View>
  );
}

export function FamilyPhotosScreen(_props: FamilyScreenProps) {
  const p = useDesignPalette();
  return (
    <View style={{ flex: 1 }}>
      <DText heading size={68} weight={800}>
        Photos
      </DText>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <DIcon name="photos" size={72} color={p.muted} />
        <DText heading size={34} weight={700}>
          No photos yet
        </DText>
        <DText size={24} color={p.muted}>
          Your family photos will appear here.
        </DText>
      </View>
    </View>
  );
}
