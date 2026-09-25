import { Conflict, FamilyBriefing, FamilyMember, CalendarEvent, Chore } from './types';

export function createDeterministicBriefing(
  members: FamilyMember[],
  events: CalendarEvent[],
  chores: Chore[],
  conflicts: Conflict[],
  now: Date,
  timezone = 'UTC',
): FamilyBriefing {
  const primaryConflict = conflicts.find((item) => item.type === 'responsibility_overlap')
    ?? conflicts.find((item) => item.type === 'event_overlap');
  const suggested = primaryConflict?.suggestedMemberId
    ? members.find((member) => member.id === primaryConflict.suggestedMemberId)
    : undefined;
  const pending = chores.filter((chore) => chore.status === 'pending').length;
  const upcoming = events.filter((event) => Date.parse(event.endAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const headline = primaryConflict ? 'Pickup needs a little help' : upcoming.length ? 'Your day is taking shape' : 'You’re all set today';
  const summary = primaryConflict
    ? `${primaryConflict.message}${suggested ? ` ${suggested.name} is available to help.` : ''}`
    : upcoming.length
      ? `${upcoming.length} plans are coming up, with ${pending} household ${pending === 1 ? 'task' : 'tasks'} still to do.`
      : 'Enjoy the open time together.';
  const highlights = [
    ...conflicts.slice(0, 2).map((item) => item.message),
    ...upcoming.slice(0, 3).map((event) => `${formatTime(event.startAt, timezone)} · ${event.title}`),
    ...(pending ? [`${pending} chores still to do`] : []),
  ].slice(0, 5);

  return {
    date: new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).format(now),
    headline,
    summary,
    highlights,
    conflictIds: conflicts.map((item) => item.id),
    provider: 'deterministic',
  };
}

function formatTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(value));
}
