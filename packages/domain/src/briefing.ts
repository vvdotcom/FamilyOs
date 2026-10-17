import { Conflict, FamilyBriefing, FamilyMember, CalendarEvent, Chore, HouseholdProposal } from './types';

/** The banner is read from the couch: a short headline and at most three "time · what" lines. */
const MAX_HIGHLIGHTS = 3;
const RECENT_HOURS = 6;

/**
 * Building an Intl.DateTimeFormat loads ICU locale data, which is slow on a Fire TV (Vega). The briefing runs on every
 * clock tick over every event in the household, and building formatters per event froze the app until Vega's thread
 * watchdog ended it (AppNotResponding in ICU, 17 Oct). So formatters are built once and day keys are remembered.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let result = formatters.get(key);
  if (!result) {
    result = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, result);
  }
  return result;
}
const dayKeys = new Map<string, string>();
const dayKey = (value: Date, timezone: string) => {
  const cacheKey = `${timezone}|${value.getTime()}`;
  const cached = dayKeys.get(cacheKey);
  if (cached !== undefined) return cached;
  const result = formatter('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).format(value);
  if (dayKeys.size > 20_000) dayKeys.clear();
  dayKeys.set(cacheKey, result);
  return result;
};
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the briefing talks about: today's plans that haven't ended (all-day ones included), or, once today is
 * done, tomorrow's. Sending only these keeps the AI request small and focused.
 */
export function briefingEvents(events: CalendarEvent[], now: Date, timezone = 'UTC'): CalendarEvent[] {
  const today = dayKey(now, timezone);
  const tomorrow = dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000), timezone);
  // Only events that touch the next two days (with room for any time zone) can be today's or tomorrow's.
  const from = now.getTime() - 2 * DAY_MS;
  const until = now.getTime() + 3 * DAY_MS;
  const near = events.filter((event) => Date.parse(event.startAt) < until && Date.parse(event.endAt) > from);
  const byStart = near.sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || Date.parse(a.startAt) - Date.parse(b.startAt));
  const onToday = (event: CalendarEvent) =>
    dayKey(new Date(event.startAt), timezone) <= today && today <= dayKey(new Date(Date.parse(event.endAt) - 1), timezone);
  const remaining = byStart.filter((event) => onToday(event) && (event.allDay || Date.parse(event.endAt) > now.getTime()));
  if (remaining.some((event) => !event.allDay)) return remaining.slice(0, 16);
  const next = byStart.filter((event) => !event.allDay && dayKey(new Date(event.startAt), timezone) === tomorrow).slice(0, 6);
  return [...remaining, ...next].slice(0, 16);
}

/** Problems that can still be fixed. A clash from earlier today, or from last week's copy of a series, is history. */
export function openBriefingConflicts(conflicts: Conflict[], events: CalendarEvent[], now: Date): Conflict[] {
  const ends = new Map(events.map((event) => [event.id, Date.parse(event.endAt)]));
  return conflicts.filter((item) => item.eventIds.some((id) => (ends.get(id) ?? Number.POSITIVE_INFINITY) > now.getTime()));
}

/** What the family confirmed in the last few hours (a swapped pickup, a routine), newest first. */
export function recentDecisions(proposals: HouseholdProposal[], now: Date): string[] {
  return proposals
    .filter((item) => item.status === 'confirmed' && item.decidedAt && now.getTime() - Date.parse(item.decidedAt) < RECENT_HOURS * 3600_000)
    .sort((a, b) => Date.parse(b.decidedAt ?? '') - Date.parse(a.decidedAt ?? ''))
    .map((item) => (item.kind === 'routine' ? String(item.payload?.learned ?? '') : item.summary).slice(0, 240))
    .filter(Boolean)
    .slice(0, 3);
}

/** "3:15 PM · Emma pickup · Lindsey" split into the bold time and the words, for the banner. */
export function splitHighlight(text: string): { time: string; what: string } {
  const match = /^\s*(All day|\d{1,2}:\d{2}\s?[AP]M)\s*[·•|–-]\s*(.+)$/i.exec(text);
  return match ? { time: match[1], what: match[2].trim() } : { time: '', what: text.trim() };
}

/**
 * The briefing written on the TV itself: shown at once, and kept when the AI briefing isn't available.
 * Pass the output of briefingEvents and openBriefingConflicts; recent decisions lead a calm banner.
 */
export function createDeterministicBriefing(
  members: FamilyMember[],
  events: CalendarEvent[],
  _chores: Chore[],
  conflicts: Conflict[],
  now: Date,
  timezone = 'UTC',
  recentChanges: string[] = [],
): FamilyBriefing {
  const primaryConflict = conflicts.find((item) => item.type === 'responsibility_overlap')
    ?? conflicts.find((item) => item.type === 'event_overlap')
    ?? conflicts[0];
  const suggested = primaryConflict?.suggestedMemberId
    ? members.find((member) => member.id === primaryConflict.suggestedMemberId)
    : undefined;
  const today = dayKey(now, timezone);
  // A school day is the backdrop, not news; birthdays, appointments and pickups are.
  const glance = briefingEvents(events, now, timezone).filter((event) => event.category !== 'school');
  const leftToday = glance.filter((event) => dayKey(new Date(event.startAt), timezone) <= today);
  const weekday = formatter('en-US', { weekday: 'long', timeZone: timezone }).format(now);
  let headline: string;
  let summary: string;
  if (primaryConflict) {
    headline = primaryConflict.type === 'responsibility_overlap' ? 'Pickup needs a little help' : 'Two plans overlap';
    summary = `${primaryConflict.message}${suggested ? ` ${suggested.name} is available to help.` : ''}`;
  } else if (recentChanges.length) {
    headline = 'Sorted. You’re all set';
    summary = recentChanges[0];
  } else if (leftToday.length) {
    headline = `All set for ${weekday}`;
    summary = `${leftToday.length} ${leftToday.length === 1 ? 'plan' : 'plans'} left today.`;
  } else if (glance.length) {
    headline = 'Tomorrow at a glance';
    summary = 'Nothing else today. Here’s how tomorrow starts.';
  } else {
    headline = 'You’re all set today';
    summary = 'Enjoy the open time together.';
  }
  const names = new Map(members.map((member) => [member.id, member.name]));
  const highlights = glance.slice(0, MAX_HIGHLIGHTS).map((event) => {
    const time = event.allDay ? 'All day' : formatTime(event.startAt, timezone);
    const who = event.responsibleMemberId && ['pickup', 'dropoff'].includes(event.category) ? names.get(event.responsibleMemberId) : undefined;
    const tomorrow = dayKey(new Date(event.startAt), timezone) > today ? 'Tomorrow: ' : '';
    return `${time} · ${tomorrow}${event.title}${who ? ` · ${who}` : ''}`;
  });

  return {
    date: today,
    headline,
    summary,
    highlights,
    conflictIds: conflicts.map((item) => item.id),
    provider: 'deterministic',
  };
}

function formatTime(value: string, timezone: string): string {
  return formatter('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(value));
}
