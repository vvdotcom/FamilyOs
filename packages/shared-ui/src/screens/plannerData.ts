import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { HouseholdSnapshot } from '@familyos/domain';

export type ListItem = { id: string; text: string; done: boolean };
export type FamilyList = { id: string; name: string; color: string; items: ListItem[] };
export type PlannerSnapshot = { version: 1; meals: Record<string, string>; lists: FamilyList[] };
const storageKey = 'familyos.planner.v1';
export const mealTypes = ['Breakfast', 'Lunch', 'Dinner'] as const;
/** What an unpaired TV shows: no meals and no lists until the household syncs. */
export function createEmptyPlanner(): PlannerSnapshot {
  return { version: 1, meals: {}, lists: [] };
}

export function createPlannerDemo(): PlannerSnapshot {
  const rows = [
    ['Pancakes', 'Oatmeal & berries', 'Yogurt parfaits', 'Scrambled eggs', 'Oatmeal & berries', 'Bagels', ''],
    ['', 'Turkey wraps', 'PB&J and apples', 'Leftover pasta', 'Quesadillas', '', 'Farmers market'],
    [
      'Roast chicken & veggies',
      'Pasta primavera',
      'Taco night',
      'Sheet-pan fajitas',
      'Leftovers',
      'Homemade pizza',
      'Burgers on the grill',
    ],
  ];
  const meals: Record<string, string> = {};
  rows.forEach((row, slot) =>
    row.forEach((name, day) => {
      meals[`2026-09-${20 + day}:${mealTypes[slot]}`] = name;
    }),
  );
  return {
    version: 1,
    meals,
    lists: [
      {
        id: 'groceries',
        name: 'Groceries',
        color: '#2C7B3B',
        items: [
          'Tortillas',
          'Ground turkey',
          'Avocados (3)',
          'Shredded cheese',
          'Salsa verde',
          'Limes',
          'Milk',
          'Bananas',
        ].map((text, i) => ({ id: `g${i}`, text, done: [0, 3, 7].includes(i) })),
      },
      {
        id: 'weekend',
        name: 'Weekend to-do',
        color: '#B45118',
        items: ['Clean out the garage', 'Return library books', 'Gift for Ava’s party', 'Swap air filters'].map(
          (text, i) => ({ id: `w${i}`, text, done: i === 1 }),
        ),
      },
      {
        id: 'camping',
        name: 'Camping trip',
        color: '#2F5FA8',
        items: ['Tent + stakes', 'Sleeping bags', 'Headlamps', 'Bug spray', 'Marshmallows'].map((text, i) => ({
          id: `c${i}`,
          text,
          done: [0, 4].includes(i),
        })),
      },
    ],
  };
}
function isPlanner(value: unknown): value is PlannerSnapshot {
  if (!value || typeof value !== 'object') return false;
  const item = value as PlannerSnapshot;
  return (
    item.version === 1 &&
    !!item.meals &&
    typeof item.meals === 'object' &&
    Object.values(item.meals).every((v) => typeof v === 'string') &&
    Array.isArray(item.lists) &&
    item.lists.length === 3 &&
    item.lists.every(
      (list) =>
        typeof list.id === 'string' &&
        typeof list.name === 'string' &&
        typeof list.color === 'string' &&
        Array.isArray(list.items) &&
        list.items.every((i) => typeof i.id === 'string' && typeof i.text === 'string' && typeof i.done === 'boolean'),
    )
  );
}
export function loadPlanner(): PlannerSnapshot {
  if (Platform.OS === 'web')
    try {
      const raw = globalThis.localStorage?.getItem(storageKey);
      const value: unknown = raw ? JSON.parse(raw) : null;
      if (isPlanner(value)) return value;
    } catch {
      /* Storage is optional for the offline preview. */
    }
  return createPlannerDemo();
}
function initialPlanner(sample: boolean): PlannerSnapshot {
  return sample ? loadPlanner() : createEmptyPlanner();
}
let itemSequence = 0;
export function usePlannerData(persist = true, sample = true) {
  const [data, setData] = useState(() => initialPlanner(sample));
  useEffect(() => {
    if (persist && Platform.OS === 'web')
      try {
        globalThis.localStorage?.setItem(storageKey, JSON.stringify(data));
      } catch {
        /* Keep in-memory edits usable. */
      }
  }, [data]);
  return {
    data,
    syncHousehold: (household: HouseholdSnapshot) => {
      const groups = new Map<string, FamilyList>();
      (household.listItems || []).forEach((item) => {
        const list = groups.get(item.listName) || {
          id: `household-${groups.size}`,
          name: item.listName,
          color: ['#2F5FA8', '#B45118', '#2C7B3B', '#6B45A8'][groups.size % 4],
          items: [],
        };
        list.items.push({ id: item.id, text: item.title, done: item.completed });
        groups.set(item.listName, list);
      });
      const meals = Object.fromEntries(
        (household.meals || []).map((meal) => [`${meal.date}:${meal.category}`, meal.title]),
      );
      setData({
        version: 1,
        meals,
        lists: groups.size ? Array.from(groups.values()) : [],
      });
    },
    reset: () => setData(sample ? createPlannerDemo() : createEmptyPlanner()),
    setMeal: (key: string, title: string) =>
      setData((current) => ({ ...current, meals: { ...current.meals, [key]: title.trim() } })),
    toggleItem: (listId: string, itemId: string) =>
      setData((current) => ({
        ...current,
        lists: current.lists.map((list) =>
          list.id !== listId
            ? list
            : { ...list, items: list.items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)) },
        ),
      })),
    clearChecked: () =>
      setData((current) => ({
        ...current,
        lists: current.lists.map((list) => ({ ...list, items: list.items.filter((item) => !item.done) })),
      })),
    addItems: (listId: string, texts: string[]) =>
      setData((current) => ({
        ...current,
        lists: current.lists.map((list) =>
          list.id !== listId
            ? list
            : {
                ...list,
                items: [
                  ...list.items,
                  ...texts
                    .map((text) => text.trim())
                    .filter(
                      (text) => text && !list.items.some((item) => item.text.toLowerCase() === text.toLowerCase()),
                    )
                    .map((text) => ({ id: `local-${Date.now()}-${itemSequence++}`, text, done: false })),
                ],
              },
        ),
      })),
  };
}
export type Planner = ReturnType<typeof usePlannerData>;
