import React, { useState } from 'react';
import { View } from 'react-native';
import { SpatialNavigationNode, SpatialNavigationScrollView } from 'react-tv-space-navigation';
import { CalendarEvent } from '@familyos/domain';
import {
  Avatar,
  Check,
  DAction,
  DButton,
  DFooter,
  DIcon,
  DPanel,
  DRow,
  DText,
  eventOnDay,
  eventTimeLabel,
  formatDate,
  formatTime,
  localDateKey,
  memberColor,
  useDesignPalette,
} from '../design/DesignSystem';
import { FamilyScreenProps } from './familyTypes';
import { usePageBack } from '../hooks/usePageBack';

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export function calendarDays(anchor: string, count = 7, week = true) {
  const start = new Date(`${anchor}T12:00:00Z`);
  if (week) start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      key: date.toISOString().slice(0, 10),
      date,
      // Vega's JS engine adds default date fields when only `weekday` is requested
      // ("SUN, 9/20/2026"), so derive the short label from the UTC weekday index.
      label: WEEKDAY_LABELS[date.getUTCDay()],
    };
  });
}
const localHour = (value: string | Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    timeZone: timezone,
  }).formatToParts(new Date(value));
  return (
    Number(parts.find((p) => p.type === 'hour')?.value) + Number(parts.find((p) => p.type === 'minute')?.value) / 60
  );
};

