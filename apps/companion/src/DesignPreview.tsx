// Explicit development-only web harness. Never uses account tokens or the cloud API.
import React, { useState } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { useFonts } from 'expo-font';
import HouseholdApp from './HouseholdApp';
import { dateKey, type Appearance, type Household, type HouseholdAPI } from './household';

export function createPreviewHousehold(): Household {
  const today = new Date();
  const at = (hour: number, minute = 0) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute).toISOString();
  return {
    family: {
      id: 'preview',
      name: 'The Parkers',
      timezone: 'America/Phoenix',
      memberIds: ['maya', 'sam', 'theo', 'jo'],
    },
    revision: 0,
    members: [
      ['maya', 'Maya', 'adult', '#2F5FA8'],
      ['sam', 'Sam', 'adult', '#B4541B'],
      ['theo', 'Theo', 'child', '#2E7A3A'],
      ['jo', 'Jo', 'child', '#6B45A8'],
    ].map(([id, name, role, accentColor]) => ({
      id,
      familyId: 'preview',
      name,
      initials: name[0],
      role: role as 'adult' | 'child',
      accentColor,
    })),
    events: [
      {
        id: 'carpool',
        familyId: 'preview',
        title: 'School carpool',
        category: 'school',
        startAt: at(7, 30),
        endAt: at(8, 30),
        ownerMemberId: 'maya',
        memberIds: ['maya'],
        source: 'manual',
      },
      {
        id: 'lunch',
        familyId: 'preview',
        title: 'Lunch with Priya',
        category: 'family',
        startAt: at(12),
        endAt: at(13),
        ownerMemberId: 'maya',
        memberIds: ['maya'],
        location: 'Café Rio',
        source: 'manual',
      },
      {
        id: 'soccer',
        familyId: 'preview',
        title: 'Soccer practice',
        category: 'sports',
        startAt: at(15, 30),
        endAt: at(17),
        ownerMemberId: 'theo',
        memberIds: ['theo'],
        location: 'Field 3',
        source: 'manual',
      },
      {
        id: 'dinner',
        familyId: 'preview',
        title: 'Taco night',
        category: 'meal',
        startAt: at(18),
        endAt: at(19, 30),
        ownerMemberId: 'maya',
        memberIds: ['maya', 'sam', 'theo', 'jo'],
        source: 'manual',
      },
    ],
    chores: [
      { id: 'dog', familyId: 'preview', title: 'Walk the dog', assignedToMemberId: 'sam', status: 'pending' },
      { id: 'cat', familyId: 'preview', title: 'Feed the cat', assignedToMemberId: 'theo', status: 'completed' },
    ],
    routines: [],
    listItems: [
      'Ground turkey',
      'Avocados (3)',
      'Salsa verde',
      'Limes',
      'Milk',
      'Tortillas',
      'Shredded cheese',
      'Bananas',
    ].map((title, i) => ({
      id: `g${i}`,
      title,
      listName: 'Groceries',
      category: ['Meat & fish', 'Produce', 'Pantry', 'Produce', 'Dairy', 'Pantry', 'Dairy', 'Produce'][i],
      completed: i >= 5,
      addedBy: ['Maya', 'Maya', 'Sam', 'Maya', 'Theo', 'Sam', 'Jo', 'Jo'][i],
    })),
    meals: [
      {
        id: 'tacos',
        title: 'Taco night',
        date: dateKey(today),
        category: 'Dinner',
        cookIds: ['sam', 'theo'],
        servings: 4,
        minutes: 35,
        ingredients: [
          '1 lb ground turkey',
          '8 corn tortillas',
          '1 packet taco seasoning',
          '1 cup shredded cheese',
          '2 avocados',
          '1 jar salsa verde',
          '2 limes',
          'Lettuce & tomatoes',
        ],
        instructions: [
          'Brown the turkey in a large skillet, 6–8 minutes.',
          'Stir in the seasoning and ¼ cup water. Simmer 5 minutes.',
          'Warm the tortillas in a dry pan.',
          'Slice avocados and limes. Set out cheese, lettuce, tomatoes and salsa.',
          'Build tacos at the table.',
        ],
      },
    ],
  };
}
function previewAPI(): HouseholdAPI {
  let data = createPreviewHousehold();
  return {
    household: async () => structuredClone(data),
    editHousehold: async (edit) => {
      if (edit.expectedRevision !== data.revision) throw new Error('Refresh and review your edit.');
      const value = edit.value as any;
      if (edit.kind === 'deleteEvent') data.events = data.events.filter((e) => e.id !== value.id);
      else if (edit.kind === 'deleteMeal') data.meals = data.meals.filter((m) => m.id !== value.id);
      else if (edit.kind === 'mealGroceries') {
        const meal = data.meals.find((m) => m.id === value.id);
        meal?.ingredients.forEach((title, i) => {
          if (!data.listItems.some((x) => !x.completed && x.listName === 'Groceries' && x.title === title))
            data.listItems.push({
              id: `${meal.id}-${i}`,
              title,
              listName: 'Groceries',
              category: 'Other',
              completed: false,
              addedBy: meal.title,
            });
        });
      } else {
        const key = { event: 'events', member: 'members', chore: 'chores', listItem: 'listItems', meal: 'meals' }[
          edit.kind
        ] as 'events';
        const index = data[key].findIndex((x) => x.id === value.id);
        if (index < 0) data[key].push(value);
        else data[key][index] = value;
      }
      data.revision++;
      return structuredClone(data);
    },
  };
}
export default function DesignPreview() {
  const [appearance, setAppearance] = useState<Appearance>('light');
  const system = useColorScheme();
  const [api] = useState(previewAPI);
  const [loaded] = useFonts({
    'Figtree-400': require('../assets/fonts/Figtree-400.ttf'),
    'Figtree-500': require('../../../packages/shared-ui/src/assets/fonts/Figtree-500.ttf'),
    'Figtree-600': require('../assets/fonts/Figtree-600.ttf'),
    'Figtree-700': require('../assets/fonts/Figtree-700.ttf'),
    'Figtree-800': require('../../../packages/shared-ui/src/assets/fonts/Figtree-800.ttf'),
    'Bricolage-800-34': require('../assets/fonts/Bricolage-800-34.ttf'),
    'Bricolage-700-34': require('../../../packages/shared-ui/src/assets/fonts/Bricolage-700-34.ttf'),
  });
  if (!loaded)
    return (
      <View>
        <ActivityIndicator />
      </View>
    );
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DDD7CC' }}>
      <View style={{ width: '100%', maxWidth: 390, height: '100%', maxHeight: 844, overflow: 'hidden' }}>
        <HouseholdApp
          api={api}
          account={{
            accountId: 'preview',
            parentName: 'Maya',
            householdName: 'The Parkers',
            email: 'preview@example.test',
          }}
          appearance={appearance}
          dark={appearance === 'dark' || (appearance === 'system' && system === 'dark')}
          onAppearance={async (value) => setAppearance(value)}
          onSignOut={() => {}}
          onServerSettings={() => {}}
          preview
        />
      </View>
    </View>
  );
}
