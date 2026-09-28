import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Share, Switch, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import {
  nextFamilyNight,
  pollTally,
  starBalance,
  type ChoreVerification,
  type Edit,
  type Household,
  type HouseholdAPI,
  type ImportDraft,
  type Team,
  type VoiceConnection,
} from './household';
import { PermissionDeniedError, pickDocument, pickPhoto, type PickedImage } from './media';
import { Button, Card, Copy, Heading, Input, Label, layout as s, memberTint, useTheme } from './ui';
import { DateField, TimeField } from './Pickers';

export type ScreenContext = {
  api: HouseholdAPI;
  data: Household;
  busy: boolean;
  dark: boolean;
  accessMode: 'parent' | 'child';
  activeChildId: string | null;
  selectedDate: Date;
  mutate: (kind: Edit['kind'], value: object) => Promise<boolean>;
  /** Runs a server call with busy/error handling. Returns undefined when it failed. */
  run: <T>(work: () => Promise<T>, success?: string) => Promise<T | undefined>;
  replace: (household: Household) => void;
  fail: (message: string) => void;
  /** A short star celebration, e.g. after approving a chore. */
  celebrate: (message: string, detail?: string) => void;
  openTeamEvent: (teamId: string) => void;
  back: React.ReactNode;
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const memberName = (data: Household, id?: string | null) => data.members.find((m) => m.id === id)?.name || 'Someone';

function Chips<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string }[];
  value: T[] | T;
  onChange: (id: T) => void;
  label?: string;
}) {
  const selected = Array.isArray(value) ? value : [value];
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
        {options.map((item) => (
          <Button key={item.id} primary={selected.includes(item.id)} onPress={() => onChange(item.id)}>
            {item.label}
          </Button>
        ))}
      </View>
    </View>
  );
}

export function CodeInput({ value, onChange, label = 'Parent code · four digits' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <Input
      label={label}
      value={value}
      onChangeText={(text: string) => onChange(text.replace(/\D/g, '').slice(0, 4))}
      keyboardType="number-pad"
      maxLength={4}
      secureTextEntry
      textContentType="oneTimeCode"
    />
  );
}