export default function FamilyCalendarScreen(props: FamilyScreenProps) {
  const { household, now, calendarState, focusActive } = props;
  const p = useDesignPalette();
  const timezone = household.family.timezone;
  const today = localDateKey(now, timezone);
  const [anchor, setAnchor] = useState(props.initialDay ?? today);
  const [view, setView] = useState<'Day' | 'Week' | 'Month'>(props.initialDay ? 'Day' : 'Week');
  const [selectedId, setSelectedId] = useState<string | null>(props.initialEventId ?? null);
  usePageBack(() => setSelectedId(null), selectedId !== null);
  const [members, setMembers] = useState(household.members.map((member) => member.id));
  const monthDays = calendarDays(`${anchor.slice(0, 7)}-01`, 42);
  const days = view === 'Month' ? monthDays : view === 'Day' ? calendarDays(anchor, 1, false) : calendarDays(anchor);
  const providerEvents = ['unavailable', 'empty'].includes(calendarState.status) ? [] : household.events;
  const events = providerEvents.filter(
    (event) =>
      event.memberIds.some((id) => members.includes(id)) && days.some((day) => eventOnDay(event, day.key, timezone)),
  );
  const allDay = events.filter((event) => event.allDay);
  const selected = household.events.find((event) => event.id === selectedId);
  const move = (direction: number) => {
    const date = new Date(`${anchor}T12:00:00Z`);
    if (view === 'Month') {
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + direction);
    } else date.setUTCDate(date.getUTCDate() + direction * (view === 'Week' ? 7 : 1));
    setAnchor(date.toISOString().slice(0, 10));
  };
  const monthName = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const title =
    view === 'Month'
      ? `${monthName(new Date(`${anchor}T12:00:00Z`))} ${anchor.slice(0, 4)}`
      : view === 'Day'
        ? `${monthName(days[0].date)} ${days[0].date.getUTCDate()}`
        : `${monthName(days[0].date)} ${days[0].date.getUTCDate()} – ${days[6].date.getUTCMonth() !== days[0].date.getUTCMonth() ? monthName(days[6].date) + ' ' : ''}${days[6].date.getUTCDate()}`;
  if (selected) return <EventDetails {...props} event={selected} onClose={() => setSelectedId(null)} />;
  return (
    <View style={{ flex: 1, paddingBottom: 20 }}>
      <DRow style={{ height: 89, alignItems: 'flex-end', gap: 14 }}>
        <View style={{ minWidth: 476, gap: 8 }}>
          <DText size={22} weight={700} color={p.muted} style={{ letterSpacing: 1.1 }}>
            {formatDate(now, timezone).toUpperCase()}
          </DText>
          <DText size={56} weight={800} heading style={{ letterSpacing: -1.12 }}>
            {title}
          </DText>
        </View>
        {([-1, 1] as const).map((direction) => (
          <DButton
            key={direction}
            label={direction < 0 ? 'Previous period' : 'Next period'}
            onPress={() => move(direction)}
            active={focusActive}
            radius={28}
            style={{
              width: 56,
              height: 56,
              borderWidth: 2,
              borderColor: p.border,
              backgroundColor: p.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <DIcon name={direction < 0 ? 'left' : 'right'} color={p.ink} />
          </DButton>
        ))}
        <View style={{ flex: 1 }} />
        <DRow style={{ gap: 8, alignItems: 'center', paddingBottom: 5 }}>
          {household.members.map((member) => (
            <DButton
              key={member.id}
              role="checkbox"
              checked={members.includes(member.id)}
              label={`Show ${member.name}`}
              active={focusActive}
              onPress={() =>
                setMembers((current) =>
                  current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id],
                )
              }
              radius={28}
              style={{
                height: 56,
                padding: 7,
                paddingRight: 16,
                gap: 8,
                flexDirection: 'row',
                alignItems: 'center',
                opacity: members.includes(member.id) ? 1 : 0.4,
                backgroundColor: memberColor(member.id, p.dark).surface,
              }}>
              <Avatar id={member.id} initials={member.initials} size={42} />
              <DText size={22} weight={700} color={memberColor(member.id, p.dark).ink}>
                {member.name}
              </DText>
            </DButton>
          ))}
        </DRow>
        <DRow style={{ height: 68, padding: 6, backgroundColor: p.card, borderRadius: 36, alignItems: 'center' }}>
          {(['Day', 'Week', 'Month'] as const).map((item) => (
            <DButton
              key={item}
              label={item}
              role="radio"
              checked={view === item}
              onPress={() => setView(item)}
              active={focusActive}
              radius={28}
              style={{
                height: 56,
                paddingHorizontal: 24,
                justifyContent: 'center',
                backgroundColor: view === item ? p.selected : 'transparent',
              }}>
              <DText size={22} weight={view === item ? 800 : 600} color={view === item ? p.onSelected : p.muted}>
                {item}
              </DText>
            </DButton>
          ))}
        </DRow>
      </DRow>
      {calendarState.status === 'unavailable' ? (
        <DPanel style={{ flex: 1, marginTop: 28, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
          <DText heading size={38} weight={700}>
            Calendar unavailable
          </DText>
          <DText>{calendarState.message}</DText>
          <DAction label="Retry calendar" onPress={props.onRefreshData} active={focusActive} defaultFocus />
        </DPanel>
      ) : (
        <>
          {calendarState.status !== 'available' ? (
            <DText size={20} color={p.muted} style={{ marginTop: 8 }}>
              {calendarState.status === 'loading' ? 'Loading calendar…' : calendarState.message}
            </DText>
          ) : null}
          {view === 'Month' ? (
            <View accessibilityLabel="Monthly family calendar" style={{ flex: 1, marginTop: 20, gap: 10 }}>
              <View style={{ flexDirection: 'row', height: 36 }}>
                {monthDays.slice(0, 7).map((day) => (
                  <DText key={day.key} size={22} weight={800} style={{ flex: 1, textAlign: 'center' }}>
                    {day.label}
                  </DText>
                ))}
              </View>
              {Array.from({ length: 6 }, (_, row) => (
                <DRow key={row} style={{ flex: 1, gap: 10 }}>
                  {monthDays.slice(row * 7, row * 7 + 7).map((day) => {
                    const dayEvents = events
                      .filter((event) => eventOnDay(event, day.key, timezone))
                      .sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || Date.parse(a.startAt) - Date.parse(b.startAt));
                    return (
                      <DButton
                        key={day.key}
                        label={`Open ${day.key}, ${dayEvents.length} events`}
                        active={focusActive}
                        defaultFocus={day.key === today}
                        onPress={() => {
                          setAnchor(day.key);
                          setView('Day');
                        }}
                        style={{
                          flex: 1,
                          padding: 12,
                          gap: 4,
                          backgroundColor: p.card,
                          borderWidth: day.key === today ? 3 : 1,
                          borderColor: day.key === today ? p.ink : p.border,
                          opacity: day.key.slice(0, 7) === anchor.slice(0, 7) ? 1 : 0.4,
                        }}>
                        <DText size={22} weight={800}>
                          {day.date.getUTCDate()}
                        </DText>
                        {dayEvents.slice(0, 2).map((event) => (
                          <DText key={event.id} numberOfLines={1} size={18} color={p.muted}>
                            {event.title}
                          </DText>
                        ))}
                        {dayEvents.length > 2 ? <DText size={16}>+{dayEvents.length - 2} more</DText> : null}
                      </DButton>
                    );
                  })}
                </DRow>
              ))}
            </View>
          ) : (
            <>
              <DRow style={{ height: 56, marginTop: 20, marginLeft: 108, gap: 12 }}>
                {days.map((day) => (
                  <DButton
                    key={day.key}
                    label={`View ${day.key}`}
                    active={focusActive}
                    onPress={() => {
                      setAnchor(day.key);
                      setView('Day');
                    }}
                    radius={16}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 12,
                      backgroundColor: day.key === today ? p.selected : 'transparent',
                    }}>
                    <DText
                      size={22}
                      weight={800}
                      color={day.key === today ? p.onSelected : p.ink}
                      style={{ letterSpacing: 1.1 }}>
                      {day.label}
                    </DText>
                    <DText size={30} weight={800} color={day.key === today ? p.onSelected : p.ink}>
                      {day.date.getUTCDate()}
                    </DText>
                  </DButton>
                ))}
              </DRow>
              {allDay.length ? (
                <DRow style={{ height: 44, marginTop: 12, marginLeft: 108, gap: 12 }}>
                  {days.map((day) => {
                    const items = allDay.filter((event) => eventOnDay(event, day.key, timezone));
                    const first = items[0];
                    if (!first) return <View key={day.key} style={{ flex: 1 }} />;
                    const c = memberColor(first.memberIds.length === household.members.length ? 'family' : first.ownerMemberId, p.dark);
                    return (
                      <DButton
                        key={day.key}
                        label={`Open ${first.title}, all day`}
                        active={focusActive}
                        onPress={() => setSelectedId(first.id)}
                        radius={12}
                        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, backgroundColor: c.surface }}>
                        <DText size={18} weight={800} color={c.ink} numberOfLines={1} style={{ flex: 1 }}>
                          {first.title}
                        </DText>
                        {items.length > 1 ? (
                          <DText size={16} weight={800} color={c.ink}>
                            +{items.length - 1}
                          </DText>
                        ) : null}
                      </DButton>
                    );
                  })}
                </DRow>
              ) : null}
              <View
                style={{ flex: 1, marginTop: 20, flexDirection: 'row', gap: 12 }}
                accessibilityLabel={view === 'Week' ? 'Weekly family calendar' : 'Daily family calendar'}>
                <View style={{ width: 96 }}>
                  {Array.from({ length: 14 }, (_, i) => (
                    <DText
                      key={i}
                      size={18}
                      color={p.muted}
                      style={{ position: 'absolute', top: `${(i / 14) * 100}%`, right: 4, marginTop: -4 }}>
                      {(i + 7) % 12 || 12} {i + 7 < 12 ? 'AM' : 'PM'}
                    </DText>
                  ))}
                </View>
                <DRow style={{ flex: 1, gap: 12 }}>
                  {days.map((day) => (
                    <View
                      key={day.key}
                      style={{
                        flex: 1,
                        borderRadius: 16,
                        borderWidth: day.key === today ? 3 : 2,
                        borderColor: day.key === today ? p.ink : p.border,
                        backgroundColor: p.card,
                      }}>
                      {Array.from({ length: 13 }, (_, i) => (
                        <View
                          key={i}
                          style={{
                            position: 'absolute',
                            top: `${((i + 1) / 14) * 100}%`,
                            left: 0,
                            right: 0,
                            height: 1,
                            backgroundColor: p.border,
                          }}
                        />
                      ))}
                      <SpatialNavigationNode orientation="vertical">
                        <>
                          {layoutEvents(
                            events.filter((event) => !event.allDay && localDateKey(event.startAt, timezone) === day.key),
                            timezone,
                          ).map(({ event, hour, duration, lane, lanes }, index) => {
                            const c = memberColor(
                              event.memberIds.length === household.members.length ? 'family' : event.ownerMemberId,
                              p.dark,
                            );
                            return (
                              <DButton
                                key={event.id}
                                label={`Open ${event.title}`}
                                active={focusActive}
                                defaultFocus={day.key === today && index === 0}
                                onPress={() => setSelectedId(event.id)}
                                radius={13}
                                style={{
                                  position: 'absolute',
                                  top: `${((hour - 7) / 14) * 100}%`,
                                  left: `${(lane / lanes) * 100 + 1.5}%`,
                                  width: `${100 / lanes - 3}%`,
                                  height: `${(duration / 14) * 100}%`,
                                  minHeight: 34,
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  backgroundColor: c.surface,
                                }}>
                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                  <DText size={20} weight={800} color={c.ink} numberOfLines={1} style={{ flex: 1 }}>
                                    {event.title}
                                  </DText>
                                  {lanes === 1 ? (
                                    <Avatar
                                      id={event.ownerMemberId}
                                      initials={
                                        household.members.find((member) => member.id === event.ownerMemberId)
                                          ?.initials ?? 'F'
                                      }
                                      size={24}
                                    />
                                  ) : null}
                                </View>
                                {duration >= 1.2 ? (
                                  <DText size={20} weight={600} color={c.ink} numberOfLines={1}>
                                    {formatTime(event.startAt, timezone)} – {formatTime(event.endAt, timezone)}
                                  </DText>
                                ) : null}
                              </DButton>
                            );
                          })}
                        </>
                      </SpatialNavigationNode>
                      {day.key === today && localHour(now, timezone) >= 7 && localHour(now, timezone) < 21 ? (
                        <View
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            top: `${((localHour(now, timezone) - 7) / 14) * 100}%`,
                            left: -5,
                            right: 0,
                            height: 2,
                            backgroundColor: '#CC4B25',
                          }}>
                          <View
                            style={{
                              width: 14,
                              height: 14,
                              backgroundColor: '#CC4B25',
                              borderRadius: 7,
                              marginTop: -6,
                            }}
                          />
                        </View>
                      ) : null}
                    </View>
                  ))}
                </DRow>
              </View>
            </>
          )}
        </>
      )}
      <View style={{ marginTop: 24 }}>
        <DFooter
          action="Open event"
          detail={`${events.length} events ${view === 'Week' ? 'this week' : view === 'Month' ? 'in this view' : 'this day'}`}>
          <DButton
            label="Return to today"
            onPress={() => setAnchor(today)}
            active={focusActive}
            style={{ paddingHorizontal: 16, justifyContent: 'center', height: 44 }}>
            <DText size={22} color={p.muted}>
              Today
            </DText>
          </DButton>
        </DFooter>
      </View>
    </View>
  );
}

