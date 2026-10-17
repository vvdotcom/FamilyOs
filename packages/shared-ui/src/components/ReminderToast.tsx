import React from 'react';
import { View } from 'react-native';
import type { CalendarEvent, FamilyMember } from '@familyos/domain';
import { DIcon, DText, formatTime, memberColor } from '../design/DesignSystem';

export type Reminder = {
  key: string;
  title: string;
  startAt: string;
  minutes: number;
  who: string;
  location?: string;
  colorId?: string;
};

/**
 * The next event to remind the family about: timed (not all-day), starting within `leadMinutes`, and not reminded
 * yet. Asked for by a family who wanted a heads-up before important appointments. Vega OS has no supported way to
 * show this over another app (FR-1), so it appears while Hometide is on screen: as a card on the app's screens, and
 * under Hometide's note on the wall calendar (WallReminder).
 */
export function dueReminder(
  events: CalendarEvent[],
  members: FamilyMember[],
  now: Date,
  leadMinutes: number,
  alreadyShown: ReadonlySet<string>,
): Reminder | null {
  if (!leadMinutes || leadMinutes <= 0) return null;
  const nowMs = now.getTime();
  // A little slack, because the TV's clock ticks every 30 seconds.
  const horizon = nowMs + leadMinutes * 60_000 + 30_000;
  const next = events
    .filter((event) => !event.allDay)
    .map((event) => ({ event, start: new Date(event.startAt).getTime() }))
    .filter(({ event, start }) => start > nowMs && start <= horizon && !alreadyShown.has(`${event.id}|${event.startAt}`))
    .sort((a, b) => a.start - b.start)[0];
  if (!next) return null;
  const { event, start } = next;
  const name = (id?: string | null) => members.find((member) => member.id === id)?.name;
  const who = name(event.responsibleMemberId) ?? event.memberIds.map((id) => name(id)).filter(Boolean).join(', ');
  return {
    key: `${event.id}|${event.startAt}`,
    title: event.title,
    startAt: event.startAt,
    minutes: Math.max(1, Math.round((start - nowMs) / 60_000)),
    who,
    location: event.location || undefined,
    colorId: event.responsibleMemberId ?? event.memberIds[0],
  };
}

export function ReminderToast({ reminder, timezone }: { reminder: Reminder; timezone: string }) {
  const accent = memberColor(reminder.colorId, true).accent;
  const detail = [formatTime(reminder.startAt, timezone), reminder.who, reminder.location].filter(Boolean).join(' · ');
  return (
    <View
      testID="reminder-toast"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`Reminder: ${reminder.title} in ${reminder.minutes} minutes. ${detail}`}
      style={{
        position: 'absolute',
        zIndex: 80,
        top: 40,
        right: 96,
        width: 640,
        flexDirection: 'row',
        gap: 22,
        padding: 26,
        borderRadius: 28,
        backgroundColor: 'rgba(16, 22, 30, 0.94)',
        borderWidth: 2,
        borderColor: accent,
      }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
        <DIcon name="calendar" size={34} color="#10161E" />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <DText size={22} weight={800} color="#F2A65A">
          {`IN ${reminder.minutes} ${reminder.minutes === 1 ? 'MINUTE' : 'MINUTES'}`}
        </DText>
        <DText size={34} weight={800} color="#F8F5EE" numberOfLines={2}>
          {reminder.title}
        </DText>
        <DText size={24} color="#C3C0B8" numberOfLines={2}>
          {detail}
        </DText>
      </View>
    </View>
  );
}

/** The reminder on the wall calendar: a calm card under Hometide's note, shown for the whole lead time. */
export function WallReminder({ reminder, timezone }: { reminder: Reminder; timezone: string }) {
  const accent = memberColor(reminder.colorId, true).accent;
  const detail = [formatTime(reminder.startAt, timezone), reminder.who, reminder.location].filter(Boolean).join(' · ');
  return (
    <View
      testID="wall-reminder"
      accessibilityLabel={`Reminder: ${reminder.title} in ${reminder.minutes} minutes. ${detail}`}
      style={{
        marginTop: 26,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 22,
        paddingVertical: 18,
        paddingHorizontal: 34,
        borderRadius: 34,
        backgroundColor: 'rgba(12, 14, 22, 0.66)',
        borderWidth: 3,
        borderColor: accent,
      }}>
      <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
        <DIcon name="calendar" size={32} color="#10161E" />
      </View>
      <View style={{ gap: 2 }}>
        <DText size={22} weight={800} color="#F2A65A">
          {`IN ${reminder.minutes} ${reminder.minutes === 1 ? 'MINUTE' : 'MINUTES'}`}
        </DText>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 22 }}>
          <DText size={34} weight={800} color="#F8F5EE" numberOfLines={1}>
            {reminder.title}
          </DText>
          <DText size={26} color="#D6D2CA" numberOfLines={1} style={{ maxWidth: 820 }}>
            {detail}
          </DText>
        </View>
      </View>
    </View>
  );
}
