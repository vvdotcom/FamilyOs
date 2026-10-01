import React, { useState } from 'react';
import { View } from 'react-native';
import type { CalendarProvider, ConnectedCalendar, Event, Household } from './household';
import { Chips, type ScreenContext } from './FamilyScreens';
import { Button, Card, Copy, Heading, Input, Label, layout as s, useTheme } from './ui';

export const PROVIDER_NAMES: Record<CalendarProvider, string> = {
  google: 'Google Calendar',
  icloud: 'iCloud',
  outlook: 'Outlook',
  ics: 'Calendar link',
};

const GUIDES: Record<CalendarProvider, { steps: string[]; note: string }> = {
  google: {
    steps: [
      'On a computer, open calendar.google.com and select Settings (the gear).',
      'Under “Settings for my calendars”, choose the calendar.',
      'Open “Integrate calendar” and copy “Secret address in iCal format”.',
    ],
    note: 'Keep this address private. If you reset it in Google, paste the new one here.',
  },
  icloud: {
    steps: [
      'On iPhone, open Calendar and tap Calendars.',
      'Tap ⓘ next to the calendar and turn on Public Calendar.',
      'Tap Share Link, then Copy.',
    ],
    note: 'Anyone with an iCloud public link can view that calendar. Share only calendars you are comfortable with.',
  },
  outlook: {
    steps: [
      'On outlook.com, open Settings, then Calendar, then Shared calendars.',
      'Under “Publish a calendar”, choose the calendar and “Can view all details”, then Publish.',
      'Copy the ICS link.',
    ],
    note: 'You can stop publishing in Outlook anytime; FamilyOS then shows the last copy it had.',
  },
  ics: {
    steps: [
      'Schools, leagues, and apps like TeamSnap often have a “Subscribe” or iCal (.ics) link.',
      'Copy that link and paste it below.',
    ],
    note: 'Links that start with webcal:// work too.',
  },
};

export function syncedLabel(data: Household, event: Event): string {
  const calendar = (data.calendars || []).find((item) => item.id === event.calendarId);
  return calendar ? `${PROVIDER_NAMES[calendar.provider]} · ${calendar.label}` : 'A connected calendar';
}