// Short events get a readable minimum height. Overlapping visual intervals share lanes.
function layoutEvents(events: CalendarEvent[], timezone: string) {
  const items = [...events]
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
    .map((event) => {
      const hour = Math.max(7, localHour(event.startAt, timezone));
      return {
        event,
        hour,
        duration: Math.min(21 - hour, Math.max(0.95, (Date.parse(event.endAt) - Date.parse(event.startAt)) / 3600000)),
        lane: 0,
        lanes: 1,
      };
    })
    .filter((item) => item.hour < 21 && item.duration > 0);
  let group: typeof items = [];
  let end = 0;
  const finish = () => {
    const lanes = Math.max(1, ...group.map((item) => item.lane + 1));
    group.forEach((item) => {
      item.lanes = lanes;
    });
  };
  items.forEach((item) => {
    if (item.hour >= end) {
      finish();
      group = [];
      end = 0;
    }
    const occupied = group.filter((other) => other.hour + other.duration > item.hour).map((other) => other.lane);
    while (occupied.includes(item.lane)) item.lane++;
    group.push(item);
    end = Math.max(end, item.hour + item.duration);
  });
  finish();
  return items;
}

const PROVIDER_NAMES = { google: 'Google Calendar', icloud: 'iCloud', outlook: 'Outlook', ics: 'a calendar link' } as const;
function calendarSource(household: FamilyScreenProps['household'], event: CalendarEvent) {
  const calendar = household.calendars?.find((item) => item.id === event.calendarId);
  return calendar ? `${PROVIDER_NAMES[calendar.provider]} (${calendar.label})` : 'a connected calendar';
}

