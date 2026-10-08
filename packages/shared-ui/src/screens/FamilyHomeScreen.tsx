import { WeatherIcon } from '../design/WeatherIcon';
import React from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { CalendarEvent, pendingApprovals, ProposedAction, splitHighlight, starBalance } from '@familyos/domain';
import {
  Avatar,
  Check,
  DButton,
  DIcon,
  DPanel,
  DRow,
  DText,
  eventOnDay,
  formatTime,
  localDateKey,
  memberColor,
  useDesignPalette,
} from '../design/DesignSystem';
import { FamilyScreenProps } from './familyTypes';
import { usePageBack } from '../hooks/usePageBack';
import { SAMPLE_BUILD } from './householdStorage';
import { ModalFocusRoot } from '../components/ModalFocusRoot';

export default function FamilyHomeScreen({
  household,
  conflicts,
  now,
  calendarState,
  weatherState,
  focusActive,
  onNavigate,
  onOpenEvent,
  onTogglePreparationItem,
  briefing,
  onProposeAction,
  onConfirmAction,
  onCancelAction,
  tvPairing,
  onStartPairing,
}: FamilyScreenProps) {
  const p = useDesignPalette(true);
  const timezone = household.family.timezone;
  const events = calendarState.status === 'unavailable' || calendarState.status === 'empty' ? [] : household.events;
  const todayKey = localDateKey(now, timezone);
  const today = events
    .filter((event) => eventOnDay(event, todayKey, timezone))
    .sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || Date.parse(a.startAt) - Date.parse(b.startAt));
  // Simultaneous school entries share one timeline row, while both events remain in Calendar.
  const rows = today
    .filter(
      (event, index) =>
        today.findIndex((other) => other.title === event.title && other.startAt === event.startAt) === index,
    )
    .slice(0, 5);
  // All-day items (birthdays, "no school") stay on the timeline but are never "next up".
  const upcoming = today.filter((event) => !event.allDay && Date.parse(event.endAt) > now.getTime());
  const notStarted = upcoming.filter((event) => Date.parse(event.startAt) >= now.getTime());
  const next = notStarted.find((event) => event.preparation.length > 0) ?? notStarted[0] ?? upcoming[0];
  // The next pickup clash that hasn't happened yet, on any day, so "Fix pickup" works before the day itself.
  // A recurring series also has clashes in past weeks; those are skipped.
  const pickupOf = (eventIds: string[]) => events.find((event) => event.category === 'pickup' && eventIds.includes(event.id));
  const openClashes = conflicts
    .filter((item) => item.type === 'responsibility_overlap')
    .map((item) => ({ item, event: pickupOf(item.eventIds) }))
    .filter((entry) => !entry.event || Date.parse(entry.event.endAt) > now.getTime());
  const nextClash = openClashes.find((entry) => entry.event) ?? openClashes[0];
  const conflict = nextClash?.item;
  const suggested = household.members.find((member) => member.id === conflict?.suggestedMemberId);
  const conflictEvent = nextClash?.event;
  const [resolution, setResolution] = useState<'closed' | 'review' | 'confirm' | 'done'>('closed');
  const [pendingAction, setPendingAction] = useState<{ action: ProposedAction; remote: boolean } | null>(null);
  const [completedAction, setCompletedAction] = useState<ProposedAction | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [working, setWorking] = useState(false);
  const closeResolution = () => {
    if (pendingAction && pendingAction.action.status === 'proposed') {
      void onCancelAction?.(pendingAction.action, pendingAction.remote);
    }
    setPendingAction(null);
    setActionMessage('');
    setResolution('closed');
  };
  usePageBack(closeResolution, resolution !== 'closed');
  const propose = async () => {
    if (!conflict || !conflictEvent || !suggested || !onProposeAction) return;
    setWorking(true);
    setActionMessage('');
    try {
      setPendingAction(await onProposeAction(conflict.id, conflictEvent.id, suggested.id));
      setResolution('confirm');
    } catch (error) {
      setActionMessage(error instanceof Error && error.message ? error.message : 'The pickup suggestion could not be prepared. Refresh and try again.');
    } finally {
      setWorking(false);
    }
  };
  const confirm = async () => {
    if (!pendingAction || !onConfirmAction) return;
    setWorking(true);
    setActionMessage('');
    try {
      await onConfirmAction(pendingAction.action, pendingAction.remote);
      setCompletedAction(pendingAction.action);
      setPendingAction(null);
      setResolution('done');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'The schedule changed. Review this pickup again.');
    } finally {
      setWorking(false);
    }
  };
  const open = (event: CalendarEvent) => (onOpenEvent ? onOpenEvent(event.id) : onNavigate('Calendar'));
  // Chore photos and reward requests waiting for a parent, shown on each child's row in the family panel.
  const waiting = pendingApprovals(household);
  // The briefing is rewritten when the day changes; until the new one arrives, never show words about a
  // problem that's already fixed (or miss one that just appeared).
  const briefingFits = !!briefing && (conflict ? briefing.conflictIds.includes(conflict.id) : briefing.conflictIds.length === 0);
  const glance = !conflict && briefingFits ? briefing!.highlights.slice(0, 3).map(splitHighlight) : [];
  const briefingHeadline = conflict
    ? (briefingFits ? briefing!.headline : 'One thing needs attention.')
    : (briefingFits ? briefing!.headline : 'A little more room to breathe.');
  const briefingSummary = conflict
    ? (briefingFits ? briefing!.summary : `${conflict.message}${suggested ? ` ${suggested.name} is available to help.` : ''}`)
    : (briefingFits ? briefing!.summary : `${upcoming.length} plans ahead. Your family’s day, all in one place.`);
  // Not linked to a family yet: Home asks to pair instead of showing a briefing.
  const needsPairing = !SAMPLE_BUILD && !!tvPairing && tvPairing.status !== 'paired' && tvPairing.status !== 'checking';
  const pair = () => {
    if (tvPairing?.status === 'unpaired') onStartPairing?.();
    onNavigate('Settings');
  };

  return (
    <View style={{ flex: 1, gap: 28 }}>
      <View
        testID="home-briefing"
        style={{
          height: 235,
          borderRadius: 36,
          paddingHorizontal: 48,
          paddingVertical: 40,
          borderWidth: 2,
          borderColor: p.briefingBorder,
          backgroundColor: p.briefing,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 48,
        }}>
        <View style={{ flex: 1, gap: 14, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <DIcon name="sparkle" size={24} color={p.briefingLabel} />
            <DText size={20} weight={800} color={p.briefingLabel} style={{ letterSpacing: 3.2 }}>
              {needsPairing ? 'GET STARTED' : 'FAMILY BRIEFING'}
            </DText>
            {!needsPairing && briefingFits && briefing?.provider === 'ai' ? (
              <DText size={18} weight={700} color={p.muted} style={{ letterSpacing: 1.4 }}>
                · SUMMARIZED BY AI ON AMAZON BEDROCK
              </DText>
            ) : null}
          </View>
          <DText heading size={56} weight={800} color={p.ink} style={{ letterSpacing: -1.12 }} numberOfLines={1}>
            {needsPairing ? 'Link this TV to your family.' : briefingHeadline}
          </DText>
          {!needsPairing && glance.length ? (
            // Today at a glance: up to three plans, each a bold time over a few words, readable from the couch.
            <View testID="home-briefing-glance" style={{ flexDirection: 'row', gap: 32 }}>
              {glance.map((item, index) => (
                <View
                  key={`${index}-${item.what}`}
                  style={{ flex: 1, minWidth: 0, paddingLeft: 18, borderLeftWidth: 4, borderColor: p.briefingBorder, gap: 2 }}>
                  {item.time ? (
                    <DText size={22} weight={800} color={p.briefingLabel} numberOfLines={1}>
                      {item.time}
                    </DText>
                  ) : null}
                  <DText size={28} weight={600} color={p.dark ? p.ink : '#34384A'} numberOfLines={1}>
                    {item.what}
                  </DText>
                </View>
              ))}
            </View>
          ) : (
            <DText
              size={30}
              weight={500}
              color={p.dark ? p.muted : '#34384A'}
              style={{ lineHeight: 40.5 }}
              numberOfLines={2}>
              {needsPairing
                ? 'Show a pairing code, scan it with the Hometide phone app, and your calendar, chores, and lists appear here.'
                : briefingSummary}
            </DText>
          )}
        </View>
        <DButton
          label={needsPairing ? 'Pair this TV' : conflict ? 'Fix pickup' : 'Open calendar'}
          onPress={() => {
            setCompletedAction(null);
            if (needsPairing) {
              pair();
              return;
            }
            if (conflict && conflictEvent && suggested && onProposeAction) setResolution('review');
            else if (conflictEvent) open(conflictEvent);
            else onNavigate('Calendar');
          }}
          active={focusActive}
          defaultFocus
          radius={38}
          style={{
            height: 76,
            paddingHorizontal: 40,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: p.selected,
          }}>
          <DText size={28} weight={800} color={p.onSelected}>
            {needsPairing ? 'Pair this TV' : conflict ? 'Fix pickup' : 'Open calendar'}
          </DText>
        </DButton>
      </View>

      <DRow style={{ flex: 1, minHeight: 0, gap: 28 }}>
        <DPanel home style={{ width: 1070, minWidth: 0, paddingVertical: 28, paddingHorizontal: 40, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <DText size={22} weight={800} color={p.muted} style={{ letterSpacing: 3.52 }}>
              TODAY
            </DText>
            <DText size={22} color={p.muted}>
              {rows.length} events
            </DText>
          </View>
          <View style={{ gap: 6, position: 'relative' }}>
            <View
              style={{ position: 'absolute', left: 141, top: 30, bottom: 28, width: 2, backgroundColor: p.nextBorder }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 24, gap: 22 }}>
              <DText
                size={18}
                weight={800}
                color={p.dark ? '#FFAA80' : '#C2410C'}
                style={{ letterSpacing: 1.8, width: 130 }}>
                NOW {formatTime(now, timezone, false)}
              </DText>
              <View style={{ width: 14, height: 14, backgroundColor: '#C2410C', borderRadius: 7 }} />
              <View style={{ flex: 1, height: 1, backgroundColor: '#FB8A68' }} />
            </View>
            {rows.map((event) => {
              const owner = household.members.find((member) => member.id === event.ownerMemberId);
              const attention = event.id === conflictEvent?.id;
              const family = event.memberIds.length === household.members.length;
              const c = memberColor(family ? 'family' : owner?.id, p.dark);
              return (
                <DButton
                  key={event.id}
                  label={`Open ${event.title}`}
                  onPress={() => open(event)}
                  active={focusActive}
                  radius={16}
                  style={{
                    height: 54,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    gap: 22,
                    backgroundColor: attention ? p.warning : 'transparent',
                  }}>
                  <DText size={event.allDay ? 24 : 28} weight={700} color={event.allDay ? p.muted : p.ink} style={{ width: 118, textAlign: 'right' }}>
                    {event.allDay ? 'All day' : formatTime(event.startAt, timezone, false)}
                  </DText>
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: p.card,
                      backgroundColor: c.accent,
                    }}
                  />
                  <DText size={30} weight={600} color={p.ink} numberOfLines={1} style={{ flex: 1 }}>
                    {event.title}
                  </DText>
                  <DText size={24} weight={700} color={family ? p.muted : p.dark ? c.avatar : c.accent}>
                    {family ? 'Everyone' : (owner?.name ?? 'Family')}
                  </DText>
                  {attention ? <DIcon name="alert" size={26} color={p.dark ? '#FFAA80' : '#C2410C'} /> : null}
                </DButton>
              );
            })}
            {!rows.length ? (
              <DText size={26} color={p.muted} style={{ marginTop: 24 }}>
                {calendarState.status === 'unavailable' ? calendarState.message : 'Nothing scheduled today.'}
              </DText>
            ) : null}
          </View>
        </DPanel>
        <DPanel home style={{ flex: 1, minWidth: 0, paddingVertical: 28, paddingHorizontal: 36, gap: 14 }}>
          <DText size={22} weight={800} color={p.muted} style={{ letterSpacing: 3.52 }}>
            FAMILY
          </DText>
          {household.members.map((member) => {
            const nextEvent = upcoming.find((event) => event.memberIds.includes(member.id));
            // Something this child sent that a parent still has to look at comes first.
            const request = waiting.find((item) => item.memberId === member.id);
            const status = request
              ? request.kind === 'photo' ? `Photo to review: ${request.title}` : `Asks for ${request.title}`
              : suggested?.id === member.id
                ? 'Available to help'
                : nextEvent
                  ? `${nextEvent.title.replace('Emma ', '')} ${formatTime(nextEvent.startAt, timezone, false)}`
                  : 'Free today';
            const row = (
              <>
                <Avatar id={member.id} initials={member.initials} size={56} pastel />
                <DText size={30} weight={700} color={p.ink}>
                  {member.name}
                </DText>
                {member.role === 'child' ? (
                  <DText size={24} weight={800} color={p.dark ? '#FFD27A' : '#B7791F'} accessibilityLabel={`${starBalance(household, member.id)} stars`}>
                    {`★ ${starBalance(household, member.id)}`}
                  </DText>
                ) : null}
                <DText
                  size={24}
                  weight={request ? 700 : 400}
                  color={request ? (p.dark ? '#FFAA80' : '#C2410C') : p.muted}
                  numberOfLines={1}
                  style={{ flex: 1, textAlign: 'right' }}>
                  {status}
                </DText>
              </>
            );
            return request ? (
              <DButton
                key={member.id}
                label={`Review ${member.name}’s ${request.kind === 'photo' ? 'chore photo' : 'reward request'}`}
                onPress={() => onNavigate('Approvals')}
                active={focusActive}
                radius={16}
                style={{ height: 70, flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 8, backgroundColor: p.warning }}>
                {row}
              </DButton>
            ) : (
              <View key={member.id} style={{ height: 70, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                {row}
              </View>
            );
          })}
        </DPanel>
      </DRow>

      <View
        testID="home-next-up"
        style={{
          height: 133,
          borderRadius: 36,
          paddingHorizontal: 40,
          paddingVertical: 26,
          backgroundColor: p.nextUp,
          borderWidth: 2,
          borderColor: p.nextBorder,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 24,
        }}>
        <View style={{ flex: 1, gap: 8 }}>
          <DText size={20} weight={800} color={p.muted} style={{ letterSpacing: 3.2 }}>
            NEXT UP
          </DText>
          {next ? (
            <DRow style={{ alignItems: 'center', gap: 18 }}>
              <DIcon
                name={next.category === 'sports' ? 'soccer' : 'calendar'}
                size={36}
                color={p.dark ? memberColor(next.ownerMemberId).avatar : memberColor(next.ownerMemberId).accent}
              />
              <DButton
                label={`Open next event: ${next.title}`}
                onPress={() => open(next)}
                active={focusActive}
                style={{ justifyContent: 'center' }}>
                <DText size={38} weight={700} heading color={p.ink}>
                  {next.title.replace(' practice', '')} · {formatTime(next.startAt, timezone)}
                </DText>
              </DButton>
              {next.travelMinutes || next.arrivalMinutes ? (
                <View
                  style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: p.warning }}>
                  <DText size={24} weight={800} color={p.warningInk}>
                    Leave by{' '}
                    {formatTime(
                      new Date(Date.parse(next.startAt) - ((next.travelMinutes || 0) + (next.arrivalMinutes || 0)) * 60000),
                      timezone,
                      false,
                    )}
                  </DText>
                </View>
              ) : null}
              {next.category === 'move' ? (
                <DButton
                  label="Start movement break"
                  onPress={() => onNavigate('Move')}
                  active={focusActive}
                  radius={31}
                  style={{ height: 62, paddingHorizontal: 22, justifyContent: 'center', backgroundColor: p.selected }}>
                  <DText size={24} weight={800} color={p.onSelected}>
                    Start now
                  </DText>
                </DButton>
              ) : null}
            </DRow>
          ) : (
            <DText size={30} color={p.ink}>
              You’re all caught up.
            </DText>
          )}
        </View>
        <DRow style={{ alignItems: 'center', gap: 16 }}>
          {next?.preparation.slice(0, 2).map((item) => (
            <DButton
              key={item.id}
              label={`${item.completed ? 'Uncheck' : 'Check'} ${item.label}`}
              role="checkbox"
              checked={item.completed}
              onPress={() => onTogglePreparationItem(next.id, item.id)}
              active={focusActive}
              radius={31}
              style={{
                height: 62,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderWidth: 2,
                borderColor: item.completed ? '#9DDCA7' : p.nextBorder,
                backgroundColor: item.completed ? (p.dark ? '#253E2C' : '#E4F4E6') : p.card,
              }}>
              <Check done={item.completed} color="#2C7B3B" size={34} />
              <DText
                size={26}
                weight={700}
                color={p.ink}
                style={item.completed ? { textDecorationLine: 'line-through' } : undefined}>
                {item.label}
              </DText>
            </DButton>
          ))}
        </DRow>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: 350 }}>
          {weatherState.data ? <WeatherIcon condition={weatherState.data.condition} size={30} color={p.muted} /> : null}
          <DText size={24} color={p.muted}>
            {weatherState.data
              ? `${weatherState.data.condition} · ${weatherState.data.temperatureF}°F`
              : 'Forecast unavailable'}
          </DText>
        </View>
      </View>

      {resolution !== 'closed' ? (
        <View
          style={{
            position: 'absolute',
            zIndex: 40,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#17130FBB',
          }}>
          {/* Keyed by stage so each step's default-focus button receives focus when it appears. */}
          <ModalFocusRoot key={resolution}>
          <DPanel
            style={{ width: 1040, padding: 44, gap: 22, borderRadius: 32, borderWidth: 2, borderColor: p.border }}>
            <DText size={22} weight={800} color={p.muted} style={{ letterSpacing: 2 }}>
              PICKUP SUGGESTION
            </DText>
            <DText heading size={46} weight={800}>
              {resolution === 'done'
                ? 'Pickup updated'
                : resolution === 'confirm'
                  ? 'Confirm the pickup change'
                  : 'Review the pickup conflict'}
            </DText>
            {resolution === 'done' ? (
              <DText size={30} color={p.muted}>
                {completedAction
                  ? `${household.members.find((member) => member.id === completedAction.toMemberId)?.name} is now assigned to ${household.events.find((event) => event.id === completedAction.eventId)?.title}.`
                  : 'The new pickup assignment is saved.'}
              </DText>
            ) : (
              <>
                <DText size={28} color={p.muted}>
                  {conflict?.message} {suggested?.name} is available. The schedule will change only after you confirm.
                </DText>
                {resolution === 'confirm' ? (
                  <DPanel style={{ padding: 24, borderRadius: 20, gap: 8 }}>
                    <DText size={24} weight={700}>
                      Suggested change
                    </DText>
                    <DText size={30}>
                      {household.members.find((member) => member.id === pendingAction?.action.fromMemberId)?.name} →{' '}
                      {household.members.find((member) => member.id === pendingAction?.action.toMemberId)?.name} for{' '}
                      {conflictEvent?.title}
                    </DText>
                  </DPanel>
                ) : null}
              </>
            )}
            {actionMessage ? (
              <DText size={24} color={p.warningInk}>
                {actionMessage}
              </DText>
            ) : null}
            <DRow style={{ gap: 18, marginTop: 4 }}>
              {resolution === 'done' ? (
                <DButton
                  label="Close pickup update"
                  onPress={closeResolution}
                  active={focusActive}
                  defaultFocus
                  style={{ height: 70, paddingHorizontal: 28, justifyContent: 'center', backgroundColor: p.selected }}>
                  <DText size={26} weight={800} color={p.onSelected}>
                    Done
                  </DText>
                </DButton>
              ) : resolution === 'confirm' ? (
                <DButton
                  label="Confirm pickup change"
                  onPress={() => void confirm()}
                  active={focusActive}
                  defaultFocus={!working}
                  style={{ height: 70, paddingHorizontal: 28, justifyContent: 'center', backgroundColor: p.selected }}>
                  <DText size={26} weight={800} color={p.onSelected}>
                    {working ? 'Saving…' : 'Confirm pickup change'}
                  </DText>
                </DButton>
              ) : (
                <DButton
                  label="Propose pickup change"
                  onPress={() => void propose()}
                  active={focusActive}
                  defaultFocus={!working}
                  style={{ height: 70, paddingHorizontal: 28, justifyContent: 'center', backgroundColor: p.selected }}>
                  <DText size={26} weight={800} color={p.onSelected}>
                    {working ? 'Preparing…' : `Suggest ${suggested?.name}`}
                  </DText>
                </DButton>
              )}
              {resolution !== 'done' ? (
                <DButton
                  label="Cancel pickup suggestion"
                  onPress={closeResolution}
                  active={focusActive}
                  style={{
                    height: 70,
                    paddingHorizontal: 28,
                    justifyContent: 'center',
                    backgroundColor: p.card,
                    borderWidth: 2,
                    borderColor: p.border,
                  }}>
                  <DText size={26} weight={700}>
                    {resolution === 'confirm' ? 'Cancel suggestion' : 'Close'}
                  </DText>
                </DButton>
              ) : null}
            </DRow>
          </DPanel>
          </ModalFocusRoot>
        </View>
      ) : null}
    </View>
  );
}