/** Private household images need the session header, so the source is resolved asynchronously. */
export function AuthImage({ api, path, style, rotation = 0 }: { api: HouseholdAPI; path: string; style: object; rotation?: number }) {
  const t = useTheme();
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    void api.imageSource?.(path).then((value) => active && setSource(value)).catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [api, path]);
  if (failed) return <View style={[style, { backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}><Copy size={12} color={t.muted}>Unavailable</Copy></View>;
  if (!source) return <View style={[style, { backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={t.muted} /></View>;
  return (
    <Image
      source={source}
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
      style={[style, { transform: [{ rotate: `${rotation}deg` }] }]}
      resizeMode="cover"
    />
  );
}

// Approvals --------------------------------------------------------------------------------------

export function ApprovalsScreen(ctx: ScreenContext) {
  const t = useTheme();
  const { data, api, busy } = ctx;
  const [code, setCode] = useState('');
  const proposals = (data.proposals || []).filter((item) => item.status === 'pending');
  const checks = (data.choreVerifications || []).filter((item) => item.status === 'pending');
  const rewards = (data.redemptions || []).filter((item) => item.status === 'pending');
  const decideReward = async (id: string, action: 'approve' | 'reject', who: string, title: string) => {
    if (!/^\d{4}$/.test(code)) return ctx.fail('Enter your four-digit parent code first.');
    const result = await ctx.run(() => api.decideRedemption!(id, action, code), action === 'approve' ? undefined : 'Request declined. No stars were used.');
    if (result) {
      ctx.replace(result.household);
      setCode('');
      if (action === 'approve') ctx.celebrate(`${who} gets ${title}!`, 'Stars were used once. Mark it given when you hand it over.');
    }
  };
  const decidePhoto = async (item: ChoreVerification, action: 'approve' | 'reject' | 'retake') => {
    if (!/^\d{4}$/.test(code)) return ctx.fail('Enter your four-digit parent code first.');
    const result = await ctx.run(() => api.decideChorePhoto!(item.id, action, code),
      action === 'approve' ? 'Approved. Stars were added once.' : action === 'retake' ? 'Asked for a new photo.' : 'Photo declined. No stars were added.');
    if (result) {
      ctx.replace(result.household);
      setCode('');
      if (action === 'approve') {
        const chore = data.chores.find((c) => c.id === item.choreId);
        ctx.celebrate(`+${chore?.points ?? 1} stars for ${memberName(data, item.memberId)}`, `${chore?.title || 'Chore'} approved.`);
      }
    }
  };
  const decideProposal = async (id: string, action: 'confirm' | 'reject') => {
    const result = await ctx.run(() => api.decideProposal!(id, action), action === 'confirm' ? 'Confirmed. Every screen will update.' : 'Rejected. Nothing changed.');
    if (result) ctx.replace(result.household);
  };
  const nothing = !proposals.length && !checks.length && !rewards.length;
  return (
    <>
      {ctx.back}
      <Label>WAITING FOR A PARENT</Label>
      <Heading>Approvals</Heading>
      {nothing ? (
        <Card style={{ padding: 22, gap: 8, alignItems: 'center' }}>
          <Copy size={34}>✓</Copy>
          <Copy weight={800}>All caught up</Copy>
          <Copy size={14} color={t.muted} style={{ textAlign: 'center' }}>Voice requests, chore photos, and reward requests show up here when they need you.</Copy>
        </Card>
      ) : null}
      {checks.length || rewards.length ? <CodeInput value={code} onChange={setCode} label="Parent code" /> : null}
      {proposals.length ? <Label>FROM VOICE</Label> : null}
      {proposals.map((item) => (
        <Card key={item.id} style={{ padding: 16, gap: 10 }}>
          <Copy weight={800}>{item.summary}</Copy>
          <Copy size={13} color={t.muted}>{item.requestedBy.startsWith('voice:child') ? 'Asked by a child · ' : ''}Nothing changes until you confirm.</Copy>
          <View style={s.row}>
            <Button primary disabled={busy} onPress={() => void decideProposal(item.id, 'confirm')} style={{ flex: 1 }}>Confirm</Button>
            <Button disabled={busy} onPress={() => void decideProposal(item.id, 'reject')}>Reject</Button>
          </View>
        </Card>
      ))}
      {checks.length ? <Label>CHORE PHOTOS</Label> : null}
      {checks.map((item) => {
        const chore = data.chores.find((c) => c.id === item.choreId);
        const tone = item.verdict === 'looks_done' ? t.ok : item.verdict === 'not_done' ? t.danger : t.muted;
        return (
          <Card key={item.id} style={{ padding: 14, gap: 12 }}>
            <View style={[s.row, { alignItems: 'flex-start' }]}>
              {item.photoId ? <AuthImage api={api} path={`v1/chores/verifications/${item.id}/photo?variant=thumb`} style={{ width: 88, height: 88, borderRadius: 14 }} /> : null}
              <View style={[s.grow, { gap: 4 }]}>
                <Copy weight={800}>{chore?.title || 'Chore'}</Copy>
                <Copy size={13} color={t.muted}>{memberName(data, item.memberId)} · +{chore?.points ?? 1} ★</Copy>
                <Copy size={13} weight={700} color={tone}>
                  {item.verdict === 'looks_done' ? 'Looks done' : item.verdict === 'not_done' ? 'Might not be done' : 'Unclear'}
                  {item.provider === 'bedrock' ? ' · AI check' : item.provider === 'demo' ? ' · demo check' : ''} · advice only
                </Copy>
              </View>
            </View>
            <Button primary disabled={busy} onPress={() => void decidePhoto(item, 'approve')}>{`Approve · +${chore?.points ?? 1} ★`}</Button>
            <View style={s.row}>
              <Button disabled={busy} onPress={() => void decidePhoto(item, 'retake')} style={{ flex: 1 }}>Ask for retake</Button>
              <Button disabled={busy} onPress={() => void decidePhoto(item, 'reject')} style={{ flex: 1 }}>Decline</Button>
            </View>
          </Card>
        );
      })}
      {rewards.length ? <Label>REWARD REQUESTS</Label> : null}
      {rewards.map((item) => {
        const who = memberName(data, item.memberId);
        const title = data.rewards?.find((r) => r.id === item.rewardId)?.title || 'a reward';
        const enough = starBalance(data, item.memberId) >= item.stars;
        return (
          <Card key={item.id} style={{ padding: 14, gap: 10 }}>
            <Copy weight={800}>{who} asks for {title}</Copy>
            <Copy size={13} color={enough ? t.muted : t.danger}>{item.stars} stars · {who} has {starBalance(data, item.memberId)}</Copy>
            <View style={s.row}>
              <Button primary disabled={busy || !enough} onPress={() => void decideReward(item.id, 'approve', who, title)} style={{ flex: 1 }}>Approve</Button>
              <Button disabled={busy} onPress={() => void decideReward(item.id, 'reject', who, title)}>Decline</Button>
            </View>
          </Card>
        );
      })}
    </>
  );
}

// Chore photos (child capture) ------------------------------------------------------------------

export function ChorePhotoScreen(ctx: ScreenContext & { choreId: string | null }) {
  const t = useTheme();
  const { data, api, busy } = ctx;
  const memberId = ctx.accessMode === 'child' ? ctx.activeChildId : null;
  const photoChores = data.chores.filter((c) => c.verifyWithPhoto && c.status === 'pending' && (!memberId || c.assignedToMemberId === memberId));
  const [choreId, setChoreId] = useState(ctx.choreId || photoChores[0]?.id || '');
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'denied'>('idle');
  const [message, setMessage] = useState('');
  const chore = data.chores.find((c) => c.id === choreId);
  const latest = [...(data.choreVerifications || [])].reverse().find((item) => item.choreId === choreId);
  const take = async (source: 'camera' | 'library') => {
    setMessage('');
    try {
      const picked = await pickPhoto(source, 1280);
      if (picked) {
        setPhoto(picked);
        setState('idle');
      }
    } catch (error) {
      setState(error instanceof PermissionDeniedError ? 'denied' : 'failed');
      setMessage(error instanceof Error ? error.message : 'The camera could not open.');
    }
  };
  const submit = async () => {
    if (!photo || !chore?.assignedToMemberId || !api.submitChorePhoto) return;
    setState('sending');
    const result = await ctx.run(() => api.submitChorePhoto!(chore.id, chore.assignedToMemberId!, photo.base64));
    if (result) {
      ctx.replace(result.household);
      setState('sent');
      setMessage(result.message);
      setPhoto(null);
    } else setState('failed');
  };
  return (
    <>
      {ctx.back}
      <Label>SHOW WHAT YOU DID</Label>
      <Heading>Chore photo</Heading>
      <Copy size={14} color={t.muted}>Take a photo of the finished chore. A parent approves it before stars are added. Photos are deleted after a parent decides.</Copy>
      {!photoChores.length ? <Card style={{ padding: 18 }}><Copy color={t.muted}>No chores need a photo right now.</Copy></Card> : (
        <Chips label="WHICH CHORE?" options={photoChores.map((c) => ({ id: c.id, label: c.title }))} value={choreId} onChange={(id) => { setChoreId(id); setPhoto(null); setState('idle'); }} />
      )}
      {chore?.photoHint ? <Card style={{ padding: 14 }}><Copy size={14}>Done looks like: {chore.photoHint}</Copy></Card> : null}
      {latest && latest.status !== 'approved' ? (
        <Card style={{ padding: 14, gap: 4 }}>
          <Copy weight={800}>{latest.status === 'pending' ? 'Waiting for a parent' : latest.status === 'retake' ? 'Please take a new photo' : 'Not approved this time'}</Copy>
          <Copy size={13} color={t.muted}>{latest.reason}</Copy>
        </Card>
      ) : null}
      {photo ? (
        <Card style={{ padding: 12, gap: 10 }}>
          <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: photo.width / photo.height, borderRadius: 14 }} accessibilityLabel="Photo preview" />
          <View style={s.row}>
            <Button disabled={busy} onPress={() => void take('camera')}>Retake</Button>
            <Button primary disabled={busy || !chore} onPress={() => void submit()}>{state === 'sending' ? 'Checking…' : 'Send to a parent'}</Button>
          </View>
        </Card>
      ) : chore ? (
        <View style={s.row}>
          <Button primary icon="photos" onPress={() => void take('camera')}>Take photo</Button>
          <Button onPress={() => void take('library')}>Choose photo</Button>
        </View>
      ) : null}
      {message ? <Copy size={14} color={state === 'sent' ? t.ok : t.danger}>{message}</Copy> : null}
      {state === 'denied' ? <Copy size={13} color={t.muted}>You can still ask a parent to check the chore in person.</Copy> : null}
    </>
  );
}

// Family photos ------------------------------------------------------------------------------------

const QUOTA = 150_000_000;

export function PhotosScreen(ctx: ScreenContext) {
  const t = useTheme();
  const { data, api, busy } = ctx;
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const photos = [...(data.photos || [])].sort((a, b) => a.order - b.order);
  const used = photos.reduce((sum, item) => sum + item.bytes, 0);
  const upload = async () => {
    try {
      const picked = await pickPhoto('library', 2400);
      if (!picked || !api.uploadPhoto) return;
      setUploading(true);
      const result = await ctx.run(() => api.uploadPhoto!(picked.base64, caption.trim()), 'Photo added. It will appear in the TV slideshow.');
      if (result) {
        ctx.replace(result.household);
        setCaption('');
      }
    } catch (error) {
      ctx.fail(error instanceof Error ? error.message : 'Could not open your photos.');
    } finally {
      setUploading(false);
    }
  };
  const update = async (id: string, patch: Parameters<NonNullable<HouseholdAPI['updatePhoto']>>[1]) => {
    const result = await ctx.run(() => api.updatePhoto!(id, patch));
    if (result) ctx.replace(result);
  };
  const move = async (index: number, offset: number) => {
    const other = photos[index + offset];
    if (!other) return;
    await update(photos[index].id, { order: other.order });
    await update(other.id, { order: photos[index].order });
  };
  return (
    <>
      {ctx.back}
      <Label>TV SLIDESHOW</Label>
      <Heading>Photos</Heading>
      <Copy size={14} color={t.muted}>Photos are private to your household. Location and camera details are removed before storage. Photos are never sent to AI.</Copy>
      {ctx.accessMode === 'parent' ? (
        <Card style={{ padding: 14, gap: 10 }}>
          <Input label="Caption (optional)" value={caption} onChangeText={setCaption} maxLength={120} placeholder="e.g. Beach day" />
          <Button primary icon="plus" disabled={busy || uploading} onPress={() => void upload()}>{uploading ? 'Uploading…' : 'Add a photo'}</Button>
          <Copy size={12} color={t.muted}>{(used / 1_000_000).toFixed(1)} MB of {QUOTA / 1_000_000} MB used · {photos.length} of 200 photos</Copy>
        </Card>
      ) : null}
      {!photos.length ? <Card style={{ padding: 18 }}><Copy color={t.muted}>No family photos yet. The TV shows its sample photos until you add some.</Copy></Card> : null}
      {photos.map((photo, index) => (
        <Card key={photo.id} style={{ padding: 12, gap: 10 }}>
          <AuthImage api={api} path={`v1/photos/${photo.id}/thumb`} rotation={photo.rotation} style={{ width: '100%', height: 200, borderRadius: 14 }} />
          <Copy weight={700}>{photo.caption || 'Untitled photo'}</Copy>
          {ctx.accessMode === 'parent' ? (
            <>
              <View style={s.spread}>
                <Copy size={14}>Show on TV</Copy>
                <Switch value={photo.selected} disabled={busy} onValueChange={(selected) => void update(photo.id, { selected })} accessibilityLabel={`Show ${photo.caption || 'photo'} on TV`} />
              </View>
              <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
                <Button label="Move earlier" icon="up" disabled={busy || index === 0} onPress={() => void move(index, -1)} />
                <Button label="Move later" icon="down" disabled={busy || index === photos.length - 1} onPress={() => void move(index, 1)} />
                <Button icon="refresh" disabled={busy} onPress={() => void update(photo.id, { rotation: ((photo.rotation + 90) % 360) as 0 | 90 | 180 | 270 })}>Rotate</Button>
                <Button icon="trash" disabled={busy} onPress={() => void ctx.run(async () => ctx.replace(await api.deletePhoto!(photo.id)), 'Photo removed from the TV and storage.')}>Remove</Button>
              </View>
            </>
          ) : null}
        </Card>
      ))}
    </>
  );
}

// Sports and carpools ------------------------------------------------------------------------------

export function SportsScreen(ctx: ScreenContext) {
  const t = useTheme();
  const { data, busy } = ctx;
  const teams = data.teams || [];
  const children = data.members.filter((m) => m.role === 'child');
  const adults = data.members.filter((m) => m.role === 'adult');
  const [draft, setDraft] = useState<Team | null>(null);
  const [gear, setGear] = useState('');
  const edit = (team?: Team) => {
    setDraft(team || { id: randomUUID(), name: '', activity: 'Soccer', memberIds: [], gear: [], driverIds: adults.map((a) => a.id), rotationIndex: 0 });
    setGear((team?.gear || ['Water bottle']).join('\n'));
  };
  const save = async () => {
    if (!draft || !draft.name.trim()) return ctx.fail('Give the team a name.');
    const travel = Number(draft.travelMinutes || 0);
    if (await ctx.mutate('team', { ...draft, name: draft.name.trim(), gear: gear.split('\n').map((g) => g.trim()).filter(Boolean), travelMinutes: travel || null })) setDraft(null);
  };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const upcoming = data.events
    .filter((e) => e.teamId && new Date(e.endAt) > new Date())
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 8);
  return (
    <>
      {ctx.back}
      <Label>KIDS' SPORTS</Label>
      <Heading>Teams & carpools</Heading>
      {draft ? (
        <Card style={{ padding: 16, gap: 10 }}>
          <Input label="Team name" value={draft.name} onChangeText={(name: string) => setDraft({ ...draft, name })} maxLength={60} placeholder="e.g. U10 Hawks" />
          <Input label="Activity" value={draft.activity} onChangeText={(activity: string) => setDraft({ ...draft, activity })} maxLength={40} />
          <Chips label="PLAYERS" options={children.map((m) => ({ id: m.id, label: m.name }))} value={draft.memberIds} onChange={(id) => setDraft({ ...draft, memberIds: toggle(draft.memberIds, id) })} />
          <Chips label="CARPOOL DRIVERS · IN ROTATION ORDER" options={adults.map((m) => ({ id: m.id, label: m.name }))} value={draft.driverIds} onChange={(id) => setDraft({ ...draft, driverIds: toggle(draft.driverIds, id) })} />
          <Input label="Uniform or color" value={draft.uniform || ''} onChangeText={(uniform: string) => setDraft({ ...draft, uniform })} maxLength={80} placeholder="e.g. blue jersey" />
          <Input label="Gear checklist · one per line" value={gear} onChangeText={setGear} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
          <Input label="Usual field or venue" value={draft.location || ''} onChangeText={(location: string) => setDraft({ ...draft, location })} maxLength={240} />
          <Input label="Travel minutes" value={String(draft.travelMinutes || '')} onChangeText={(v: string) => setDraft({ ...draft, travelMinutes: Number(v.replace(/\D/g, '')) || null })} keyboardType="number-pad" maxLength={3} />
          <View style={s.row}>
            <Button onPress={() => setDraft(null)}>Cancel</Button>
            <Button primary disabled={busy} onPress={() => void save()}>Save team</Button>
          </View>
        </Card>
      ) : ctx.accessMode === 'parent' ? <Button primary icon="plus" onPress={() => edit()}>Add a team</Button> : null}
      {teams.map((team) => {
        const nextDriver = team.driverIds.length ? memberName(data, team.driverIds[team.rotationIndex % team.driverIds.length]) : 'No drivers yet';
        return (
          <Card key={team.id} style={{ padding: 16, gap: 6 }}>
            <View style={s.spread}>
              <Copy weight={800}>{team.name}</Copy>
              <Copy size={13} color={t.muted}>{team.activity}</Copy>
            </View>
            <Copy size={13} color={t.muted}>Players: {team.memberIds.map((id) => memberName(data, id)).join(', ') || 'none'}</Copy>
            <Copy size={13} color={t.muted}>Carpool: {team.driverIds.map((id) => memberName(data, id)).join(' → ') || 'none'} · next up {nextDriver}</Copy>
            <Copy size={13} color={t.muted}>Gear: {team.gear.join(', ') || 'none'}{team.uniform ? ` · wear ${team.uniform}` : ''}</Copy>
            {ctx.accessMode === 'parent' ? (
              <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
                <Button icon="calendar" onPress={() => ctx.openTeamEvent(team.id)}>Add practice or game</Button>
                <Button icon="edit" onPress={() => edit(team)}>Edit</Button>
              </View>
            ) : null}
          </Card>
        );
      })}
      {!teams.length && !draft ? <Card style={{ padding: 18 }}><Copy color={t.muted}>Add a team to plan practices, games, gear, and who drives.</Copy></Card> : null}
      <Label>COMING UP</Label>
      {upcoming.map((event) => {
        const missing = (event.preparation || []).filter((p) => !p.completed).map((p) => p.label);
        return (
          <Card key={event.id} style={{ padding: 14, gap: 4 }}>
            <Copy weight={700}>{event.title}</Copy>
            <Copy size={13} color={t.muted}>
              {new Date(event.startAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {event.responsibleMemberId ? ` · ${memberName(data, event.responsibleMemberId)} drives` : ''}
            </Copy>
            <Copy size={13} color={missing.length ? t.danger : t.ok}>{missing.length ? `Still to pack: ${missing.join(', ')}` : 'Gear packed'}</Copy>
            {(event.preparation || []).map((item) => (
              <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: item.completed }} disabled={busy}
                onPress={() => void ctx.mutate('prepToggle', { id: event.id, itemId: item.id })} style={[s.row, { minHeight: 40 }]}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: item.completed ? 0 : 2, borderColor: t.checkBorder, backgroundColor: item.completed ? t.ok : 'transparent' }} />
                <Copy size={14}>{item.label}</Copy>
              </Pressable>
            ))}
          </Card>
        );
      })}
      {!upcoming.length ? <Copy size={13} color={t.muted}>No team events scheduled. Import a team calendar from “From a flyer or email”.</Copy> : null}
    </>
  );
}

