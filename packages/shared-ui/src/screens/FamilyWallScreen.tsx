import React, { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { CalendarEvent, Conflict, HouseholdSnapshot, ProviderState, WeatherForecast } from '@familyos/domain';
import {
  Avatar,
  DText,
  eventOnDay,
  formatDate,
  formatTime,
  localDateKey,
  memberColor,
  useDesignPalette,
} from '../design/DesignSystem';
import { WeatherIcon } from '../design/WeatherIcon';
import { familyAgentClient } from '../api/familyAgentClient';

/** Minutes without remote input before the TV turns into the wall calendar. */
export const WALL_IDLE_MINUTES = 2;
const NIGHT_FROM = 22;
const NIGHT_UNTIL = 6;
const MAX_ROWS = 8;
// Nudge everything a few pixels each minute so a static layout never burns into the screen.
const SHIFTS = [
  [0, 0],
  [10, 6],
  [20, 0],
  [10, -6],
] as const;

function householdHour(now: Date, timezone: string) {
  // formatToParts avoids engines (Vega) that pad a lone hour with default date fields.
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: timezone }).formatToParts(now);
  return Number(parts.find((part) => part.type === 'hour')?.value ?? 12);
}

function nextDayKey(dayKey: string) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const byTime = (a: CalendarEvent, b: CalendarEvent) =>
  Number(!a.allDay) - Number(!b.allDay) || Date.parse(a.startAt) - Date.parse(b.startAt);

export interface FamilyWallScreenProps {
  household: HouseholdSnapshot;
  now: Date;
  weatherState: ProviderState<WeatherForecast>;
  paired: boolean;
  onExit: () => void;
  /** Events in a conflict get a warning, so the wall shows what needs fixing. */
  conflicts?: Conflict[];
}

