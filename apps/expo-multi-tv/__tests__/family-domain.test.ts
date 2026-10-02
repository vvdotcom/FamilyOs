import {
  CalendarEvent,
  createDemoClock,
  createDemoHousehold,
  createDemoHouseholdRepository,
  createDeterministicBriefing,
  createDemoCalendarProvider,
  createDemoWeatherProvider,
  detectConflicts,
  loadCalendarData,
  loadWeatherData,
  setChoreCompleted,
  suggestReassignment,
  togglePreparationItem,
  toggleRoutineStep,
} from '@familyos/domain';
import {
  backDestination,
  focusRegionAfterDirection,
} from '../../../packages/shared-ui/src/navigation/familyNavigation';

const family = createDemoHousehold();

function event(
  id: string,
  startAt: string,
  endAt: string,
  memberIds: string[],
  extra: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    familyId: family.family.id,
    title: id,
    category: 'family',
    startAt,
    endAt,
    ownerMemberId: memberIds[0] ?? 'alex',
    memberIds,
    preparation: [],
    source: 'demo',
    ...extra,
  };
}

describe('Hometide deterministic household domain', () => {
  it('recreates the same synthetic household and identifiers on reset', () => {
    const first = createDemoHousehold();
    const repository = createDemoHouseholdRepository();
    repository.reset();
    expect(repository.snapshot()).toEqual(first);
    expect(createDemoHousehold().events.map((item) => item.id)).toEqual(first.events.map((item) => item.id));
  });

  it('finds shared-member overlaps but treats touching event boundaries as non-overlapping', () => {
    const events = [
      event('one', '2026-09-22T10:00:00-07:00', '2026-09-22T11:00:00-07:00', ['alex']),
      event('two', '2026-09-22T10:59:59-07:00', '2026-09-22T12:00:00-07:00', ['alex']),
    ];
    expect(detectConflicts(family.members, events).some((item) => item.type === 'event_overlap')).toBe(true);
    events[1].startAt = '2026-09-22T11:00:00-07:00';
    expect(detectConflicts(family.members, events)).toEqual([]);
  });

  it('flags an assigned pickup during an appointment and deterministically suggests a free adult', () => {
    const pickup = event('pickup', '2026-09-22T15:15:00-07:00', '2026-09-22T15:30:00-07:00', ['emma'], {
      responsibleMemberId: 'jordan',
      responsibilityType: 'pickup',
    });
    const dentist = event('dentist', '2026-09-22T14:45:00-07:00', '2026-09-22T15:30:00-07:00', ['jordan']);
    const conflicts = detectConflicts(family.members, [pickup, dentist]);
    expect(conflicts.find((item) => item.type === 'responsibility_overlap')?.suggestedMemberId).toBe('alex');
    const briefing = createDeterministicBriefing(
      family.members,
      [pickup, dentist],
      family.chores,
      conflicts,
      new Date('2026-09-22T14:30:00-07:00'),
      family.family.timezone,
    );
    expect(briefing.provider).toBe('deterministic');
    expect(briefing.summary).toContain('Alex is available');
  });

  it('does not suggest an adult who is also busy', () => {
    const pickup = event('pickup', '2026-09-22T15:15:00-07:00', '2026-09-22T15:30:00-07:00', ['emma'], {
      responsibleMemberId: 'jordan',
      responsibilityType: 'pickup',
    });
    const events = [
      pickup,
      event('dentist', '2026-09-22T14:45:00-07:00', '2026-09-22T15:30:00-07:00', ['jordan']),
      event('work', '2026-09-22T15:00:00-07:00', '2026-09-22T16:00:00-07:00', ['alex']),
    ];
    expect(suggestReassignment(pickup, family.members, events)).toBeUndefined();
  });

  it('uses the configured travel buffer and permits an exactly sufficient buffer', () => {
    const pickup = event('pickup', '2026-09-22T15:30:00-07:00', '2026-09-22T15:45:00-07:00', ['emma'], {
      responsibleMemberId: 'jordan',
      responsibilityType: 'pickup',
    });
    const previous = event('appointment', '2026-09-22T14:30:00-07:00', '2026-09-22T15:11:00-07:00', ['jordan']);
    expect(detectConflicts(family.members, [previous, pickup]).some((item) => item.type === 'travel_buffer')).toBe(
      true,
    );
    previous.endAt = '2026-09-22T15:10:00-07:00';
    expect(detectConflicts(family.members, [previous, pickup]).some((item) => item.type === 'travel_buffer')).toBe(
      false,
    );
  });

  it('surfaces only incomplete preparation within the warning window', () => {
    const soccer = event('soccer', '2026-09-22T15:00:00-07:00', '2026-09-22T16:00:00-07:00', ['emma'], {
      preparation: [{ id: 'water', label: 'Water bottle', completed: false }],
    });
    expect(detectConflicts(family.members, [soccer], { now: '2026-09-22T14:30:00-07:00' })[0]?.type).toBe(
      'preparation',
    );
    expect(detectConflicts(family.members, [soccer], { now: '2026-09-22T13:30:00-07:00' })).toEqual([]);
    soccer.preparation[0].completed = true;
    expect(detectConflicts(family.members, [soccer], { now: '2026-09-22T14:30:00-07:00' })).toEqual([]);
  });

  it('detects an overlap that crosses midnight using absolute instants', () => {
    const first = event('late-event', '2026-09-22T23:30:00-07:00', '2026-09-23T00:30:00-07:00', ['alex']);
    const second = event('early-event', '2026-09-23T00:00:00-07:00', '2026-09-23T00:45:00-07:00', ['alex']);
    expect(detectConflicts(family.members, [first, second]).some((item) => item.type === 'event_overlap')).toBe(true);
  });

  it('provides a controllable clock and isolated repository snapshots', () => {
    const clock = createDemoClock();
    expect(clock.now().toISOString()).toBe('2026-09-22T21:30:00.000Z');
    clock.advance(60_000);
    expect(clock.now().toISOString()).toBe('2026-09-22T21:31:00.000Z');
    clock.reset();
    const repository = createDemoHouseholdRepository();
    const snapshot = repository.snapshot();
    snapshot.events.length = 0;
    expect(repository.listEvents().length).toBeGreaterThan(0);
  });
});