// Family night ---------------------------------------------------------------------------------------

export function FamilyNightScreen(ctx: ScreenContext) {
  const t = useTheme();
  const { data, busy } = ctx;
  const settings = data.familyNight;
  const [weekday, setWeekday] = useState(String(settings?.weekday ?? 4));
  const [time, setTime] = useState(settings?.time || '18:30');
  const [activity, setActivity] = useState<'movie' | 'game' | 'other'>(settings?.activityType || 'movie');
  const [idea, setIdea] = useState('');
  const [voter, setVoter] = useState(ctx.accessMode === 'child' ? ctx.activeChildId || '' : data.members[0]?.id || '');
  const [editing, setEditing] = useState(!settings);
  const day = settings ? nextFamilyNight(settings, new Date()) : null;
  const poll = (data.familyNightPolls || []).find((p) => p.id === day);
  const counts = poll ? pollTally(poll) : {};
  const order = settings?.pickerOrder?.length ? settings.pickerOrder : data.members.map((m) => m.id);
  const picker = settings && order.length ? order[settings.pickerIndex % order.length] : null;
  const history = (data.familyNightPolls || []).filter((p) => p.status === 'decided').slice(-4).reverse();
  const saveSettings = async () => {
    await ctx.mutate('familyNightSettings', { id: 'settings', weekday: Number(weekday), time, activityType: activity, pickerOrder: order });
  };
  return (
    <>
      {ctx.back}
      <Label>EVERY WEEK, TOGETHER</Label>
      <Heading>Family night</Heading>
      {settings && day ? (
        <>
          <Label>{WEEKDAYS[settings.weekday].toUpperCase()} · {day}</Label>
          <Card style={{ padding: 16, gap: 10 }}>
            <Copy size={13} color={t.muted}>Majority wins. On a tie, this week's picker chooses. Picker this week: {picker ? memberName(data, picker) : '—'}. Rotation: {order.map((id) => memberName(data, id)).join(' → ')}</Copy>
            {poll?.status === 'decided' ? (
              <Copy weight={800}>Tonight: {poll.suggestions.find((s2) => s2.id === poll.winnerSuggestionId)?.title} {poll.decidedBy === 'picker' ? `(picked by ${memberName(data, poll.pickerMemberId)})` : '(by vote)'}</Copy>
            ) : null}
            {ctx.accessMode === 'parent' ? (
              <Chips label="VOTING AS" options={data.members.map((m) => ({ id: m.id, label: m.name }))} value={voter} onChange={setVoter} />
            ) : null}
            {(poll?.suggestions || []).map((item) => {
              const mine = poll?.votes[voter] === item.id;
              return (
                <View key={item.id} style={[s.spread, { borderTopWidth: 1, borderColor: t.line, paddingTop: 8 }]}>
                  <View style={s.grow}>
                    <Copy weight={700}>{item.title}</Copy>
                    <Copy size={12} color={t.muted}>{counts[item.id] || 0} vote{counts[item.id] === 1 ? '' : 's'} · idea from {memberName(data, item.byMemberId)}</Copy>
                  </View>
                  {poll?.status === 'open' ? (
                    <Button primary={mine} disabled={busy || !voter} onPress={() => void ctx.mutate('familyNightVote', { id: day, memberId: voter, suggestionId: item.id })}>{mine ? 'Voted' : 'Vote'}</Button>
                  ) : poll?.status === 'tie' && poll.tiedSuggestionIds.includes(item.id) && ctx.accessMode === 'parent' ? (
                    <Button primary disabled={busy} onPress={() => void ctx.mutate('familyNightPick', { id: day, suggestionId: item.id })}>{memberName(data, poll.pickerMemberId)} picks this</Button>
                  ) : null}
                </View>
              );
            })}
            {poll?.status === 'tie' ? <Copy size={13} weight={700}>It's a tie! {memberName(data, poll.pickerMemberId)} chooses.</Copy> : null}
            {!poll || poll.status === 'open' ? (
              <>
                <Input label="Suggest an idea" value={idea} onChangeText={setIdea} maxLength={80} placeholder={activity === 'movie' ? 'A movie title' : 'A game or activity'} />
                <View style={s.row}>
                  <Button disabled={busy || !idea.trim() || !voter} onPress={() => void ctx.mutate('familyNightSuggest', { id: randomUUID(), date: day, title: idea.trim(), byMemberId: voter }).then((ok) => ok && setIdea(''))}>Add idea</Button>
                  {ctx.accessMode === 'parent' && poll?.suggestions.length ? <Button primary disabled={busy} onPress={() => void ctx.mutate('familyNightClose', { id: day })}>Close vote</Button> : null}
                </View>
              </>
            ) : null}
          </Card>
          {ctx.accessMode === 'parent' && !editing ? <Button icon="settings" onPress={() => setEditing(true)}>Change night or time</Button> : null}
          {history.length ? <Label>RECENT NIGHTS</Label> : null}
          {history.map((p) => (
            <Copy key={p.id} size={13} color={t.muted}>{p.id}: {p.suggestions.find((x) => x.id === p.winnerSuggestionId)?.title} · {p.decidedBy === 'picker' ? `picked by ${memberName(data, p.pickerMemberId)}` : 'majority vote'}</Copy>
          ))}
        </>
      ) : ctx.accessMode === 'parent' ? null : <Card style={{ padding: 18 }}><Copy color={t.muted}>A parent can start a weekly family night. Everyone suggests ideas and votes from their phone; the TV shows the vote live.</Copy></Card>}
      {ctx.accessMode === 'parent' && editing ? (
        <Card style={{ padding: 16, gap: 10 }}>
          <Chips label="WHICH NIGHT?" options={WEEKDAYS.map((name, i) => ({ id: String(i), label: name.slice(0, 3) }))} value={weekday} onChange={setWeekday} />
          <TimeField label="Starts at" value={time} onChange={setTime} />
          <Chips label="USUALLY" options={[{ id: 'movie', label: 'Movie' }, { id: 'game', label: 'Game' }, { id: 'other', label: 'Other' }]} value={activity} onChange={(v) => setActivity(v as typeof activity)} />
          <Button primary disabled={busy} onPress={() => void saveSettings().then(() => settings && setEditing(false))}>{settings ? 'Update family night' : 'Start family night'}</Button>
          <Copy size={12} color={t.muted}>Adds the next eight weekly nights to the calendar.</Copy>
        </Card>
      ) : null}
    </>
  );
}

// Movement breaks ----------------------------------------------------------------------------------

const ROUTINES = [
  { id: 'wiggle-warmup', name: 'Wiggle warm-up', minutes: 3, stars: 2 },
  { id: 'jungle-journey', name: 'Jungle journey', minutes: 3, stars: 3 },
  { id: 'dance-party', name: 'Living room dance party', minutes: 3, stars: 3 },
];

export function MoveScreen(ctx: ScreenContext) {
  const t = useTheme();
  const { data, busy } = ctx;
  const [routine, setRoutine] = useState(ROUTINES[0].id);
  const [time, setTime] = useState('17:30');
  const [day, setDay] = useState(() => {
    const d = ctx.selectedDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const scheduled = data.events.filter((e) => e.category === 'move' && new Date(e.endAt) > new Date()).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const earned = (data.starTransactions || []).filter((item) => item.reason === 'move_completed');
  const schedule = async () => {
    const [y, m, d] = day.split('-').map(Number);
    const [h, min] = time.split(':').map(Number);
    const start = new Date(y, m - 1, d, h, min);
    const chosen = ROUTINES.find((r) => r.id === routine)!;
    await ctx.mutate('event', {
      id: randomUUID(), familyId: data.family.id, title: `Move break: ${chosen.name}`, category: 'move',
      startAt: start.toISOString(), endAt: new Date(start.getTime() + 15 * 60000).toISOString(),
      ownerMemberId: data.members[0]?.id, memberIds: data.members.map((m) => m.id), source: 'manual', moveRoutineId: chosen.id,
    });
  };
  return (
    <>
      {ctx.back}
      <Label>GET THE WIGGLES OUT</Label>
      <Heading>Move breaks</Heading>
      <Copy size={14} color={t.muted}>Short, guided movement sessions run full screen on the TV. Kids earn stars once per session. General activity only, not medical or fitness advice.</Copy>
      {ctx.accessMode === 'parent' ? (
        <Card style={{ padding: 16, gap: 10 }}>
          <Chips label="ROUTINE" options={ROUTINES.map((r) => ({ id: r.id, label: `${r.name} · ${r.stars}★` }))} value={routine} onChange={setRoutine} />
          <DateField label="Day" value={day} onChange={setDay} />
          <TimeField label="Time" value={time} onChange={setTime} />
          <Button primary disabled={busy} onPress={() => void schedule()}>Add to the calendar</Button>
        </Card>
      ) : null}
      <Label>SCHEDULED</Label>
      {scheduled.map((e) => (
        <Card key={e.id} style={{ padding: 14 }}>
          <Copy weight={700}>{e.title}</Copy>
          <Copy size={13} color={t.muted}>{new Date(e.startAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · start it from the TV Home screen</Copy>
        </Card>
      ))}
      {!scheduled.length ? <Copy size={13} color={t.muted}>No movement breaks scheduled. You can also start one any time on the TV.</Copy> : null}
      <Label>STARS FROM MOVING</Label>
      <Copy size={13} color={t.muted}>
        {data.members.filter((m) => m.role === 'child').map((m) => `${m.name}: ${earned.filter((x) => x.memberId === m.id).reduce((sum, x) => sum + x.delta, 0)} ★`).join(' · ') || 'Add a child profile to earn stars.'}
      </Copy>
    </>
  );
}

// Voice (Alexa+) --------------------------------------------------------------------------------------

export function VoiceScreen(ctx: ScreenContext) {
  const t = useTheme();
  const { data, api, busy } = ctx;
  const [connections, setConnections] = useState<VoiceConnection[] | null>(null);
  const [mcpUrl, setMcpUrl] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [child, setChild] = useState('');
  const [utterance, setUtterance] = useState('What’s on today?');
  const [reply, setReply] = useState<{ reply: string; mode: string; toolCalls: string[] } | null>(null);
  const load = async () => {
    const result = await ctx.run(() => api.voiceConnections!());
    if (result) {
      setConnections(result.connections);
      setMcpUrl(result.mcpUrl);
    }
  };
  useEffect(() => {
    if (api.voiceConnections) void load();
  }, []);
  const connect = async () => {
    const result = await ctx.run(() => api.createVoiceConnection!(child ? `${memberName(data, child)}'s voice` : 'Alexa+', child || undefined));
    if (result) {
      setSecret(result.token);
      await load();
    }
  };
  const pending = (data.proposals || []).filter((p) => p.status === 'pending').length;
  return (
    <>
      {ctx.back}
      <Label>ALEXA+ AND VOICE</Label>
      <Heading>Voice</Heading>
      <Card style={{ padding: 16, gap: 6 }}>
        <Copy weight={800}>{connections === null ? 'Checking…' : connections.length ? 'Voice connected' : 'Voice disconnected'}</Copy>
        <Copy size={13} color={t.muted}>Voice can answer questions about your family’s schedule and suggest changes. Every change waits for you to confirm on the TV or here. {pending ? `${pending} waiting now.` : ''}</Copy>
        {mcpUrl ? <Copy size={12} color={t.muted}>MCP server: {mcpUrl}</Copy> : null}
      </Card>
      {secret ? (
        <Card style={{ padding: 16, gap: 8 }}>
          <Copy weight={800}>Your connection key</Copy>
          <Copy size={13} color={t.muted}>Paste this into the voice assistant’s account-linking step. It is shown only once; disconnect to revoke it.</Copy>
          <Copy size={12}>{secret}</Copy>
          <View style={s.row}>
            <Button icon="share" onPress={() => void Share.share({ message: `FamilyOS MCP server: ${mcpUrl}\nBearer token: ${secret}` })}>Share securely</Button>
            <Button onPress={() => setSecret(null)}>Done</Button>
          </View>
        </Card>
      ) : null}
      <Card style={{ padding: 16, gap: 10 }}>
        <Chips label="CONNECT FOR" options={[{ id: '', label: 'Parents' }, ...data.members.filter((m) => m.role === 'child').map((m) => ({ id: m.id, label: m.name }))]} value={child} onChange={setChild} />
        <Copy size={12} color={t.muted}>A child’s voice connection can only ask about the schedule and report their own finished chores.</Copy>
        <Button primary icon="mic" disabled={busy || !api.createVoiceConnection} onPress={() => void connect()}>Connect a voice assistant</Button>
      </Card>
      {(connections || []).map((item) => (
        <Card key={item.id} style={[s.spread, { padding: 14 }]}>
          <View style={s.grow}>
            <Copy weight={700}>{item.label}</Copy>
            <Copy size={12} color={t.muted}>{item.lastUsedAt ? `Last used ${new Date(item.lastUsedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not used yet'}</Copy>
          </View>
          <Button disabled={busy} onPress={() => void ctx.run(() => api.revokeVoiceConnection!(item.id), 'Voice disconnected.').then(load)}>Disconnect</Button>
        </Card>
      ))}
      <Label>TRY IT · SIMULATED ALEXA+</Label>
      <Card style={{ padding: 16, gap: 10 }}>
        <Copy size={12} color={t.muted}>This is a simulated Alexa+ experience for testing. It uses the same FamilyOS MCP tools a live Alexa+ connection would.</Copy>
        <Input label="Say something" value={utterance} onChangeText={setUtterance} maxLength={400} />
        <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
          {['What’s on today?', 'Swap Emma pickup to Alex', 'How many stars does Leo have?'].map((sample) => (
            <Button key={sample} onPress={() => setUtterance(sample)}>{sample}</Button>
          ))}
        </View>
        <Button primary icon="mic" disabled={busy || !utterance.trim() || !api.simulateVoice} onPress={() => void ctx.run(() => api.simulateVoice!(utterance.trim())).then((r) => r && setReply(r))}>Ask</Button>
        {reply ? (
          <View style={{ gap: 4 }}>
            <Copy weight={700}>“{reply.reply}”</Copy>
            <Copy size={12} color={t.muted}>Simulated · {reply.mode === 'bedrock' ? 'Amazon Bedrock' : 'rules'} · tools: {reply.toolCalls.join(', ') || 'none'}</Copy>
          </View>
        ) : null}
      </Card>
    </>
  );
}

// Imports with capture and editable review -----------------------------------------------------------

function DraftReview({ ctx, draft }: { ctx: ScreenContext; draft: ImportDraft }) {
  const t = useTheme();
  const { data, busy } = ctx;
  const p = draft.proposal;
  const [title, setTitle] = useState(p.title);
  const [date, setDate] = useState(p.date || '');
  const [start, setStart] = useState(p.startTime || '');
  const [end, setEnd] = useState(p.endTime || '');
  const [location, setLocation] = useState(p.location || '');
  const [members, setMembers] = useState<string[]>(data.members[0] ? [data.members[0].id] : []);
  const [team, setTeam] = useState('');
  const flags = p.fieldsNeedingReview;
  const flagged = (field: string) => (flags.includes(field) ? ' · please check' : '');
  const confirm = async () => {
    const day = date || new Date().toISOString().slice(0, 10);
    if (start && end && end <= start) return ctx.fail('The end time must be after the start time.');
    const edited = p.kind === 'event'
      ? { title: title.trim(), date: day, ...(start ? { startTime: start } : {}), ...(end ? { endTime: end } : {}), location: location.trim(), memberIds: members, ...(team ? { teamId: team } : {}) }
      : { title: title.trim() };
    await ctx.mutate('importConfirm', { id: draft.id, ...edited });
  };
  return (
    <Card style={{ padding: 16, gap: 8 }}>
      <Copy size={12} weight={800} color={t.muted}>{draft.sourceType.toUpperCase()} · {p.kind.toUpperCase()}{p.provider === 'bedrock' ? ' · READ BY AI' : ''}</Copy>
      {p.duplicateOf ? <Copy size={13} weight={700} color={t.danger}>This looks like something you already imported or added.</Copy> : null}
      <Input label={`Title${flagged('title')}`} value={title} onChangeText={setTitle} maxLength={120} />
      {p.kind === 'event' ? (
        <>
          <DateField label={`Date${flagged('date')}`} value={date || new Date().toISOString().slice(0, 10)} onChange={setDate} />
          {start ? (
            <>
              <TimeField label={`Starts${flagged('time')}`} value={start} onChange={setStart} />
              <TimeField label="Ends" value={end || start} onChange={setEnd} />
              <Button onPress={() => { setStart(''); setEnd(''); }}>Make it all day</Button>
            </>
          ) : (
            <Button onPress={() => setStart('17:00')}>{`Add a time${flagged('time')}`}</Button>
          )}
          {flags.includes('timezone') ? <Copy size={12} color={t.danger}>The source mentions another time zone. Times are saved in {data.family.timezone}.</Copy> : null}
          <Input label="Location" value={location} onChangeText={setLocation} maxLength={240} />
          <Chips label={`WHO IS GOING?${flagged('participants')}`} options={data.members.map((m) => ({ id: m.id, label: m.name }))} value={members}
            onChange={(id) => setMembers((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))} />
          {(data.teams || []).length ? <Chips label="TEAM (OPTIONAL)" options={[{ id: '', label: 'None' }, ...(data.teams || []).map((tm) => ({ id: tm.id, label: tm.name }))]} value={team} onChange={setTeam} /> : null}
        </>
      ) : p.kind === 'recipe' ? (
        <Copy size={13} color={t.muted}>{(p.ingredients || []).length} ingredients{flags.includes('quantities') ? ' · some have no quantity' : ''} · {(p.instructions || []).length} steps</Copy>
      ) : <Copy size={13} color={t.muted}>Adds a household to-do.</Copy>}
      <View style={s.row}>
        <Button disabled={busy} onPress={() => void ctx.mutate('importCancel', { id: draft.id })}>Discard</Button>
        <Button primary disabled={busy || !title.trim()} onPress={() => void confirm()}>Confirm and add</Button>
      </View>
    </Card>
  );
}

export function ImportsScreen(ctx: ScreenContext) {
  const t = useTheme();
  const { data, api, busy } = ctx;
  const [text, setText] = useState('');
  const [source, setSource] = useState<'email' | 'flyer' | 'text'>('email');
  const drafts = (data.importDrafts || []).filter((d) => d.status === 'review');
  const send = async (body: Parameters<NonNullable<HouseholdAPI['createImportDraft']>>[0]) => {
    const result = await ctx.run(() => api.createImportDraft!(body), 'Ready to review. Nothing is added until you confirm.');
    if (result) {
      ctx.replace(result.household);
      setText('');
    }
  };
  const photo = async (from: 'camera' | 'library') => {
    try {
      const picked = await pickPhoto(from, 2000);
      if (picked) await send({ sourceType: 'photo', sourceName: 'Photo', contentBase64: picked.base64 });
    } catch (error) {
      ctx.fail(error instanceof Error ? error.message : 'Could not open the camera.');
    }
  };
  const file = async () => {
    try {
      const picked = await pickDocument();
      if (picked) await send({ sourceType: picked.sourceType, sourceName: picked.name, contentBase64: picked.base64 });
    } catch (error) {
      ctx.fail(error instanceof Error ? error.message : 'Could not open that file.');
    }
  };
  return (
    <>
      {ctx.back}
      <Label>REVIEW BEFORE ADDING</Label>
      <Heading>From a flyer or email</Heading>
      <Copy size={14} color={t.muted}>Snap a flyer, choose a PDF, email (.eml), or team calendar (.ics), or paste text. FamilyOS makes an editable draft; nothing is added until you confirm. The original file is not kept.</Copy>
      <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
        <Button primary icon="photos" disabled={busy} onPress={() => void photo('camera')}>Photograph a flyer</Button>
        <Button disabled={busy} onPress={() => void photo('library')}>Choose photo</Button>
        <Button disabled={busy} onPress={() => void file()}>Choose file</Button>
      </View>
      <Chips options={[{ id: 'email', label: 'Email' }, { id: 'flyer', label: 'Flyer' }, { id: 'text', label: 'Other text' }]} value={source} onChange={(v) => setSource(v as typeof source)} />
      <Input label="Or paste text" value={text} onChangeText={setText} multiline style={{ minHeight: 140, textAlignVertical: 'top' }} placeholder="Paste the email, flyer, or recipe text here" />
      <Button disabled={busy || !text.trim()} onPress={() => void send({ sourceType: source, contentText: text.trim() })}>Prepare review draft</Button>
      <Label>NEEDS YOUR REVIEW · {drafts.length}</Label>
      {drafts.map((draft) => <DraftReview key={draft.id} ctx={ctx} draft={draft} />)}
      {!drafts.length ? <Copy size={14} color={t.muted}>No imports waiting for review.</Copy> : null}
    </>
  );
}

export function StarsBar({ data, memberId, target, dark }: { data: Household; memberId: string; target?: number; dark: boolean }) {
  const t = useTheme();
  const balance = starBalance(data, memberId);
  const index = Math.max(0, data.members.findIndex((m) => m.id === memberId));
  const offered = (data.rewards || []).filter((reward) => reward.available).sort((a, b) => a.stars - b.stars);
  // Without a chosen goal, show progress toward the next reward this child can't afford yet.
  const next = target ? undefined : offered.find((reward) => reward.stars > balance);
  const goal = target ?? next?.stars;
  if (!goal && !offered.length) return null;
  const share = goal ? Math.min(1, balance / goal) : 1;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: t.soft }}>
        <View style={{ height: 10, borderRadius: 5, width: `${Math.round(share * 100)}%`, backgroundColor: memberTint(index, dark).color }} />
      </View>
      <Copy size={12} color={t.muted}>
        {!goal ? 'Enough for any reward!' : balance >= goal ? 'Enough stars saved!' : `${goal - balance} more ★${next ? ` to ${next.title}` : ' to go'}`}
      </Copy>
    </View>
  );
}
