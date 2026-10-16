import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { CalendarEvent, Conflict, HouseholdSnapshot, ProviderState, WeatherForecast, weatherSceneName } from '@familyos/domain';
import {
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
import WeatherScene from '../components/WeatherScene';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ForcedFamilyTheme } from '../theme/FamilyTheme';

/**
 * Seconds without remote input before the TV turns into the wall calendar: 5 minutes, unless the build sets
 * EXPO_PUBLIC_FAMILYOS_WALL_IDLE_SECONDS (10–3600), for example 30 for filming: .\familyos.ps1 tv -IdleSeconds 30
 */
export function wallIdleSeconds(value: string | undefined): number {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= 10 && seconds <= 3600 ? seconds : 300;
}
export const WALL_IDLE_SECONDS = wallIdleSeconds(process.env.EXPO_PUBLIC_FAMILYOS_WALL_IDLE_SECONDS);

/** "30 seconds", "5 minutes", "1 minute 30 seconds". */
export function idleLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts = [
    minutes ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : '',
    rest ? `${rest} ${rest === 1 ? 'second' : 'seconds'}` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

const NIGHT_FROM = 22;
const NIGHT_UNTIL = 6;
/** How often the wall asks Hometide for a fresh note (the service caches it for 15 minutes too). */
const NOTE_REFRESH_MS = 15 * 60_000;
/** Plans shown in the bottom strip; the full calendar is one button press away. */
const STRIP_PLANS = 3;
/** Dark glass cards over the landscape: readable from the couch, with the scene showing around them. */
const GLASS = 'rgba(12, 14, 22, 0.58)';
const GLASS_STRONG = 'rgba(12, 14, 22, 0.70)';
const GLASS_EDGE = 'rgba(255, 255, 255, 0.14)';
const LABEL = '#F2C98A';
const SOFT = 'rgba(255, 255, 255, 0.78)';
// Text drawn straight on the landscape gets a soft shadow so it reads on bright skies too.
const ON_SCENE = { textShadowColor: 'rgba(0, 0, 0, 0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 14 };
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

/** The same event for two kids (School for Emma, School for Leo) shows once, with both of them. */
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

export interface FamilyWallScreenProps {
  household: HouseholdSnapshot;
  now: Date;
  weatherState: ProviderState<WeatherForecast>;
  paired: boolean;
  onExit: () => void;
  /** Events in a conflict get a warning, so the wall shows what needs fixing. */
  conflicts?: Conflict[];
}

/**
 * The idle TV as a living wall: a looping landscape that follows the real weather and the time of day, with
 * the time, the forecast, Hometide's note and the next plans on top. Any button returns to Hometide.
 */
export default function FamilyWallScreen(props: FamilyWallScreenProps) {
  return (
    <ForcedFamilyTheme mode="dark">
      <WallContent {...props} />
    </ForcedFamilyTheme>
  );
}

/** Hometide's note for the wall ("Rain from about 3 PM. Emma's soccer is at 4:00 PM, so pack rain jackets."). */
function useWallNote(paired: boolean) {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!paired) {
      setNote(null);
      return undefined;
    }
    let active = true;
    const load = () => {
      void familyAgentClient
        .getWallNote()
        .then((reply) => active && setNote(reply.data.note))
        .catch(() => undefined); // Keep the last note; the rest of the wall is still there.
    };
    load();
    const timer = setInterval(load, NOTE_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [paired]);
  return note;
}

function WallContent({ household, now, weatherState, paired, onExit, conflicts = [] }: FamilyWallScreenProps) {
  const p = useDesignPalette(true);
  const timezone = household.family.timezone;
  const todayKey = localDateKey(now, timezone);
  const clock = localClock(now, timezone);
  const night = clock.hour >= NIGHT_FROM || clock.hour < NIGHT_UNTIL;
  const [dx, dy] = SHIFTS[now.getMinutes() % SHIFTS.length];
  const today = household.events.filter((event) => eventOnDay(event, todayKey, timezone)).sort(byTime);
  const tomorrow = household.events.filter((event) => eventOnDay(event, shiftDay(todayKey, 1), timezone)).sort(byTime);
  const upcoming = today.filter((event) => !event.allDay && Date.parse(event.endAt) > now.getTime());
  const next = upcoming.find((event) => Date.parse(event.startAt) >= now.getTime()) ?? upcoming[0];
  const flagged = new Set(conflicts.filter((item) => item.type === 'responsibility_overlap').flatMap((item) => item.eventIds));
  const dinner = (household.meals || []).find((meal) => meal.date === todayKey && meal.category === 'Dinner');
  const name = (id?: string | null) => household.members.find((member) => member.id === id)?.name ?? 'Family';
  const everyone = (ids: string[]) => ids.length === household.members.length && household.members.length > 1;
  const who = (ids: string[]) => (everyone(ids) ? 'Everyone' : ids.map(name).join(', '));
  const needsDriver = (event: CalendarEvent, ids = [event.id]) => ids.some((id) => flagged.has(id)) && !!event.responsibilityType;
  const weather = weatherState.data;
  const note = useWallNote(paired);
  const reduceMotion = useReducedMotion();
  const scene = weatherSceneName({
    condition: weather?.condition,
    temperatureF: weather?.temperatureF,
    hour: clock.hour,
    isDaytime: weather?.isDaytime,
    dayIndex: Math.floor(Date.parse(`${todayKey}T12:00:00Z`) / 86_400_000),
  });

  if (night) {
    const morning = tomorrow.find((event) => !event.allDay) ?? tomorrow[0];
    const dim = '#C9C2B6';
    return (
      <Pressable
        testID="wall-calendar-night"
        accessibilityLabel="Wall calendar, night mode. Press any button to use Hometide."
        onPress={onExit}
        style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, backgroundColor: '#05070F', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <WeatherScene scene={scene} animate={!reduceMotion} dim={0.35} />
        <View style={{ alignItems: 'center', gap: 18, transform: [{ translateX: dx }, { translateY: dy }] }}>
          <DText heading size={220} weight={700} color={dim} style={[{ letterSpacing: -4 }, ON_SCENE]}>
            {formatTime(now, timezone, false)}
          </DText>
          <DText size={40} color={dim} style={ON_SCENE}>
            {formatDate(now, timezone)}
          </DText>
          {morning ? (
            <DText size={32} color="#B5AEA2" style={[{ marginTop: 24 }, ON_SCENE]}>
              Tomorrow · {morning.allDay ? 'All day' : formatTime(morning.startAt, timezone)} · {morning.title} · {who(morning.memberIds)}
            </DText>
          ) : null}
          {note ? (
            <DText testID="wall-note" size={28} color="#B5AEA2" numberOfLines={2} style={[{ maxWidth: 1200, textAlign: 'center' }, ON_SCENE]}>
              {note}
            </DText>
          ) : null}
        </View>
      </Pressable>
    );
  }

  const time = formatTime(now, timezone, false);
  const meridiem = formatTime(now, timezone).slice(time.length).trim();
  const minutesAway = next ? Math.round((Date.parse(next.startAt) - now.getTime()) / 60_000) : 0;
  const leaveBy = next && (next.travelMinutes || next.arrivalMinutes)
    ? formatTime(new Date(Date.parse(next.startAt) - ((next.travelMinutes || 0) + (next.arrivalMinutes || 0)) * 60_000), timezone)
    : null;
  // The bottom strip: the plans after "next up", so nothing shows twice.
  const strip = mergeSame(upcoming).filter(({ event }) => event.id !== next?.id).slice(0, STRIP_PLANS);

  return (
    <Pressable
      testID="wall-calendar"
      accessibilityLabel="Wall calendar. Press any button to use Hometide."
      onPress={onExit}
      style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, backgroundColor: '#11141C' }}>
      <WeatherScene scene={scene} animate={!reduceMotion} />
      <View style={{ flex: 1, paddingHorizontal: 96, paddingTop: 60, paddingBottom: 54, justifyContent: 'space-between',
        transform: [{ translateX: dx }, { translateY: dy }] }}>
        {/* The time and the weather, straight on the sky. */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
              <DText heading size={168} weight={700} color="#FFFFFF" style={[{ letterSpacing: -4, lineHeight: 172 }, ON_SCENE]}>
                {time}
              </DText>
              <DText size={42} weight={700} color={SOFT} style={[{ marginBottom: 30 }, ON_SCENE]}>
                {meridiem}
              </DText>
            </View>
            <DText size={38} weight={700} color={SOFT} style={ON_SCENE}>
              {formatDate(now, timezone)}
            </DText>
          </View>
          {weather ? (
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <WeatherIcon condition={weather.condition} size={64} color="#FFFFFF" />
                <DText heading size={136} weight={700} color="#FFFFFF" style={[{ lineHeight: 140 }, ON_SCENE]}>
                  {weather.temperatureF}°
                </DText>
              </View>
              <DText size={38} weight={800} color="#FFFFFF" numberOfLines={1} style={[{ maxWidth: 640, textAlign: 'right' }, ON_SCENE]}>
                {weather.condition}
              </DText>
              <DText size={30} color={SOFT} style={ON_SCENE}>
                H {weather.highF}° L {weather.lowF}°
              </DText>
            </View>
          ) : null}
        </View>

        {/* Hometide's note and the next plan. */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch', gap: 32 }}>
          {note ? (
            <View testID="wall-note" style={{ width: 1000, padding: 32, borderRadius: 30, gap: 10, backgroundColor: GLASS }}>
              <DText size={22} weight={800} color={LABEL} style={{ letterSpacing: 3 }}>
                HOMETIDE · TODAY
              </DText>
              <DText size={36} weight={600} color="#FFFFFF" numberOfLines={3} style={{ lineHeight: 46 }}>
                {note}
              </DText>
            </View>
          ) : (
            <View style={{ width: 1000 }} />
          )}
          {next ? (
            <View testID="wall-next-up" style={{ width: 600, padding: 30, borderRadius: 30, gap: 6, backgroundColor: GLASS_STRONG,
              borderWidth: 2, borderColor: GLASS_EDGE }}>
              <DText size={22} weight={800} color={LABEL} style={{ letterSpacing: 3 }}>
                {`NEXT UP · ${formatTime(next.startAt, timezone)}${minutesAway > 0 && minutesAway < 120 ? ` · IN ${minutesAway} MIN` : ''}`}
              </DText>
              <DText heading size={46} weight={700} color="#FFFFFF" numberOfLines={1}>
                {next.title}
              </DText>
              <DText size={28} color={SOFT} numberOfLines={1}>
                {who(next.memberIds)}
                {leaveBy ? ` · leave by ${leaveBy}` : next.location ? ` · ${next.location}` : ''}
              </DText>
              {needsDriver(next) ? <DriverBadge warning={p.warning} ink={p.warningInk} /> : null}
            </View>
          ) : (
            <View testID="wall-next-up" style={{ width: 600, padding: 30, borderRadius: 30, backgroundColor: GLASS_STRONG, justifyContent: 'center' }}>
              <DText size={34} weight={700} color="#FFFFFF">
                Nothing else today
              </DText>
            </View>
          )}
        </View>

        {/* One slim strip: the rest of today, and dinner. */}
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 26, paddingVertical: 18, borderRadius: 26,
            backgroundColor: GLASS }}>
            <DText size={20} weight={800} color={LABEL} style={{ letterSpacing: 3, marginRight: 8 }}>
              TODAY
            </DText>
            {strip.length ? (
              strip.map(({ event, memberIds, ids }) => {
                const color = memberColor(everyone(memberIds) ? 'family' : event.ownerMemberId, true);
                return (
                  <View key={event.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 420 }}>
                    <View style={{ width: 10, height: 34, borderRadius: 5, backgroundColor: color.accent }} />
                    <DText size={24} weight={700} color={SOFT}>
                      {formatTime(event.startAt, timezone)}
                    </DText>
                    <DText size={26} weight={800} color="#FFFFFF" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {event.title}
                    </DText>
                    {needsDriver(event, ids) ? <DriverBadge warning={p.warning} ink={p.warningInk} /> : null}
                  </View>
                );
              })
            ) : (
              <DText size={26} weight={700} color={SOFT}>
                Nothing else on the calendar
              </DText>
            )}
            <View style={{ flex: 1 }} />
            {dinner ? (
              <DText size={24} color={SOFT} numberOfLines={1} style={{ maxWidth: 420 }}>
                Dinner · <DText size={24} weight={800} color="#FFFFFF">{dinner.title}</DText>
              </DText>
            ) : null}
          </View>
          <DText size={20} color="rgba(255, 255, 255, 0.6)" style={[{ textAlign: 'right' }, ON_SCENE]}>
            Press any button on the remote to use Hometide
          </DText>
        </View>
      </View>
    </Pressable>
  );
}

function DriverBadge({ warning, ink }: { warning: string; ink: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: warning }}>
      <DText size={20} weight={800} color={ink}>
        Needs a driver
      </DText>
    </View>
  );
}