/** Always-on family calendar for an idle TV: the day at a glance from across the room. */
export default function FamilyWallScreen({ household, now, weatherState, paired, onExit, conflicts = [] }: FamilyWallScreenProps) {
  const p = useDesignPalette(true);
  const timezone = household.family.timezone;
  const todayKey = localDateKey(now, timezone);
  const hour = householdHour(now, timezone);
  const night = hour >= NIGHT_FROM || hour < NIGHT_UNTIL;
  const [dx, dy] = SHIFTS[now.getMinutes() % SHIFTS.length];
  const today = household.events.filter((event) => eventOnDay(event, todayKey, timezone)).sort(byTime);
  const tomorrowKey = nextDayKey(todayKey);
  const tomorrow = household.events.filter((event) => eventOnDay(event, tomorrowKey, timezone)).sort(byTime);
  const upcoming = today.filter((event) => !event.allDay && Date.parse(event.endAt) > now.getTime());
  const next = upcoming.find((event) => Date.parse(event.startAt) >= now.getTime()) ?? upcoming[0];
  const flagged = new Set(conflicts.filter((item) => item.type === 'responsibility_overlap').flatMap((item) => item.eventIds));
  const dinner = (household.meals || []).find((meal) => meal.date === todayKey && meal.category === 'Dinner');
  const childIds = household.members.filter((member) => member.role === 'child').map((member) => member.id);
  const choresLeft = childIds
    .map((id) => ({ id, count: household.chores.filter((chore) => chore.assignedToMemberId === id && chore.status === 'pending').length }))
    .filter((item) => item.count > 0);
  const name = (id?: string | null) => household.members.find((member) => member.id === id)?.name ?? 'Family';
  const who = (event: CalendarEvent) =>
    event.memberIds.length === household.members.length && household.members.length > 1
      ? 'Everyone'
      : event.memberIds.map(name).join(', ');
  const weather = weatherState.data;

  const photos = paired ? (household.photos || []).filter((photo) => photo.selected).sort((a, b) => a.order - b.order) : [];
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoSource, setPhotoSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const photo = photos.length && !night ? photos[photoIndex % photos.length] : undefined;
  useEffect(() => {
    if (photos.length < 2 || night) return;
    const timer = setInterval(() => setPhotoIndex((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, [photos.length, night]);
  useEffect(() => {
    let active = true;
    setPhotoSource(null);
    if (photo) {
      void familyAgentClient
        .imageSource(`v1/photos/${photo.id}/tv`)
        .then((value) => active && setPhotoSource(value))
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [photo?.id]);

  if (night) {
    const morning = tomorrow.find((event) => !event.allDay) ?? tomorrow[0];
    const dim = '#8A8074';
    return (
      <Pressable
        testID="wall-calendar-night"
        accessibilityLabel="Wall calendar, night mode. Press any button to use FamilyOS."
        onPress={onExit}
        style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 18, transform: [{ translateX: dx }, { translateY: dy }] }}>
          <DText heading size={220} weight={700} color={dim} style={{ letterSpacing: -4 }}>
            {formatTime(now, timezone, false)}
          </DText>
          <DText size={40} color={dim}>
            {formatDate(now, timezone)}
          </DText>
          {morning ? (
            <DText size={32} color="#6B635A" style={{ marginTop: 24 }}>
              Tomorrow · {morning.allDay ? 'All day' : formatTime(morning.startAt, timezone)} · {morning.title} · {who(morning)}
            </DText>
          ) : null}
        </View>
      </Pressable>
    );
  }

  const rows = today.slice(0, MAX_ROWS);
  const showTomorrow = upcoming.length < 3 && hour >= 17 && tomorrow.length > 0;
  return (
    <Pressable
      testID="wall-calendar"
      accessibilityLabel="Wall calendar. Press any button to use FamilyOS."
      onPress={onExit}
      style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, backgroundColor: p.background }}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 64, paddingHorizontal: 96, paddingTop: 64, paddingBottom: 72, transform: [{ translateX: dx }, { translateY: dy }] }}>
        <View style={{ width: 700, gap: 22 }}>
          <DText heading size={176} weight={700} style={{ letterSpacing: -4, lineHeight: 190 }}>
            {formatTime(now, timezone, false)}
          </DText>
          <DText size={42} weight={700}>
            {formatDate(now, timezone)}
          </DText>
          {weather ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <WeatherIcon condition={weather.condition} size={44} color={p.ink} />
              <DText size={34} weight={700}>
                {weather.temperatureF}°
              </DText>
              <DText size={30} color={p.muted} numberOfLines={1} style={{ flex: 1 }}>
                H {weather.highF}° L {weather.lowF}° · {weather.condition}
              </DText>
            </View>
          ) : null}
          {next ? (
            <View testID="wall-next-up" style={{ marginTop: 12, padding: 28, borderRadius: 32, gap: 8, backgroundColor: p.nextUp, borderWidth: 2, borderColor: p.nextBorder }}>
              <DText size={22} weight={800} color={p.muted} style={{ letterSpacing: 3.2 }}>
                NEXT UP · {formatTime(next.startAt, timezone)}
              </DText>
              <DText heading size={46} weight={700} numberOfLines={2}>
                {next.title}
              </DText>
              <DText size={28} color={p.muted} numberOfLines={1}>
                {who(next)}
                {next.travelMinutes || next.arrivalMinutes
                  ? ` · leave by ${formatTime(new Date(Date.parse(next.startAt) - ((next.travelMinutes || 0) + (next.arrivalMinutes || 0)) * 60_000), timezone)}`
                  : next.location
                    ? ` · ${next.location}`
                    : ''}
              </DText>
            </View>
          ) : (
            <View style={{ marginTop: 12, padding: 28, borderRadius: 32, backgroundColor: p.card }}>
              <DText size={32} weight={700}>
                Nothing else today
              </DText>
            </View>
          )}
          {dinner ? (
            <DText size={30} numberOfLines={1}>
              <DText size={30} weight={800}>Dinner </DText>
              {dinner.title}
            </DText>
          ) : null}
          {childIds.length ? (
            <DText size={30} numberOfLines={1} color={choresLeft.length ? p.ink : p.muted}>
              <DText size={30} weight={800}>Chores </DText>
              {choresLeft.length ? choresLeft.map((item) => `${name(item.id)} ${item.count} left`).join(' · ') : 'all done today'}
            </DText>
          ) : null}
          {photo && photoSource ? (
            <View style={{ flex: 1, minHeight: 0, marginTop: 6, borderRadius: 28, overflow: 'hidden', backgroundColor: '#1F1B16' }}>
              <Image
                source={photoSource}
                accessibilityLabel={photo.caption || 'Family photo'}
                resizeMode="cover"
                style={{ width: '100%', height: '100%', transform: [{ rotate: `${photo.rotation}deg` }] }}
              />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 24 }}>
            <DText size={26} weight={800} color={p.muted} style={{ letterSpacing: 4 }}>
              TODAY
            </DText>
            <DText size={24} color={p.muted}>
              {today.length} {today.length === 1 ? 'item' : 'items'}
            </DText>
          </View>
          {rows.map((event) => {
            const past = !event.allDay && Date.parse(event.endAt) <= now.getTime();
            const family = event.memberIds.length === household.members.length && household.members.length > 1;
            const c = memberColor(family ? 'family' : event.ownerMemberId, p.dark);
            return (
              <View key={event.id} style={{ height: 78, flexDirection: 'row', alignItems: 'center', gap: 22, paddingHorizontal: 18, borderRadius: 20, backgroundColor: event.id === next?.id ? p.card : 'transparent', opacity: past ? 0.45 : 1 }}>
                <DText size={event.allDay ? 24 : 30} weight={700} color={event.allDay ? p.muted : p.ink} style={{ width: 132, textAlign: 'right' }}>
                  {event.allDay ? 'All day' : formatTime(event.startAt, timezone, false)}
                </DText>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.accent }} />
                <DText size={36} weight={600} numberOfLines={1} style={{ flex: 1 }}>
                  {event.title}
                </DText>
                {flagged.has(event.id) && event.responsibilityType ? (
                  <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: p.warning }}>
                    <DText size={22} weight={800} color={p.warningInk}>
                      Needs a driver
                    </DText>
                  </View>
                ) : null}
                {family ? (
                  <DText size={26} weight={700} color={p.muted}>
                    Everyone
                  </DText>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {event.memberIds.slice(0, 3).map((id) => {
                      const member = household.members.find((item) => item.id === id);
                      return member ? <Avatar key={id} id={id} initials={member.initials} size={44} pastel /> : null;
                    })}
                  </View>
                )}
              </View>
            );
          })}
          {today.length > rows.length ? (
            <DText size={26} color={p.muted} style={{ paddingLeft: 172 }}>
              +{today.length - rows.length} more today
            </DText>
          ) : null}
          {!today.length ? (
            <DText size={34} color={p.muted} style={{ marginTop: 24 }}>
              A free day. Nothing on the calendar.
            </DText>
          ) : null}
          {showTomorrow ? (
            <View style={{ marginTop: 18, gap: 10 }}>
              <DText size={26} weight={800} color={p.muted} style={{ letterSpacing: 4 }}>
                TOMORROW
              </DText>
              {tomorrow.slice(0, 3).map((event) => (
                <View key={event.id} style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 22, paddingHorizontal: 18 }}>
                  <DText size={26} weight={700} color={p.muted} style={{ width: 132, textAlign: 'right' }}>
                    {event.allDay ? 'All day' : formatTime(event.startAt, timezone, false)}
                  </DText>
                  <DText size={30} numberOfLines={1} style={{ flex: 1 }}>
                    {event.title}
                  </DText>
                  <DText size={24} color={p.muted}>
                    {who(event)}
                  </DText>
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <DText size={22} color={p.muted} style={{ textAlign: 'right' }}>
            Press any button on the remote to use FamilyOS
          </DText>
        </View>
      </View>
    </Pressable>
  );
}
