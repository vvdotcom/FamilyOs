import { createDemoHousehold, DEMO_NOW } from '@familyos/domain';
import { dueReminder } from '../../../packages/shared-ui/src/components/ReminderToast';

// Asked for by families on 2026-10-15: a reminder on the TV before an appointment.
describe('TV reminders', () => {
  const household = createDemoHousehold();
  const now = new Date(DEMO_NOW); // Tuesday 2:30 PM; Jordan's dentist is at 2:45 PM

  it('reminds about the next timed event inside the lead time, once', () => {
    const shown = new Set<string>();
    const first = dueReminder(household.events, household.members, now, 15, shown);
    expect(first?.title).toBe('Dentist');
    expect(first?.minutes).toBe(15);
    expect(first?.who).toContain('Jordan');
    shown.add(first!.key);
    const second = dueReminder(household.events, household.members, now, 15, shown);
    expect(second?.key).not.toBe(first?.key);
  });

  it('stays quiet when reminders are off or nothing is close', () => {
    expect(dueReminder(household.events, household.members, now, 0, new Set())).toBeNull();
    expect(dueReminder(household.events, household.members, now, 10, new Set())).toBeNull();
  });

  it('never reminds about all-day or past events', () => {
    const events = household.events.map((event) => ({ ...event, allDay: true }));
    expect(dueReminder(events, household.members, now, 30, new Set())).toBeNull();
    const later = new Date(now.getTime() + 24 * 60 * 60_000);
    const past = household.events.filter((event) => new Date(event.startAt).getTime() < now.getTime());
    expect(dueReminder(past, household.members, later, 30, new Set())).toBeNull();
  });
});
