import { DEFAULT_TRAVEL_BUFFER_MINUTES } from './demo';
import { CalendarEvent, Conflict, FamilyMember, ProposedAction } from './types';

export interface ConflictOptions {
  now?: string | Date;
  travelBufferMinutes?: number;
  preparationWindowMinutes?: number;
  preferredAdultId?: string;
}

export function detectConflicts(
  members: FamilyMember[],
  events: CalendarEvent[],
  options: ConflictOptions = {},
): Conflict[] {
  const now = asTimestamp(options.now ?? new Date());
  const bufferMs = (options.travelBufferMinutes ?? DEFAULT_TRAVEL_BUFFER_MINUTES) * 60_000;
  const preparationWindowMs = (options.preparationWindowMinutes ?? 60) * 60_000;
  const conflicts: Conflict[] = [];

  // All-day items (birthdays, holidays, "no school") are informational and never conflict (same rule as the server).
  // Parse each event's times once: a seeded household has hundreds of events and this runs on a Fire TV.
  const startOf = new Map<CalendarEvent, number>();
  const endOf = new Map<CalendarEvent, number>();
  for (const item of events) {
    startOf.set(item, Date.parse(item.startAt));
    endOf.set(item, Date.parse(item.endAt));
  }
  const ordered = events.filter((item) => !item.allDay).sort((a, b) => startOf.get(a)! - startOf.get(b)! || byId(a.id, b.id));
  for (let i = 0; i < ordered.length; i += 1) {
    const first = ordered[i];
    const firstEnd = endOf.get(first)!;
    for (let j = i + 1; j < ordered.length; j += 1) {
      const second = ordered[j];
      // Sorted by start: once an event starts at or after this one ends, no later one can overlap it.
      if (startOf.get(second)! >= firstEnd) break;
      if (!overlaps(first, second)) continue;
      const shared = first.memberIds.filter((memberId) => second.memberIds.includes(memberId));
      if (shared.length) {
        conflicts.push(makeConflict('event_overlap', [first, second], shared,
          'Schedule overlap', `${memberNames(shared, members)} have events at the same time.`));
      }
    }
  }

  for (const responsibility of ordered.filter((item) => item.responsibleMemberId && item.responsibilityType)) {
    const responsibleMemberId = responsibility.responsibleMemberId!;
    // A driver is also busy when responsible for another overlapping event (same rule as the server).
    const busyEvent = ordered.find((item) => item.id !== responsibility.id
      && (item.memberIds.includes(responsibleMemberId) || item.responsibleMemberId === responsibleMemberId)
      && overlaps(item, responsibility));
    if (busyEvent) {
      const candidate = suggestReassignment(responsibility, members, ordered, options.preferredAdultId);
      const doubleBooked = busyEvent.responsibleMemberId === responsibleMemberId && !busyEvent.memberIds.includes(responsibleMemberId);
      conflicts.push(makeConflict('responsibility_overlap', [busyEvent, responsibility], [responsibleMemberId],
        doubleBooked ? 'Driver needed in two places' : `${responsibility.responsibilityType === 'pickup' ? 'Pickup' : 'Family'} conflict`,
        `${memberName(responsibleMemberId, members)} is busy during ${responsibility.title}.`, candidate?.id));
    } else if (bufferMs > 0) {
      const previousEvent = ordered.filter((item) => item.id !== responsibility.id
        && item.memberIds.includes(responsibleMemberId)
        && Date.parse(item.endAt) <= Date.parse(responsibility.startAt))
        .sort((a, b) => Date.parse(b.endAt) - Date.parse(a.endAt))[0];
      if (previousEvent && Date.parse(previousEvent.endAt) + bufferMs > Date.parse(responsibility.startAt)) {
        conflicts.push(makeConflict('travel_buffer', [previousEvent, responsibility], [responsibleMemberId],
          'Travel time is tight', `There may not be enough time between ${previousEvent.title} and ${responsibility.title}.`));
      }
    }
  }

  // Venue-to-venue travel: back-to-back events at different places need their travel time.
  for (const member of members) {
    const mine = ordered.filter((item) => item.memberIds.includes(member.id) && !item.allDay);
    for (let i = 1; i < mine.length; i += 1) {
      const first = mine[i - 1];
      const second = mine[i];
      if (!first.location || !second.location || !second.travelMinutes) continue;
      if (first.location.trim().toLowerCase() === second.location.trim().toLowerCase()) continue;
      const gap = (Date.parse(second.startAt) - Date.parse(first.endAt)) / 60_000;
      if (gap >= 0 && gap < second.travelMinutes) {
        conflicts.push(makeConflict('travel_buffer', [first, second], [member.id], 'Not enough travel time',
          `${member.name} needs about ${second.travelMinutes} minutes to get from ${first.title} to ${second.title}.`));
      }
    }
  }

  for (const item of ordered) {
    const remaining = item.preparation.filter((entry) => !entry.completed);
    const timeUntilStart = Date.parse(item.startAt) - now;
    if (remaining.length && timeUntilStart >= 0 && timeUntilStart <= preparationWindowMs) {
      conflicts.push(makeConflict('preparation', [item], item.memberIds,
        `${item.title} preparation`, `Still needed: ${remaining.map((entry) => entry.label).join(', ')}.`));
    }
  }

  const unique = [...new Map(conflicts.map((item) => [item.id, item])).values()];
  return unique.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || byId(a.id, b.id));
}

