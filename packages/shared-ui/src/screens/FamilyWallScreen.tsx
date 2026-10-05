import React, { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { CalendarEvent, Conflict, HouseholdSnapshot, ProviderState, WeatherForecast } from '@familyos/domain';
import {
  Avatar,
  DText,
  dateTimeFormat,
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
export const WALL_IDLE_MINUTES = 5;
const NIGHT_FROM = 22;
const NIGHT_UNTIL = 6;
const FIRST_HOUR = 7;
const LAST_HOUR = 21;
const MIN_BLOCK = 46;
const GUTTER = 84;
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
// Nudge everything a few pixels each minute so a static layout never burns into the screen.
const SHIFTS = [
  [0, 0],
  [10, 6],
  [20, 0],
  [10, -6],
] as const;

/** Household-local date key and fractional hour, read with formatToParts (Vega pads lone fields). */
function localClock(value: string | Date, timezone: string) {
  const parts = dateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: timezone,
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '0';
  return { day: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) % 24 + Number(part('minute')) / 60 };
}

function shiftDay(dayKey: string, days: number) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const byTime = (a: CalendarEvent, b: CalendarEvent) =>
  Number(!a.allDay) - Number(!b.allDay) || Date.parse(a.startAt) - Date.parse(b.startAt);

/** The same event for two kids (School for Emma, School for Leo) shows as one block with both of them. */
function mergeSame(events: CalendarEvent[]) {
  const groups = new Map<string, { event: CalendarEvent; memberIds: string[]; ids: string[] }>();
  for (const event of events) {
    const key = `${event.title}|${event.startAt}|${event.endAt}|${event.allDay ? 1 : 0}`;
    const group = groups.get(key);
    if (group) {
      group.ids.push(event.id);
      for (const id of event.memberIds) if (!group.memberIds.includes(id)) group.memberIds.push(id);
    } else groups.set(key, { event, memberIds: [...event.memberIds], ids: [event.id] });
  }
  return [...groups.values()];
}

function hourLabel(hour: number) {
  return `${hour % 12 || 12} ${hour < 12 || hour === 24 ? 'AM' : 'PM'}`;
}

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
  const clock = localClock(now, timezone);
  const night = clock.hour >= NIGHT_FROM || clock.hour < NIGHT_UNTIL;
  const [dx, dy] = SHIFTS[now.getMinutes() % SHIFTS.length];
  const today = household.events.filter((event) => eventOnDay(event, todayKey, timezone)).sort(byTime);
  const tomorrowKey = shiftDay(todayKey, 1);
  const tomorrow = household.events.filter((event) => eventOnDay(event, tomorrowKey, timezone)).sort(byTime);
  const upcoming = today.filter((event) => !event.allDay && Date.parse(event.endAt) > now.getTime());
  const next = upcoming.find((event) => Date.parse(event.startAt) >= now.getTime()) ?? upcoming[0];
  const flagged = new Set(conflicts.filter((item) => item.type === 'responsibility_overlap').flatMap((item) => item.eventIds));
  const dinner = (household.meals || []).find((meal) => meal.date === todayKey && meal.category === 'Dinner');
  const children = household.members.filter((member) => member.role === 'child');
  const choresLeft = children.map((member) => ({
    member,
    count: household.chores.filter((chore) => chore.assignedToMemberId === member.id && chore.status === 'pending').length,
  }));
  const name = (id?: string | null) => household.members.find((member) => member.id === id)?.name ?? 'Family';
  const everyone = (ids: string[]) => ids.length === household.members.length && household.members.length > 1;
  const who = (ids: string[]) => (everyone(ids) ? 'Everyone' : ids.map(name).join(', '));
  const weather = weatherState.data;
  const [gridHeight, setGridHeight] = useState(640);

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
        accessibilityLabel="Wall calendar, night mode. Press any button to use Hometide."
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
              Tomorrow · {morning.allDay ? 'All day' : formatTime(morning.startAt, timezone)} · {morning.title} · {who(morning.memberIds)}
            </DText>
          ) : null}
        </View>
      </Pressable>
    );
  }

  // Left column -------------------------------------------------------------------------------------------
  const time = formatTime(now, timezone, false);
  const meridiem = formatTime(now, timezone).slice(time.length).trim();
  const [weekday, ...rest] = formatDate(now, timezone).split(', ');
  const minutesAway = next ? Math.round((Date.parse(next.startAt) - now.getTime()) / 60_000) : 0;
  const leaveBy = next && (next.travelMinutes || next.arrivalMinutes)
    ? formatTime(new Date(Date.parse(next.startAt) - ((next.travelMinutes || 0) + (next.arrivalMinutes || 0)) * 60_000), timezone)
    : null;

  // Calendar ------------------------------------------------------------------------------------------------
  const weekStart = shiftDay(todayKey, -new Date(`${todayKey}T12:00:00Z`).getUTCDay());
  const week = Array.from({ length: 7 }, (_, index) => {
    const key = shiftDay(weekStart, index);
    const items = household.events.filter((event) => eventOnDay(event, key, timezone));
    const members = [...new Set(items.flatMap((event) => (everyone(event.memberIds) ? ['family'] : event.memberIds)))];
    return { key, date: Number(key.slice(8, 10)), label: WEEKDAYS[index], count: items.length, members: members.slice(0, 4) };
  });
  const allDay = mergeSame(today.filter((event) => event.allDay));
  const timed = mergeSame(today.filter((event) => !event.allDay));
  const span = timed.map(({ event }) => {
    const start = localClock(event.startAt, timezone);
    const end = localClock(event.endAt, timezone);
    return { start: start.day < todayKey ? 0 : start.hour, end: end.day > todayKey ? 24 : end.hour };
  });
  const firstHour = Math.min(FIRST_HOUR, ...span.map((item) => Math.floor(item.start)));
  const lastHour = Math.min(24, Math.max(LAST_HOUR, ...span.map((item) => Math.ceil(item.end))));
  const hourPx = gridHeight / Math.max(1, lastHour - firstHour);
  // Lay out blocks by how tall they look (short events get a readable minimum), then give overlaps lanes.
  const blocks = timed
    .map((group, index) => {
      const top = (Math.max(firstHour, span[index].start) - firstHour) * hourPx;
      const height = Math.max(MIN_BLOCK, (Math.min(lastHour, span[index].end) - Math.max(firstHour, span[index].start)) * hourPx - 4);
      return { ...group, top, height, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.top - b.top);
  let cluster: typeof blocks = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    const lanes = Math.max(1, ...cluster.map((item) => item.lane + 1));
    cluster.forEach((item) => {
      item.lanes = lanes;
    });
  };
  for (const block of blocks) {
    if (block.top >= clusterEnd) {
      closeCluster();
      cluster = [];
    }
    const taken = cluster.filter((other) => other.top + other.height > block.top).map((other) => other.lane);
    while (taken.includes(block.lane)) block.lane += 1;
    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.top + block.height);
  }
  closeCluster();
  const nowTop = (clock.hour - firstHour) * hourPx;
  const nowColor = p.dark ? '#FFAA80' : '#C2410C';

  return (
    <Pressable
      testID="wall-calendar"
      accessibilityLabel="Wall calendar. Press any button to use Hometide."
      onPress={onExit}
      style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, backgroundColor: p.background }}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 48, paddingHorizontal: 96, paddingTop: 64, paddingBottom: 56, transform: [{ translateX: dx }, { translateY: dy }] }}>
        {/* Left: the time, the weather, and what's next. */}
        <View style={{ width: 560, gap: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: -12 }}>
            <DText heading size={164} weight={700} style={{ letterSpacing: -4, lineHeight: 170 }}>
              {time}
            </DText>
            <DText size={40} weight={700} color={p.muted} style={{ marginBottom: 28 }}>
              {meridiem}
            </DText>
          </View>
          <View style={{ gap: 2 }}>
            <DText size={40} weight={800}>
              {weekday}
            </DText>
            <DText size={30} color={p.muted}>
              {rest.join(', ')}
            </DText>
          </View>
          {weather ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <WeatherIcon condition={weather.condition} size={40} color={p.ink} />
              <DText size={32} weight={800}>
                {weather.temperatureF}°
              </DText>
              <DText size={26} color={p.muted} numberOfLines={1} style={{ flex: 1 }}>
                H {weather.highF}° L {weather.lowF}° · {weather.condition}
              </DText>
            </View>
          ) : null}
          {next ? (
            <View testID="wall-next-up" style={{ padding: 26, borderRadius: 28, gap: 6, backgroundColor: p.nextUp, borderWidth: 2, borderColor: p.nextBorder }}>
              <DText size={20} weight={800} color={p.muted} style={{ letterSpacing: 3 }}>
                {`NEXT UP · ${formatTime(next.startAt, timezone)}${minutesAway > 0 && minutesAway < 120 ? ` · IN ${minutesAway} MIN` : ''}`}
              </DText>
              <DText heading size={42} weight={700} numberOfLines={1}>
                {next.title}
              </DText>
              <DText size={24} color={p.muted} numberOfLines={1}>
                {who(next.memberIds)}
                {leaveBy ? ` · leave by ${leaveBy}` : next.location ? ` · ${next.location}` : ''}
              </DText>
            </View>
          ) : (
            <View style={{ padding: 26, borderRadius: 28, backgroundColor: p.card }}>
              <DText size={30} weight={700}>
                Nothing else today
              </DText>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1, padding: 18, borderRadius: 22, backgroundColor: p.card, gap: 4 }}>
              <DText size={18} weight={800} color={p.muted} style={{ letterSpacing: 2.5 }}>
                DINNER
              </DText>
              <DText size={24} weight={700} numberOfLines={2}>
                {dinner ? dinner.title : 'Not planned yet'}
              </DText>
            </View>
            {children.length ? (
              <View style={{ flex: 1, padding: 18, borderRadius: 22, backgroundColor: p.card, gap: 8 }}>
                <DText size={18} weight={800} color={p.muted} style={{ letterSpacing: 2.5 }}>
                  CHORES LEFT
                </DText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {choresLeft.map(({ member, count }) => (
                    <View key={member.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Avatar id={member.id} initials={member.initials} size={32} pastel />
                      <DText size={24} weight={700} color={count ? p.ink : p.muted}>
                        {count ? count : '✓'}
                      </DText>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
          {photo && photoSource ? (
            <View style={{ flex: 1, minHeight: 0, borderRadius: 28, overflow: 'hidden', backgroundColor: '#1F1B16' }}>
              <Image
                source={photoSource}
                accessibilityLabel={photo.caption || 'Family photo'}
                resizeMode="cover"
                style={{ width: '100%', height: '100%', transform: [{ rotate: `${photo.rotation}deg` }] }}
              />
            </View>
          ) : (
            <View style={{ flex: 1, minHeight: 0, padding: 22, borderRadius: 28, borderWidth: 2, borderColor: p.border, gap: 10 }}>
              <DText size={18} weight={800} color={p.muted} style={{ letterSpacing: 2.5 }}>
                TOMORROW
              </DText>
              {tomorrow.length ? (
                mergeSame(tomorrow).slice(0, 5).map(({ event, memberIds }) => (
                  <View key={event.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <DText size={22} weight={700} color={p.muted} numberOfLines={1} style={{ width: 118 }}>
                      {event.allDay ? 'All day' : formatTime(event.startAt, timezone)}
                    </DText>
                    <DText size={24} numberOfLines={1} style={{ flex: 1 }}>
                      {event.title}
                    </DText>
                    <DText size={20} color={p.muted} numberOfLines={1} style={{ maxWidth: 140 }}>
                      {who(memberIds)}
                    </DText>
                  </View>
                ))
              ) : (
                <DText size={24} color={p.muted}>
                  Nothing planned yet.
                </DText>
              )}
            </View>
          )}
          <DText size={20} color={p.muted}>
            Press any button on the remote to use Hometide
          </DText>
        </View>

        {/* Right: the week, then today as a calendar. */}
        <View style={{ flex: 1, minWidth: 0, padding: 28, paddingBottom: 24, borderRadius: 32, backgroundColor: p.card, gap: 18 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {week.map((day) => {
              const isToday = day.key === todayKey;
              const past = day.key < todayKey;
              return (
                <View
                  key={day.key}
                  style={{ flex: 1, height: 96, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 4,
                    backgroundColor: isToday ? p.selected : p.background, opacity: past ? 0.55 : 1 }}>
                  <DText size={17} weight={800} color={isToday ? p.onSelected : p.muted} style={{ letterSpacing: 1.6 }}>
                    {day.label}
                  </DText>
                  <DText size={32} weight={800} color={isToday ? p.onSelected : p.ink}>
                    {day.date}
                  </DText>
                  <View style={{ flexDirection: 'row', gap: 5, height: 9 }}>
                    {day.members.map((id) => (
                      <View key={id} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: memberColor(id, p.dark).accent }} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingLeft: GUTTER }}>
            <DText size={22} weight={800} color={p.muted} style={{ letterSpacing: 3.5 }}>
              TODAY
            </DText>
            <DText size={22} color={p.muted}>
              {today.length} {today.length === 1 ? 'event' : 'events'}
            </DText>
          </View>
          {allDay.length ? (
            <View style={{ flexDirection: 'row', gap: 10, paddingLeft: GUTTER }}>
              {allDay.slice(0, 3).map(({ event, memberIds }) => {
                const c = memberColor(everyone(memberIds) ? 'family' : memberIds[0], p.dark);
                return (
                  <View key={event.id} style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 44, borderRadius: 14, backgroundColor: c.surface }}>
                    <DText size={18} weight={800} color={c.ink} style={{ letterSpacing: 1.5 }}>
                      ALL DAY
                    </DText>
                    <DText size={22} weight={700} color={c.ink} numberOfLines={1}>
                      {event.title}
                    </DText>
                  </View>
                );
              })}
            </View>
          ) : null}
          <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }} onLayout={(event) => setGridHeight(Math.max(200, event.nativeEvent.layout.height))}>
            <View style={{ width: GUTTER }}>
              {Array.from({ length: lastHour - firstHour + 1 }, (_, index) => (
                <DText key={index} size={17} color={p.muted}
                  style={{ position: 'absolute', top: index * hourPx - 10, right: 14 }}>
                  {hourLabel(firstHour + index)}
                </DText>
              ))}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {Array.from({ length: lastHour - firstHour + 1 }, (_, index) => (
                <View key={index} style={{ position: 'absolute', top: index * hourPx, left: 0, right: 0, height: 1, backgroundColor: p.border }} />
              ))}
              {blocks.map((block) => {
                const { event, memberIds } = block;
                const c = memberColor(everyone(memberIds) ? 'family' : event.ownerMemberId, p.dark);
                const past = Date.parse(event.endAt) <= now.getTime();
                const tall = block.height >= 76;
                const conflict = block.ids.some((id) => flagged.has(id)) && !!event.responsibilityType;
                return (
                  <View key={event.id}
                    style={{ position: 'absolute', top: block.top + 2, height: block.height, left: `${(block.lane / block.lanes) * 100}%`, width: `${100 / block.lanes}%`, paddingRight: 8 }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: tall ? 'flex-start' : 'center', gap: 12, paddingHorizontal: 14,
                      paddingVertical: tall ? 10 : 2, borderRadius: 14, borderLeftWidth: 6, borderLeftColor: c.accent, backgroundColor: c.surface,
                      opacity: past ? 0.5 : 1, overflow: 'hidden' }}>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <DText size={24} weight={800} color={c.ink} numberOfLines={1}>
                          {tall ? event.title : `${formatTime(event.startAt, timezone, false)}  ${event.title}`}
                        </DText>
                        {tall ? (
                          <DText size={19} color={c.ink} numberOfLines={1}>
                            {formatTime(event.startAt, timezone)} – {formatTime(event.endAt, timezone)}
                            {event.location ? ` · ${event.location}` : ''}
                          </DText>
                        ) : null}
                      </View>
                      {conflict ? (
                        <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: p.warning }}>
                          <DText size={18} weight={800} color={p.warningInk}>
                            Needs a driver
                          </DText>
                        </View>
                      ) : null}
                      {block.lanes < 3 ? (
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          {(everyone(memberIds) ? [] : memberIds.slice(0, 3)).map((id) => {
                            const member = household.members.find((item) => item.id === id);
                            return member ? <Avatar key={id} id={id} initials={member.initials} size={32} pastel /> : null;
                          })}
                          {everyone(memberIds) ? (
                            <DText size={18} weight={800} color={c.ink}>
                              Everyone
                            </DText>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
              {nowTop >= 0 && nowTop <= gridHeight ? (
                <View pointerEvents="none" style={{ position: 'absolute', top: nowTop - 1, left: -8, right: 0, height: 3, backgroundColor: nowColor, borderRadius: 2 }}>
                  <View style={{ position: 'absolute', left: -6, top: -6, width: 15, height: 15, borderRadius: 8, backgroundColor: nowColor }} />
                </View>
              ) : null}
              {!timed.length ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <DText size={30} color={p.muted}>
                    A free day. Nothing on the calendar.
                  </DText>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