describe('Hometide remote navigation transitions', () => {
  it('moves focus across the navigation/content boundary only in the inward direction', () => {
    expect(focusRegionAfterDirection('navigation', 'right')).toBe('navigation');
    expect(focusRegionAfterDirection('navigation', 'down')).toBe('content');
    expect(focusRegionAfterDirection('content', 'up')).toBe('navigation');
    expect(focusRegionAfterDirection('content', 'left')).toBe('content');
    expect(focusRegionAfterDirection('content', 'right')).toBe('content');
  });

  it('returns non-home routes to Home content and toggles Home focus regions on Back', () => {
    expect(backDestination('Calendar', 'navigation')).toEqual({ route: 'Home', focusRegion: 'content' });
    expect(backDestination('Home', 'navigation')).toEqual({ route: 'Home', focusRegion: 'content' });
    expect(backDestination('Home', 'content')).toEqual({ route: 'Home', focusRegion: 'navigation' });
  });
});

describe('Phase 3 household interactions and providers', () => {
  it('completes and resets chores without mutating the previous household snapshot', () => {
    const original = createDemoHousehold();
    const completed = setChoreCompleted(original, 'shoes-door', true, '2026-09-22T14:31:00-07:00');
    expect(completed.chores.find((chore) => chore.id === 'shoes-door')).toMatchObject({
      status: 'completed',
      completedAt: '2026-09-22T14:31:00-07:00',
    });
    expect(original.chores.find((chore) => chore.id === 'shoes-door')?.status).toBe('pending');
    const reset = setChoreCompleted(completed, 'shoes-door', false, '2026-09-22T14:32:00-07:00');
    expect(reset.chores.find((chore) => chore.id === 'shoes-door')).toMatchObject({ status: 'pending' });
    expect(reset.chores.find((chore) => chore.id === 'shoes-door')).not.toHaveProperty('completedAt');
  });

  it('toggles routine steps and event preparation as immutable household updates', () => {
    const original = createDemoHousehold();
    const routineUpdate = toggleRoutineStep(original, 'emma-morning', 'pack-backpack-step');
    expect(routineUpdate.routines[0].steps.find((step) => step.id === 'pack-backpack-step')?.completed).toBe(true);
    expect(original.routines[0].steps.find((step) => step.id === 'pack-backpack-step')?.completed).toBe(false);
    const preparationUpdate = togglePreparationItem(original, 'soccer-emma', 'water-bottle');
    expect(
      preparationUpdate.events
        .find((event) => event.id === 'soccer-emma')
        ?.preparation.find((item) => item.id === 'water-bottle')?.completed,
    ).toBe(true);
    expect(
      original.events
        .find((event) => event.id === 'soccer-emma')
        ?.preparation.find((item) => item.id === 'water-bottle')?.completed,
    ).toBe(false);
  });

  it('provides deterministic week-range calendar data and sunny demo weather', async () => {
    const household = createDemoHousehold();
    const calendar = createDemoCalendarProvider(household);
    const events = await calendar.listEvents({ from: '2026-09-22T08:30:00-07:00', to: '2026-09-23T00:00:00-07:00' });
    expect(events.map((item) => item.id)).toContain('emma-pickup');
    expect(events.map((item) => item.id)).not.toContain('school-emma');
    const forecast = await createDemoWeatherProvider().getForecast('Tucson, AZ');
    expect(forecast).toMatchObject({ location: 'Tucson, AZ', condition: 'Sunny', temperatureF: 89 });
  });

  it('reports empty, cached, and unavailable calendar states without throwing provider errors', async () => {
    const empty = await loadCalendarData({ name: 'empty', listEvents: async () => [] });
    expect(empty.status).toBe('empty');
    const offline = {
      name: 'offline',
      listEvents: async () => {
        throw new Error('network down');
      },
    };
    const cached = await loadCalendarData(offline, family.events);
    expect(cached).toMatchObject({ status: 'cached', message: 'Calendar is unavailable. Showing saved events.' });
    const unavailable = await loadCalendarData(offline);
    expect(unavailable.status).toBe('unavailable');
  });

  it('falls back to cached weather and represents an unavailable forecast', async () => {
    const offline = {
      name: 'offline',
      getForecast: async () => {
        throw new Error('network down');
      },
    };
    const cached = await loadWeatherData(offline, 'Tucson, AZ', undefined, {
      location: 'Tucson, AZ',
      condition: 'Sunny',
      temperatureF: 89,
      highF: 94,
      lowF: 68,
      summary: 'Warm and sunny this afternoon.',
    });
    expect(cached.status).toBe('cached');
    expect((await loadWeatherData(offline, 'Tucson, AZ')).status).toBe('unavailable');
  });
});