function EventDetails({ event, onClose, ...props }: FamilyScreenProps & { event: CalendarEvent; onClose: () => void }) {
  const p = useDesignPalette();
  const { household, focusActive, weatherState } = props;
  const timezone = household.family.timezone;
  const owner = household.members.find((member) => member.id === event.ownerMemberId);
  return (
    <View style={{ flex: 1, gap: 24 }}>
      <DRow style={{ alignItems: 'center', gap: 24 }}>
        <DAction label="Back to calendar" onPress={onClose} active={focusActive} defaultFocus />
        <DText size={24} color={p.muted}>
          {formatDate(new Date(event.startAt), timezone)}
        </DText>
      </DRow>
      <DText size={68} weight={800} heading style={{ letterSpacing: -1.36 }}>
        {event.title}
      </DText>
      <DText size={30} color={p.muted}>
        {eventTimeLabel(event, timezone)}
        {event.location ? ` · ${event.location}` : ''}
      </DText>
      {event.calendarId ? (
        <DText size={24} color={p.muted}>
          From {calendarSource(household, event)} · change it there and this screen updates
        </DText>
      ) : null}
      <DRow style={{ flex: 1, gap: 24 }}>
        <DPanel style={{ flex: 1, gap: 24 }}>
          <DText size={22} weight={800} color={p.muted}>
            OWNER
          </DText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Avatar id={owner?.id} initials={owner?.initials ?? 'F'} size={56} />
            <View>
              <DText size={30} weight={700}>
                {owner?.name ?? 'Family'}
              </DText>
              <DText size={22} color={p.muted}>
                Event owner
              </DText>
            </View>
          </View>
          <DText size={22} weight={800} color={p.muted}>
            PARTICIPANTS
          </DText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
            {household.members
              .filter((member) => event.memberIds.includes(member.id))
              .map((member) => (
                <View key={member.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar id={member.id} initials={member.initials} />
                  <DText>{member.name}</DText>
                </View>
              ))}
          </View>
          {event.responsibleMemberId ? (
            <DText size={26}>
              {household.members.find((member) => member.id === event.responsibleMemberId)?.name} handles{' '}
              {event.responsibilityType ?? 'transport'}
            </DText>
          ) : null}
          {event.travelMinutes ? (
            <>
              <DText size={26}>About {event.travelMinutes} minutes travel time</DText>
              <DText size={26} weight={800}>
                Leave by {formatTime(new Date(Date.parse(event.startAt) - event.travelMinutes * 60000), timezone)}
              </DText>
            </>
          ) : null}
          {props.conflicts
            .filter((conflict) => conflict.eventIds.includes(event.id))
            .slice(0, 2)
            .map((conflict) => (
              <DText key={conflict.id} size={22} color={p.warningInk}>
                {conflict.message}
              </DText>
            ))}
        </DPanel>
        <DPanel style={{ flex: 1, gap: 22 }}>
          <DText size={34} weight={700} heading>
            Before you go
          </DText>
          <SpatialNavigationScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14, padding: 8 }}>
            {event.preparation.length ? (
              event.preparation.map((item) => (
                <DButton
                  key={item.id}
                  label={`${item.label}, ${item.completed ? 'packed' : 'still needed'}`}
                  role="checkbox"
                  checked={item.completed}
                  active={focusActive}
                  onPress={() => props.onTogglePreparationItem(event.id, item.id)}
                  style={{
                    minHeight: 76,
                    paddingHorizontal: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 18,
                    backgroundColor: p.soft,
                  }}>
                  <Check done={item.completed} />
                  <DText size={26}>{item.label}</DText>
                </DButton>
              ))
            ) : (
              <DText size={26} color={p.muted}>
                Nothing to pack for this event.
              </DText>
            )}
          </SpatialNavigationScrollView>
          <DText size={24} color={p.muted}>
            {weatherState.data
              ? `${weatherState.data.temperatureF}°F and ${weatherState.data.condition} near ${weatherState.data.location}`
              : (weatherState.message ?? 'Weather unavailable')}
          </DText>
        </DPanel>
      </DRow>
      <DFooter action="Select / check off" />
    </View>
  );
}
