import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { CalendarEvent, Conflict, HouseholdSnapshot, ProviderState, WeatherForecast, weatherSceneName } from '@familyos/domain';
import { DText, dateTimeFormat, eventOnDay, formatDate, formatTime, localDateKey } from '../design/DesignSystem';
import { familyAgentClient } from '../api/familyAgentClient';
import WeatherScene from '../components/WeatherScene';
import { dueReminder, WallReminder } from '../components/ReminderToast';
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
/** A due event warns in the house's warm accent. */
const WARN = '#F2C98A';
const NONE_SHOWN: ReadonlySet<string> = new Set();
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

export interface FamilyWallScreenProps {
  household: HouseholdSnapshot;
  now: Date;
  weatherState: ProviderState<WeatherForecast>;
  paired: boolean;
  onExit: () => void;
  /** Events in a conflict get a warning, so the wall shows what needs fixing. */
  conflicts?: Conflict[];
  /** Minutes before a timed event that its reminder shows on the wall (the phone app's TV setting); 0 is off. */
  reminderMinutes?: number;
}

/**
 * The idle TV as a living wall: a looping landscape that follows the real weather and the time of day, with one
 * calm, centred stack on top: the time, the date, the next plan, Hometide's note, and a reminder when an event is
 * close. At night (10 PM to 6 AM) the same stack dims. Any button returns to Hometide.
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

function WallContent({ household, now, weatherState, paired, onExit, conflicts = [], reminderMinutes = 15 }: FamilyWallScreenProps) {
  const timezone = household.family.timezone;
  const todayKey = localDateKey(now, timezone);
  const clock = localClock(now, timezone);
  const night = clock.hour >= NIGHT_FROM || clock.hour < NIGHT_UNTIL;
  const [dx, dy] = SHIFTS[now.getMinutes() % SHIFTS.length];
  const today = household.events.filter((event) => eventOnDay(event, todayKey, timezone)).sort(byTime);
  const tomorrow = household.events.filter((event) => eventOnDay(event, shiftDay(todayKey, 1), timezone)).sort(byTime);
  const flagged = new Set(conflicts.filter((item) => item.type === 'responsibility_overlap').flatMap((item) => item.eventIds));
  const name = (id?: string | null) => household.members.find((member) => member.id === id)?.name ?? 'Family';
  const everyone = (ids: string[]) => ids.length === household.members.length && household.members.length > 1;
  const who = (ids: string[]) => (everyone(ids) ? 'Everyone' : ids.map(name).join(', '));
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
  // A reminder shows for the whole lead time (not only when it first fires), since nobody watches an idle TV.
  const reminder = dueReminder(household.events, household.members, now, reminderMinutes, NONE_SHOWN);
  // The next plan today (not the one the reminder already shows); at night, or when today is done, tomorrow's first.
  const nextToday = night
    ? undefined
    : today.find((event) => !event.allDay && Date.parse(event.startAt) >= now.getTime() && `${event.id}|${event.startAt}` !== reminder?.key);
  const morning = tomorrow.find((event) => !event.allDay) ?? tomorrow[0];
  const plan = nextToday ?? morning;
  const planLabel = nextToday ? 'Next' : 'Tomorrow';
  const needsDriver = !!nextToday && flagged.has(nextToday.id) && !!nextToday.responsibilityType;
  const ink = night ? '#C9C2B6' : '#FFFFFF';
  const soft = night ? '#B5AEA2' : 'rgba(255, 255, 255, 0.92)';

  return (
    <Pressable
      testID={night ? 'wall-calendar-night' : 'wall-calendar'}
      accessibilityLabel={`Wall calendar${night ? ', night mode' : ''}. Press any button to use Hometide.`}
      onPress={onExit}
      style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, backgroundColor: night ? '#05070F' : '#11141C',
        alignItems: 'center', justifyContent: 'center' }}>
      <WeatherScene scene={scene} animate={!reduceMotion} dim={night ? 0.35 : 0} />
      <View style={{ alignItems: 'center', gap: 18, transform: [{ translateX: dx }, { translateY: dy }] }}>
        <DText heading size={220} weight={700} color={ink} style={[{ letterSpacing: -4 }, ON_SCENE]}>
          {formatTime(now, timezone, false)}
        </DText>
        <DText size={40} weight={night ? 400 : 700} color={ink} style={ON_SCENE}>
          {formatDate(now, timezone)}
        </DText>
        {plan ? (
          <View testID="wall-next-up" style={{ flexDirection: 'row', marginTop: 24 }}>
            <DText size={32} weight={night ? 400 : 600} color={soft} style={ON_SCENE}>
              {`${planLabel} · ${plan.allDay ? 'All day' : formatTime(plan.startAt, timezone)} · ${plan.title} · ${who(plan.memberIds)}`}
            </DText>
            {needsDriver ? (
              <DText size={32} weight={700} color={WARN} style={ON_SCENE}>
                {' · needs a driver'}
              </DText>
            ) : null}
          </View>
        ) : null}
        {note ? (
          <DText testID="wall-note" size={28} weight={night ? 400 : 600} color={soft} numberOfLines={2}
            style={[{ maxWidth: 1200, textAlign: 'center' }, ON_SCENE]}>
            {note}
          </DText>
        ) : null}
        {reminder ? <WallReminder reminder={reminder} timezone={timezone} /> : null}
      </View>
    </Pressable>
  );
}