function syncedAgo(value?: string | null): string {
  if (!value) return 'Not synced yet';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `Synced ${hours} hr ago` : `Synced ${new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function CalendarCard({ ctx, calendar }: { ctx: ScreenContext; calendar: ConnectedCalendar }) {
  const t = useTheme();
  const { api, data, busy } = ctx;
  const [editingMembers, setEditingMembers] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const owners = calendar.memberIds.map((id) => data.members.find((m) => m.id === id)?.name).filter(Boolean).join(', ');
  const toggleMember = (id: string) => {
    const next = calendar.memberIds.includes(id) ? calendar.memberIds.filter((item) => item !== id) : [...calendar.memberIds, id];
    if (next.length) void ctx.mutate('calendarMeta', { id: calendar.id, memberIds: next });
  };
  return (
    <Card style={{ padding: 16, gap: 8 }}>
      <View style={s.spread}>
        <View style={s.grow}>
          <Copy weight={800}>{calendar.label}</Copy>
          <Copy size={12} color={t.muted}>{PROVIDER_NAMES[calendar.provider]}{calendar.host ? ` · ${calendar.host}` : ''}</Copy>
        </View>
      </View>
      <Copy size={13} color={calendar.status === 'error' ? t.danger : t.muted}>
        {calendar.status === 'error'
          ? calendar.message
          : `${syncedAgo(calendar.lastSyncedAt)} · ${calendar.eventCount} event${calendar.eventCount === 1 ? '' : 's'} in the next 3 months`}
      </Copy>
      <Copy size={13}>Shows for {owners || 'the family'}</Copy>
      {editingMembers ? (
        <Chips label="WHOSE CALENDAR" options={data.members.map((m) => ({ id: m.id, label: m.name }))}
          value={calendar.memberIds} onChange={toggleMember} />
      ) : null}
      {confirming ? (
        <View style={{ gap: 8 }}>
          <Copy size={13}>Disconnect “{calendar.label}”? Its events leave FamilyOS. Nothing changes in {PROVIDER_NAMES[calendar.provider]}.</Copy>
          <View style={[s.row, { gap: 6 }]}>
            <Button primary disabled={busy} onPress={() => void ctx.run(async () => ctx.replace(await api.disconnectCalendar!(calendar.id)), 'Calendar disconnected.')}>Disconnect</Button>
            <Button onPress={() => setConfirming(false)}>Keep it</Button>
          </View>
        </View>
      ) : (
        <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
          <Button icon="refresh" disabled={busy} onPress={() => void ctx.run(() => api.syncCalendar!(calendar.id), 'Calendar synced.').then((r) => r && ctx.replace(r.household))}>Sync now</Button>
          <Button icon="people" primary={editingMembers} onPress={() => setEditingMembers(!editingMembers)}>{editingMembers ? 'Done' : 'Whose calendar'}</Button>
          <Button icon="trash" disabled={busy} onPress={() => setConfirming(true)}>Disconnect</Button>
        </View>
      )}
    </Card>
  );
}

export function CalendarsScreen(ctx: ScreenContext) {
  const t = useTheme();
  const { data, api, busy } = ctx;
  const connected = data.calendars || [];
  const [provider, setProvider] = useState<CalendarProvider>('google');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [owners, setOwners] = useState<string[]>(() => {
    const adult = data.members.find((m) => m.role === 'adult');
    return adult ? [adult.id] : [];
  });
  const guide = GUIDES[provider];
  const link = url.trim();
  const looksRight = /^(https|webcal):\/\/\S+$/i.test(link);
  const connect = async () => {
    const label = name.trim() || `${owners.map((id) => data.members.find((m) => m.id === id)?.name).filter(Boolean).join(' & ') || 'Family'}’s ${PROVIDER_NAMES[provider].replace(' Calendar', '')}`;
    const result = await ctx.run(() => api.connectCalendar!(label.slice(0, 60), link, owners));
    if (result) {
      ctx.replace(result.household);
      ctx.celebrate('Calendar connected', `${result.calendar.eventCount} event${result.calendar.eventCount === 1 ? '' : 's'} are now on your TV.`);
      setUrl('');
      setName('');
    }
  };
  return (
    <>
      {ctx.back}
      <Label>GOOGLE · ICLOUD · OUTLOOK</Label>
      <Heading>Connected calendars</Heading>
      <Copy size={14} color={t.muted}>
        Bring in the calendars your family already uses. FamilyOS checks them about every 15 minutes and shows them on the TV. It only reads them; it never changes them.
      </Copy>
      {connected.map((calendar) => <CalendarCard key={calendar.id} ctx={ctx} calendar={calendar} />)}
      {connected.length >= 10 ? (
        <Card style={{ padding: 16 }}><Copy color={t.muted}>You’ve connected 10 calendars, the most FamilyOS supports.</Copy></Card>
      ) : (
        <Card style={{ padding: 16, gap: 12 }}>
          <Copy weight={800}>{connected.length ? 'Connect another calendar' : 'Connect a calendar'}</Copy>
          <Chips options={(Object.keys(PROVIDER_NAMES) as CalendarProvider[]).map((id) => ({ id, label: id === 'ics' ? 'Other link' : PROVIDER_NAMES[id].replace(' Calendar', '') }))}
            value={provider} onChange={setProvider} />
          <View style={{ gap: 6 }}>
            {guide.steps.map((step, index) => (
              <View key={step} style={[s.row, { alignItems: 'flex-start', gap: 8 }]}>
                <Copy size={13} weight={800} style={{ width: 16 }}>{index + 1}</Copy>
                <Copy size={13} style={s.grow}>{step}</Copy>
              </View>
            ))}
            <Copy size={12} color={t.muted}>{guide.note}</Copy>
          </View>
          <Input label="Calendar link" value={url} onChangeText={setUrl} placeholder="https:// or webcal://"
            autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={2048} />
          {link && !looksRight ? <Copy size={12} color={t.danger}>Paste the whole link. It starts with https:// or webcal://.</Copy> : null}
          <Input label="Name (optional)" value={name} onChangeText={setName} maxLength={60} placeholder="e.g. Emma’s school" />
          <Chips label="WHOSE CALENDAR" options={data.members.map((m) => ({ id: m.id, label: m.name }))} value={owners}
            onChange={(id) => setOwners((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} />
          <Button primary icon="calendar" disabled={busy || !looksRight || !owners.length || !api.connectCalendar} onPress={() => void connect()}>
            {busy ? 'Checking the link…' : 'Connect'}
          </Button>
          <Copy size={12} color={t.muted}>The link is stored encrypted on your FamilyOS server and is never shown on the TV.</Copy>
        </Card>
      )}
    </>
  );
}

/** Read-only details for an event that comes from a connected calendar. */
export function SyncedEventSheet({ data, event, onClose }: { data: Household; event: Event; onClose: () => void }) {
  const t = useTheme();
  const when = event.allDay
    ? `${new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · All day`
    : `${new Date(event.startAt).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} – ${new Date(event.endAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const who = event.memberIds.map((id) => data.members.find((m) => m.id === id)?.name).filter(Boolean).join(', ');
  return (
    <View style={[s.body, { gap: 14 }]}>
      <Label>FROM {syncedLabel(data, event).toUpperCase()}</Label>
      <Copy size={22} weight={800}>{event.title}</Copy>
      <Card style={{ padding: 16, gap: 6 }}>
        <Copy>{when}</Copy>
        {event.location ? <Copy color={t.muted}>{event.location}</Copy> : null}
        {who ? <Copy color={t.muted}>{who}</Copy> : null}
      </Card>
      <Copy size={14} color={t.muted}>
        This event comes from a connected calendar, so it’s read-only here. Change it in {syncedLabel(data, event).split(' · ')[0]} and FamilyOS shows the update within about 15 minutes.
      </Copy>
      <Button primary onPress={onClose}>Done</Button>
    </View>
  );
}