/** Ids are plain ASCII: compare them directly. localeCompare goes through ICU, which is slow on a Fire TV. */
function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function suggestReassignment(
  event: CalendarEvent,
  members: FamilyMember[],
  events: CalendarEvent[],
  preferredAdultId?: string,
): FamilyMember | undefined {
  const start = Date.parse(event.startAt);
  const end = Date.parse(event.endAt);
  const available = members.filter((member) => member.role === 'adult'
    && member.id !== event.responsibleMemberId
    && !events.some((candidate) => candidate.id !== event.id && !candidate.allDay
      && candidate.memberIds.includes(member.id)
      && start < Date.parse(candidate.endAt) && Date.parse(candidate.startAt) < end)
    && !events.some((candidate) => candidate.id !== event.id && !candidate.allDay
      && candidate.responsibleMemberId === member.id
      && start < Date.parse(candidate.endAt) && Date.parse(candidate.startAt) < end));
  return available.find((member) => member.id === preferredAdultId) ?? available[0];
}

export function proposeReassignment(
  event: CalendarEvent,
  conflict: Conflict,
  candidate: FamilyMember,
  createdAt: string,
): ProposedAction | undefined {
  if (conflict.type !== 'responsibility_overlap' || !conflict.eventIds.includes(event.id)
    || !event.responsibleMemberId || !candidate.id || candidate.id === event.responsibleMemberId) return undefined;
  return {
    id: `proposal:${event.id}:${candidate.id}`,
    type: 'reassign_responsibility',
    status: 'proposed',
    eventId: event.id,
    conflictId: conflict.id,
    fromMemberId: event.responsibleMemberId,
    toMemberId: candidate.id,
    createdAt,
  };
}

function overlaps(a: CalendarEvent, b: CalendarEvent): boolean {
  return Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(b.startAt) < Date.parse(a.endAt);
}

function makeConflict(
  type: Conflict['type'], events: CalendarEvent[], memberIds: string[], title: string, message: string,
  suggestedMemberId?: string,
): Conflict {
  const eventIds = events.map((item) => item.id).sort();
  return {
    id: `conflict:${type}:${eventIds.join(':')}:${memberIds.slice().sort().join(':')}`,
    type,
    severity: 'warning',
    title,
    message,
    eventIds,
    memberIds: [...memberIds].sort(),
    startsAt: events.map((item) => item.startAt).sort()[0],
    endsAt: events.map((item) => item.endAt).sort().reverse()[0],
    ...(suggestedMemberId ? { suggestedMemberId } : {}),
  };
}

function memberNames(ids: string[], members: FamilyMember[]): string {
  return ids.map((id) => memberName(id, members)).join(' and ');
}

function memberName(id: string, members: FamilyMember[]): string {
  return members.find((member) => member.id === id)?.name ?? 'A family member';
}

function asTimestamp(value: string | Date): number {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error('Conflict analysis requires a valid current time.');
  return timestamp;
}
