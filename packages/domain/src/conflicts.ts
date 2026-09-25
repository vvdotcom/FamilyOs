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

  const ordered = [...events].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id));
  for (let i = 0; i < ordered.length; i += 1) {
    const first = ordered[i];
    for (let j = i + 1; j < ordered.length; j += 1) {
      const second = ordered[j];
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
    const busyEvent = ordered.find((item) => item.id !== responsibility.id
      && item.memberIds.includes(responsibleMemberId) && overlaps(item, responsibility));
    if (busyEvent) {
      const candidate = suggestReassignment(responsibility, members, ordered, options.preferredAdultId);
      conflicts.push(makeConflict('responsibility_overlap', [busyEvent, responsibility], [responsibleMemberId],
        `${responsibility.responsibilityType === 'pickup' ? 'Pickup' : 'Family'} conflict`,
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

  for (const item of ordered) {
    const remaining = item.preparation.filter((entry) => !entry.completed);
    const timeUntilStart = Date.parse(item.startAt) - now;
    if (remaining.length && timeUntilStart >= 0 && timeUntilStart <= preparationWindowMs) {
      conflicts.push(makeConflict('preparation', [item], item.memberIds,
        `${item.title} preparation`, `Still needed: ${remaining.map((entry) => entry.label).join(', ')}.`));
    }
  }

  return conflicts.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
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
    && !events.some((candidate) => candidate.id !== event.id
      && candidate.memberIds.includes(member.id)
      && start < Date.parse(candidate.endAt) && Date.parse(candidate.startAt) < end)
    && !events.some((candidate) => candidate.id !== event.id
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
