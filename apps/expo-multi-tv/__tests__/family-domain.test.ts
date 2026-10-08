import {
  briefingEvents,
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
  openBriefingConflicts,
  pendingApprovals,
  recentDecisions,
  setChoreCompleted,
  splitHighlight,
  starBalance,
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

describe('family briefing at a glance', () => {
  const at = (time: string) => new Date(`2026-10-06T${time}:00-07:00`);
  const plan = (id: string, title: string, start: string, end: string, extra: Partial<CalendarEvent> = {}) =>
    event(id, `2026-10-06T${start}:00-07:00`, `2026-10-06T${end}:00-07:00`, ['emma'], { title, ...extra });
  const day = [
    plan('drop', 'School drop-off', '07:45', '08:15', { category: 'dropoff', responsibleMemberId: 'alex' }),
    plan('school', 'School', '08:15', '15:15', { category: 'school' }),
    plan('pick', 'Emma pickup', '15:15', '15:35', { category: 'pickup', responsibleMemberId: 'alex' }),
    plan('soccer', 'Soccer practice', '17:30', '18:30', { category: 'sports' }),
    plan('dinner', 'Family dinner', '18:30', '19:15', { category: 'meal' }),
    event('tomorrow', '2026-10-07T07:45:00-07:00', '2026-10-07T08:15:00-07:00', ['emma'], { title: 'School drop-off', category: 'dropoff' }),
  ];

  it('covers what is left today, then tomorrow once today is done', () => {
    expect(briefingEvents(day, at('14:00'), 'America/Phoenix').map((item) => item.id)).toEqual(['school', 'pick', 'soccer', 'dinner']);
    expect(briefingEvents(day, at('20:00'), 'America/Phoenix').map((item) => item.id)).toEqual(['tomorrow']);
  });

  it('turns a calm day into three time-first lines, skipping the school block', () => {
    const briefing = createDeterministicBriefing(family.members, briefingEvents(day, at('14:00'), 'America/Phoenix'), [], [], at('14:00'), 'America/Phoenix');
    expect(briefing.headline).toBe('All set for Tuesday');
    expect(briefing.conflictIds).toEqual([]);
    expect(briefing.highlights.map(splitHighlight).map((item) => item.what)).toEqual(['Emma pickup · Alex', 'Soccer practice', 'Family dinner']);
    expect(splitHighlight(briefing.highlights[0]).time).toMatch(/^3:15\sPM$/);
  });

  it('leads with a fresh decision, and only counts problems that can still be fixed', () => {
    const lastWeek = event('old', '2026-09-29T15:15:00-07:00', '2026-09-29T15:35:00-07:00', ['emma']);
    const stale = { id: 'c1', type: 'responsibility_overlap' as const, severity: 'warning' as const, title: 'Pickup', message: 'Old clash',
      eventIds: ['old'], memberIds: ['alex'], startsAt: lastWeek.startAt, endsAt: lastWeek.endAt };
    expect(openBriefingConflicts([stale], [lastWeek], at('14:00'))).toEqual([]);
    const recent = recentDecisions([
      { id: 'r', source: 'hometide', kind: 'routine', status: 'confirmed', summary: 'Make Alex the usual pickup?',
        payload: { learned: 'Alex is the usual Emma pickup on Tuesdays and Thursdays.' }, requestedBy: 'hometide',
        createdAt: '2026-10-06T13:00:00-07:00', expiresAt: '2026-10-07T13:00:00-07:00', decidedAt: '2026-10-06T13:05:00-07:00' },
      { id: 'old', source: 'voice', kind: 'pickup_swap', status: 'confirmed', summary: 'Long ago', requestedBy: 'voice:parent',
        createdAt: '2026-10-05T08:00:00-07:00', expiresAt: '2026-10-06T08:00:00-07:00', decidedAt: '2026-10-05T08:05:00-07:00' },
    ], at('14:00'));
    expect(recent).toEqual(['Alex is the usual Emma pickup on Tuesdays and Thursdays.']);
    const briefing = createDeterministicBriefing(family.members, briefingEvents(day, at('14:00'), 'America/Phoenix'), [], [], at('14:00'), 'America/Phoenix', recent);
    expect(briefing.headline).toBe('Sorted. You’re all set');
    expect(briefing.summary).toBe(recent[0]);
  });
});

describe('chores, approvals and stars', () => {
  const home = {
    ...family,
    chores: [{ ...family.chores[0], id: 'backpack', title: 'Pack your backpack', points: 5, verifyWithPhoto: true, assignedToMemberId: 'leo' }],
    choreVerifications: [
      { id: 'v2', choreId: 'backpack', memberId: 'leo', photoId: 'p2', verdict: 'looks_done' as const, reason: 'Zipped by the door.',
        confidence: 0.9, provider: 'bedrock' as const, status: 'pending' as const, submittedAt: '2026-10-06T07:31:00-07:00' },
      { id: 'v1', choreId: 'backpack', memberId: 'leo', photoId: null, verdict: 'unclear' as const, reason: '', confidence: 0.4,
        provider: 'bedrock' as const, status: 'approved' as const, submittedAt: '2026-10-05T07:31:00-07:00' },
    ],
    rewards: [{ id: 'movie', title: 'Pick Friday’s movie', stars: 20, available: true }],
    redemptions: [{ id: 'r1', memberId: 'leo', rewardId: 'movie', stars: 20, status: 'pending' as const, requestedAt: '2026-10-06T07:40:00-07:00' }],
    starTransactions: [
      { id: 't1', memberId: 'leo', delta: 30, reason: 'chore_earned' as const, sourceId: 'x', createdAt: '2026-10-01T00:00:00Z' },
      { id: 't2', memberId: 'leo', delta: -5, reason: 'reward_redeemed' as const, sourceId: 'y', createdAt: '2026-10-02T00:00:00Z' },
      { id: 't3', memberId: 'emma', delta: 12, reason: 'chore_earned' as const, sourceId: 'z', createdAt: '2026-10-02T00:00:00Z' },
    ],
  };

  it('keeps a separate star balance for each child', () => {
    expect(starBalance(home, 'leo')).toBe(25);
    expect(starBalance(home, 'emma')).toBe(12);
    expect(starBalance(home, 'alex')).toBe(0);
  });

  it('lists only what still waits for a parent, oldest first, with the chore and reward names', () => {
    const waiting = pendingApprovals(home);
    expect(waiting.map((item) => [item.kind, item.id, item.title, item.stars])).toEqual([
      ['photo', 'v2', 'Pack your backpack', 5],
      ['reward', 'r1', 'Pick Friday’s movie', 20],
    ]);
  });
});
