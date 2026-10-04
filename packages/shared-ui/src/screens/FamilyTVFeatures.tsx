import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, View } from 'react-native';
import { SpatialNavigationNode, SpatialNavigationRoot } from 'react-tv-space-navigation';
import { ModalFocusRoot } from '../components/ModalFocusRoot';
import {
  familyNightTally,
  FamilyMember,
  HouseholdProposal,
  HouseholdSnapshot,
  MOVE_ROUTINES,
  MOVE_SAFETY_NOTE,
  moveSegments,
  MoveRoutine,
} from '@familyos/domain';
import { familyAgentClient, FamilyAgentError } from '../api/familyAgentClient';
import { DAction, DButton, DIcon, DPanel, DRow, DText, IconName, localDateKey, memberColor, useDesignPalette } from '../design/DesignSystem';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { usePageBack } from '../hooks/usePageBack';
import { FamilyScreenProps } from './familyTypes';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const GOLD = '#E4A32A';
const name = (household: HouseholdSnapshot, id?: string | null) =>
  household.members.find((member) => member.id === id)?.name ?? 'Someone';
const needsCode = (error: unknown) =>
  error instanceof FamilyAgentError && (error.code === 'PARENT_CODE_REQUIRED' || error.code === 'ACCESS_CODE_INCORRECT');

/** Member colours: the designed palette for the demo family, otherwise the member's own accent colour. */
export function memberTone(member: FamilyMember | undefined, dark: boolean) {
  const designed = memberColor(member?.id, dark);
  if (!member || ['alex', 'jordan', 'emma', 'leo'].includes(member.id)) return designed;
  const accent = /^#[0-9a-f]{6}$/i.test(member.accentColor) ? member.accentColor : designed.accent;
  return { ...designed, accent, surface: `${accent}${dark ? '40' : '22'}`, avatar: accent };
}

export function MemberAvatar({ member, size = 56 }: { member?: FamilyMember; size?: number }) {
  const p = useDesignPalette();
  const tone = memberTone(member, p.dark);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <DText size={Math.round(size * 0.44)} weight={800} color="#FFFFFF">{member?.initials ?? '?'}</DText>
    </View>
  );
}

/** Same page header as Chores and Settings: a spaced label over a 68px Bricolage heading. */
function PageHeader({ label, title, right }: { label: string; title: string; right?: React.ReactNode }) {
  const p = useDesignPalette();
  return (
    <DRow style={{ alignItems: 'flex-end', gap: 24 }}>
      <View style={{ flex: 1, gap: 8 }}>
        <DText size={24} weight={700} color={p.muted} style={{ letterSpacing: 1.2 }}>{label}</DText>
        <DText heading size={68} weight={800} style={{ letterSpacing: -1.36 }}>{title}</DText>
      </View>
      {right}
    </DRow>
  );
}

function SectionLabel({ children }: { children: string }) {
  const p = useDesignPalette(true);
  return <DText size={22} weight={800} color={p.muted} style={{ letterSpacing: 3.52 }}>{children}</DText>;
}

/** The Home briefing card style, reused for each new screen's lead card. */
export function BriefingCard({ label, headline, summary, icon = 'sparkle', headlineLines = 2, summaryLines = 2, children }: {
  label: string;
  headline: string;
  summary?: string;
  headlineLines?: number;
  summaryLines?: number;
  icon?: IconName;
  children?: React.ReactNode;
}) {
  const p = useDesignPalette(true);
  return (
    <View style={{ borderRadius: 36, paddingHorizontal: 48, paddingVertical: 36, borderWidth: 2, borderColor: p.briefingBorder, backgroundColor: p.briefing, flexDirection: 'row', alignItems: 'flex-end', gap: 40 }}>
      <View style={{ flex: 1, gap: 12, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <DIcon name={icon} size={24} color={p.briefingLabel} />
          <DText size={20} weight={800} color={p.briefingLabel} style={{ letterSpacing: 3.2 }}>{label}</DText>
        </View>
        <DText heading size={56} weight={800} color={p.ink} style={{ letterSpacing: -1.12 }} numberOfLines={headlineLines}>{headline}</DText>
        {summary ? <DText size={28} weight={500} color={p.dark ? p.muted : '#34384A'} style={{ lineHeight: 38 }} numberOfLines={summaryLines}>{summary}</DText> : null}
      </View>
      {children}
    </View>
  );
}

/** Content-area offsets inside the 1920 x 1080 canvas (see FamilyOsShell padding and top bar). */
export const CANVAS_COVER = { top: -162, left: -96, right: -96, bottom: -40 } as const;

function Scrim({ children, inScreen = false }: { children: React.ReactNode; inScreen?: boolean }) {
  const edges = inScreen ? CANVAS_COVER : { top: 0, left: 0, right: 0, bottom: 0 };
  return (
    <View style={{ position: 'absolute', zIndex: 60, ...edges, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17130FCC' }}>
      {children}
    </View>
  );
}

// Number pad ---------------------------------------------------------------------------------------

/** A remote-friendly four-digit pad. Digits are masked and leave this component only on OK. */
export function NumberPad({ title, detail, error, busy = false, onSubmit, onCancel }: {
  title: string;
  detail?: string;
  error?: string;
  busy?: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}) {
  const p = useDesignPalette(true);
  const [code, setCode] = useState('');
  useEffect(() => {
    if (error) setCode('');
  }, [error]);
  const press = (key: string) => {
    if (busy) return;
    if (key === 'clear') setCode('');
    else if (key === 'ok') {
      if (code.length === 4) onSubmit(code);
    } else if (code.length < 4) setCode(code + key);
  };
  const keys = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['clear', '0', 'ok']];
  return (
    <DPanel home style={{ width: 660, paddingHorizontal: 52, paddingVertical: 44, gap: 20, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <DIcon name="sparkle" size={22} color={p.briefingLabel} />
        <DText size={20} weight={800} color={p.briefingLabel} style={{ letterSpacing: 3.2 }}>PARENT CODE</DText>
      </View>
      <DText heading size={56} weight={800} style={{ textAlign: 'center' }}>{title}</DText>
      {detail ? <DText size={26} color={p.muted} style={{ textAlign: 'center' }} numberOfLines={3}>{detail}</DText> : null}
      <View accessibilityLabel={`${code.length} of 4 digits entered`} style={{ flexDirection: 'row', gap: 22, marginVertical: 6 }}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: p.ink, backgroundColor: index < code.length ? p.ink : 'transparent' }} />
        ))}
      </View>
      {error ? <DText size={24} weight={700} color={p.warningInk} accessibilityLiveRegion="polite">{error}</DText> : null}
      <SpatialNavigationNode orientation="vertical">
        <View style={{ gap: 14 }}>
          {keys.map((row, rowIndex) => (
            <DRow key={rowIndex} style={{ gap: 14, justifyContent: 'center' }}>
              {row.map((key) => (
                <DButton
                  key={key}
                  label={key === 'ok' ? 'Submit code' : key === 'clear' ? 'Clear code' : key}
                  onPress={() => press(key)}
                  defaultFocus={key === '1'}
                  radius={24}
                  style={{ width: 164, height: 84, alignItems: 'center', justifyContent: 'center', backgroundColor: key === 'ok' ? p.selected : p.nextUp, borderWidth: 2, borderColor: key === 'ok' ? p.selected : p.nextBorder }}>
                  <DText size={key.length > 1 ? 26 : 38} weight={800} color={key === 'ok' ? p.onSelected : p.ink}>
                    {key === 'ok' ? (busy ? '…' : 'OK') : key === 'clear' ? 'Clear' : key}
                  </DText>
                </DButton>
              ))}
            </DRow>
          ))}
          <DRow style={{ justifyContent: 'center', marginTop: 4 }}>
            <DAction label="Cancel" onPress={onCancel} size={24} />
          </DRow>
        </View>
      </SpatialNavigationNode>
    </DPanel>
  );
}

// Star celebration ---------------------------------------------------------------------------------

/** A short, non-blocking celebration when stars are earned. Respects reduced motion. */
export function StarCelebration({ member, stars, detail, onDone }: {
  member?: FamilyMember;
  stars: number;
  detail?: string;
  onDone: () => void;
}) {
  const p = useDesignPalette(true);
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(reduceMotion ? 1 : 0.5)).current;
  useEffect(() => {
    if (!reduceMotion) Animated.spring(scale, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
    const timer = setTimeout(onDone, 3500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', zIndex: 80, top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17130F99' }}>
      <View accessibilityLiveRegion="assertive" accessibilityLabel={`${member?.name ?? 'Someone'} earned ${stars} stars`}
        style={{ width: 880, paddingVertical: 56, paddingHorizontal: 60, borderRadius: 44, backgroundColor: p.briefing, borderWidth: 3, borderColor: p.briefingBorder, alignItems: 'center', gap: 22 }}>
        <Animated.View style={{ transform: [{ scale }], width: 200, height: 200, borderRadius: 100, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' }}>
          <DIcon name="sparkle" size={120} color="#FFFFFF" />
        </Animated.View>
        <DText heading size={96} weight={700} color={p.ink}>+{stars} stars</DText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <MemberAvatar member={member} size={60} />
          <DText size={36} weight={700}>{member ? `Way to go, ${member.name}!` : 'Way to go!'}</DText>
        </View>
        {detail ? <DText size={26} color={p.muted}>{detail}</DText> : null}
      </View>
    </View>
  );
}

// Voice request card -------------------------------------------------------------------------------

/**
 * Shows the newest pending voice request as a focused card over any screen. Nothing changes until a
 * family member confirms with the remote; parent-level changes ask for the four-digit code.
 */
export function ProposalOverlay({ proposal, onDone, onDismiss }: {
  proposal: HouseholdProposal;
  onDone: (message: string) => void;
  onDismiss: () => void;
}) {
  const p = useDesignPalette(true);
  const [stage, setStage] = useState<'card' | 'code'>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const routine = proposal.kind === 'routine';
  usePageBack(onDismiss, true);
  const decide = async (action: 'confirm' | 'reject', code?: string) => {
    setBusy(true);
    setError('');
    try {
      const response = await familyAgentClient.decideProposal(proposal.id, action, code);
      onDone(response.data.proposal.resultMessage || (action === 'confirm' ? 'Done.' : 'Nothing was changed.'));
    } catch (failure) {
      if (action === 'confirm' && needsCode(failure)) {
        setStage('code');
        if (code) setError('That code is incorrect. Try again.');
      } else setError(failure instanceof Error ? failure.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Scrim>
      <SpatialNavigationRoot isActive>
        {stage === 'code' ? (
          <NumberPad title="Confirm this change" detail={proposal.summary} error={error} busy={busy}
            onSubmit={(code) => void decide('confirm', code)} onCancel={() => setStage('card')} />
        ) : (
          <View style={{ width: 1240 }}>
            <BriefingCard
              icon="sparkle"
              label={routine ? 'HOMETIDE NOTICED · NEEDS A YES' : `${proposal.source === 'voice' ? 'VOICE REQUEST' : 'REQUEST'} · NEEDS A YES`}
              headline={proposal.summary}
              headlineLines={routine ? 3 : 2}
              summaryLines={routine ? 4 : 2}
              summary={routine
                ? `${proposal.payload?.detail ? `${proposal.payload.detail} ` : ''}Hometide remembers your answer.`
                : 'Nothing changes until you confirm. Every screen updates right after.'}>
              <View style={{ gap: 14 }}>
                <DAction label={busy ? 'Saving…' : routine ? 'Yes, make it the routine' : 'Confirm'} primary defaultFocus onPress={() => void decide('confirm')} style={{ minWidth: 300 }} />
                <DAction label={routine ? 'No, don’t ask again' : 'Reject'} onPress={() => void decide('reject')} style={{ minWidth: 300 }} />
                <DAction label="Not now" onPress={onDismiss} style={{ minWidth: 300 }} />
              </View>
            </BriefingCard>
            {error ? <DText size={26} weight={700} color="#FFD699" style={{ marginTop: 18, textAlign: 'center' }}>{error}</DText> : null}
            {proposal.requestedBy.startsWith('voice:child') ? (
              <DText size={24} color="#F4EEE4" style={{ marginTop: 12, textAlign: 'center' }}>Asked by a child’s voice connection.</DText>
            ) : null}
          </View>
        )}
      </SpatialNavigationRoot>
    </Scrim>
  );
}

// Approvals ----------------------------------------------------------------------------------------

function PrivateImage({ path, size }: { path: string; size: number }) {
  const p = useDesignPalette();
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  useEffect(() => {
    let active = true;
    void familyAgentClient.imageSource(path).then((value) => active && setSource(value)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [path]);
  return source ? (
    <Image source={source} accessibilityLabel="Chore photo" style={{ width: size, height: size, borderRadius: 24 }} resizeMode="cover" />
  ) : (
    <View style={{ width: size, height: size, borderRadius: 24, backgroundColor: p.soft }} />
  );
}

type Pending =
  | { kind: 'photo'; id: string; memberId: string; title: string; detail: string; verdict: 'looks_done' | 'unclear' | 'not_done'; photoId?: string | null; stars: number }
  | { kind: 'reward'; id: string; memberId: string; title: string; detail: string; stars: number };

const VERDICT = {
  looks_done: { text: 'Looks done', light: ['#E4F4E6', '#1F5A2A'], dark: ['#253E2C', '#9EDAA5'] },
  unclear: { text: 'Unclear', light: ['#FCEACF', '#A84C12'], dark: ['#62411D', '#FFD699'] },
  not_done: { text: 'Might not be done', light: ['#FBE1CC', '#8B350C'], dark: ['#50392C', '#F6B18A'] },
} as const;

export function FamilyApprovalsScreen({ household, focusActive, onRefreshData, tvPairing }: FamilyScreenProps) {
  const p = useDesignPalette(true);
  const [selected, setSelected] = useState<{ item: Pending; action: string } | null>(null);
  const [celebrate, setCelebrate] = useState<{ memberId: string; stars: number; detail: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  usePageBack(() => setSelected(null), !!selected);
  const items: Pending[] = [
    ...(household.choreVerifications || [])
      .filter((item) => item.status === 'pending')
      .map((item) => {
        const chore = household.chores.find((c) => c.id === item.choreId);
        return { kind: 'photo' as const, id: item.id, memberId: item.memberId, photoId: item.photoId, stars: chore?.points ?? 1,
          title: chore?.title ?? 'Chore', verdict: item.verdict, detail: item.reason };
      }),
    ...(household.redemptions || [])
      .filter((item) => item.status === 'pending')
      .map((item) => ({ kind: 'reward' as const, id: item.id, memberId: item.memberId, stars: item.stars,
        title: household.rewards?.find((r) => r.id === item.rewardId)?.title ?? 'A reward',
        detail: `Uses ${item.stars} stars if you approve.` })),
  ];
  const submit = async (code: string) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const { item, action } = selected;
      if (item.kind === 'photo') await familyAgentClient.decideChorePhoto(item.id, action as 'approve' | 'reject' | 'retake', code);
      else await familyAgentClient.decideRedemption(item.id, action as 'approve' | 'reject', code);
      setSelected(null);
      if (action === 'approve' && item.kind === 'photo') setCelebrate({ memberId: item.memberId, stars: item.stars, detail: `${item.title} is approved.` });
      setMessage(action === 'approve' ? (item.kind === 'reward' ? `${name(household, item.memberId)} gets ${item.title}.` : 'Approved.')
        : action === 'retake' ? 'Asked for a new photo.' : 'Declined. Nothing else changed.');
      onRefreshData();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };
  const header = <PageHeader label="WAITING FOR A PARENT" title="Approvals" />;
  if (tvPairing?.status !== 'paired') {
    return (
      <View style={{ flex: 1, gap: 28 }}>
        {header}
        <BriefingCard label="PAIR THIS TV" headline="Approve chores and rewards here" summary="Pair this TV with the Hometide phone app in Settings. Chore photos and reward requests will wait here for you." />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, gap: 24 }}>
      {header}
      {message ? <DText size={26} weight={700} color={p.muted} accessibilityLiveRegion="polite">{message}</DText> : null}
      {items.length ? (
        <SpatialNavigationNode orientation="vertical">
          <View style={{ gap: 18, padding: 8 }}>
          {items.slice(0, 4).map((item, index) => {
            const member = household.members.find((m) => m.id === item.memberId);
            const verdict = item.kind === 'photo' ? VERDICT[item.verdict] : undefined;
            const chip = verdict ? (p.dark ? verdict.dark : verdict.light) : undefined;
            return (
              <DPanel key={item.id} home style={{ flexDirection: 'row', alignItems: 'center', gap: 28, paddingVertical: 24, paddingHorizontal: 32 }}>
                {item.kind === 'photo' && item.photoId ? (
                  <PrivateImage path={`v1/chores/verifications/${item.id}/photo?variant=thumb`} size={168} />
                ) : (
                  <View style={{ width: 168, height: 168, borderRadius: 24, backgroundColor: p.briefing, alignItems: 'center', justifyContent: 'center' }}>
                    <DIcon name="sparkle" size={72} color={p.briefingLabel} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 10, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <MemberAvatar member={member} size={44} />
                    <DText size={24} weight={800} color={p.muted} style={{ letterSpacing: 2 }}>
                      {(member?.name ?? 'SOMEONE').toUpperCase()} · {item.kind === 'photo' ? 'CHORE PHOTO' : 'REWARD'}
                    </DText>
                  </View>
                  <DText heading size={40} weight={700} numberOfLines={1}>{item.title}</DText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    {verdict && chip ? (
                      <View style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14, backgroundColor: chip[0] }}>
                        <DText size={22} weight={800} color={chip[1]}>{verdict.text} · advice only</DText>
                      </View>
                    ) : null}
                    <DText size={22} color={p.muted} numberOfLines={1} style={{ flex: 1 }}>{item.detail}</DText>
                  </View>
                </View>
                <DRow style={{ gap: 12, alignItems: 'center' }}>
                  <DAction label={`Approve · ${item.stars}★`} primary active={focusActive && !selected} defaultFocus={index === 0}
                    onPress={() => { setError(''); setSelected({ item, action: 'approve' }); }} />
                  {item.kind === 'photo' ? (
                    <DAction label="Retake" active={focusActive && !selected} onPress={() => { setError(''); setSelected({ item, action: 'retake' }); }} />
                  ) : null}
                  <DAction label="Decline" active={focusActive && !selected} onPress={() => { setError(''); setSelected({ item, action: 'reject' }); }} />
                </DRow>
              </DPanel>
            );
          })}
          {items.length > 4 ? <DText size={24} color={p.muted}>{`${items.length - 4} more after these`}</DText> : null}
          </View>
        </SpatialNavigationNode>
      ) : (
        <BriefingCard icon="check" label="ALL CAUGHT UP" headline="Nothing is waiting for you"
          summary="Chore photos and reward requests from the phone app appear here for a quick yes with the remote." />
      )}
      {selected ? (
        <Scrim inScreen>
          <ModalFocusRoot isActive={focusActive}>
            <NumberPad
              title={selected.action === 'approve' ? 'Approve' : selected.action === 'retake' ? 'Ask for a retake' : 'Decline'}
              detail={`${name(household, selected.item.memberId)} · ${selected.item.title}`}
              error={error} busy={busy} onSubmit={(code) => void submit(code)} onCancel={() => setSelected(null)} />
          </ModalFocusRoot>
        </Scrim>
      ) : null}
      {celebrate ? (
        <StarCelebration member={household.members.find((m) => m.id === celebrate.memberId)} stars={celebrate.stars}
          detail={celebrate.detail} onDone={() => setCelebrate(null)} />
      ) : null}
    </View>
  );
}

// Movement breaks ------------------------------------------------------------------------------------

export function FamilyMoveScreen({ household, now, focusActive, onRefreshData, tvPairing }: FamilyScreenProps) {
  const p = useDesignPalette(true);
  const reduceMotion = useReducedMotion();
  const children = household.members.filter((member) => member.role === 'child');
  const today = localDateKey(now, household.family.timezone);
  const scheduled = household.events.find(
    (event) => event.category === 'move' && localDateKey(event.startAt, household.family.timezone) === today,
  );
  const [routine, setRoutine] = useState<MoveRoutine | null>(null);
  const [joined, setJoined] = useState<string[]>(children.map((member) => member.id));
  const [clock, setClock] = useState({ index: 0, left: 0, done: false });
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const [finished, setFinished] = useState<'no' | 'saving' | 'saved' | 'local' | 'failed'>('no');
  const segments = useMemo(() => (routine ? moveSegments(routine) : []), [routine]);
  const exit = () => {
    setRoutine(null);
    setFinished('no');
  };
  usePageBack(exit, !!routine);
  const start = (value: MoveRoutine) => {
    setRoutine(value);
    setClock({ index: 0, left: moveSegments(value)[0].seconds, done: false });
    setPaused(false);
    setFinished('no');
  };
  const finish = async () => {
    setFinished('saving');
    if (tvPairing?.status !== 'paired' || !routine) return setFinished('local');
    try {
      await familyAgentClient.completeMove({ routineId: routine.id, memberIds: joined, date: today, ...(scheduled ? { eventId: scheduled.id } : {}) });
      setFinished('saved');
      onRefreshData();
    } catch {
      setFinished('failed');
    }
  };
  // Functional updates keep the countdown exact even if several ticks land before a re-render.
  const advance = (current: typeof clock, bySecond: boolean) => {
    if (current.done) return current;
    if (bySecond && current.left > 1) return { ...current, left: current.left - 1 };
    const next = current.index + 1;
    return next < segments.length ? { index: next, left: segments[next].seconds, done: false } : { ...current, left: 0, done: true };
  };
  useEffect(() => {
    if (!routine) return;
    const timer = setInterval(() => {
      if (!pausedRef.current) setClock((current) => advance(current, true));
    }, 1000);
    return () => clearInterval(timer);
  }, [routine, segments]);
  useEffect(() => {
    if (clock.done && finished === 'no') void finish();
  }, [clock.done]);
  const skip = () => setClock((current) => advance(current, false));
  const { index, left } = clock;
  const joinedMembers = household.members.filter((member) => joined.includes(member.id));
  const lead = memberTone(joinedMembers[0], p.dark);

  if (routine && finished !== 'no') {
    const minutes = Math.max(1, Math.round(segments.reduce((sum, s) => sum + s.seconds, 0) / 60));
    const earners = joinedMembers.filter((member) => member.role === 'child');
    return (
      <View style={{ flex: 1, gap: 28 }}>
        <BriefingCard icon="sparkle" label={`MOVEMENT BREAK · ${routine.name.toUpperCase()}`} headline="Great moving, everyone!"
          summary={`${routine.moves.length} moves in about ${minutes} minute${minutes === 1 ? '' : 's'}. ${finished === 'saving' ? 'Saving stars…' : finished === 'saved' ? 'Stars count once per session.' : finished === 'local' ? 'Pair this TV with the phone app to save stars.' : 'Stars could not be saved. Check the connection and try again.'}`}>
          <View style={{ gap: 14 }}>
            {finished === 'failed' ? <DAction label="Try again" primary defaultFocus active={focusActive} onPress={() => void finish()} style={{ minWidth: 260 }} /> : null}
            <DAction label="Do another" active={focusActive} onPress={exit} style={{ minWidth: 260 }} />
            <DAction label="Done" primary={finished !== 'failed'} defaultFocus={finished !== 'failed'} active={focusActive} onPress={exit} style={{ minWidth: 260 }} />
          </View>
        </BriefingCard>
        <SectionLabel>{finished === 'saved' ? 'STARS EARNED' : 'WHO MOVED'}</SectionLabel>
        <DRow style={{ gap: 24, flexWrap: 'wrap' }}>
          {joinedMembers.map((member) => {
            const tone = memberTone(member, p.dark);
            const earned = finished === 'saved' && earners.some((kid) => kid.id === member.id);
            return (
              <View key={member.id} style={{ width: 360, flexDirection: 'row', alignItems: 'center', gap: 18, padding: 20, borderRadius: 28, backgroundColor: tone.surface }}>
                <MemberAvatar member={member} size={72} />
                <View style={{ flex: 1, gap: 4 }}>
                  <DText size={32} weight={800}>{member.name}</DText>
                  <DText size={24} weight={700} color={earned ? tone.ink : p.muted}>{earned ? `+${routine.stars} stars` : member.role === 'child' ? 'Moved!' : 'Cheered them on'}</DText>
                </View>
                {earned ? <DIcon name="sparkle" size={40} color={GOLD} /> : null}
              </View>
            );
          })}
        </DRow>
      </View>
    );
  }
  if (routine) {
    const segment = segments[index];
    const move = segment.move;
    const moveNumber = routine.moves.indexOf(move) + 1;
    return (
      <View style={{ flex: 1, flexDirection: 'row', gap: 48 }}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <DIcon name="sparkle" size={24} color={p.briefingLabel} />
            <DText size={22} weight={800} color={p.briefingLabel} style={{ letterSpacing: 3.2 }}>
              {segment.kind === 'rest' ? 'REST · UP NEXT' : `MOVE ${moveNumber} OF ${routine.moves.length}`}
            </DText>
          </View>
          <DText heading size={96} weight={700} numberOfLines={2}>{move.name}</DText>
          <DText size={36} weight={500} color={p.dark ? p.muted : '#34384A'}>{segment.kind === 'rest' ? 'Catch your breath. Shake it out.' : move.instruction}</DText>
          {segment.kind === 'move' && segment.next ? <DText size={28} color={p.muted}>Next: {segment.next.name}</DText> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }} accessibilityLabel={`Step ${index + 1} of ${segments.length}`}>
            {segments.map((item, position) => (
              <View key={position} style={{ height: 12, flex: item.kind === 'rest' ? 0.4 : 1, borderRadius: 6, backgroundColor: position < index ? lead.accent : position === index ? p.ink : p.nextBorder }} />
            ))}
          </View>
          <DRow style={{ gap: 14, marginTop: 10 }}>
            {joinedMembers.map((member) => <MemberAvatar key={member.id} member={member} size={64} />)}
          </DRow>
        </View>
        <View style={{ width: 560, alignItems: 'center', justifyContent: 'center', gap: 34 }}>
          <View accessibilityLabel={`${left} seconds left`}
            style={{ width: 440, height: 440, borderRadius: 220, borderWidth: reduceMotion ? 12 : 18, borderColor: segment.kind === 'rest' ? p.nextBorder : lead.accent,
              alignItems: 'center', justifyContent: 'center', backgroundColor: segment.kind === 'rest' ? p.nextUp : p.card }}>
            <DText heading size={96} weight={700}>{left}</DText>
            <DText size={26} weight={700} color={p.muted} style={{ letterSpacing: 2 }}>{paused ? 'PAUSED' : 'SECONDS'}</DText>
          </View>
          <DRow style={{ gap: 16 }}>
            <DAction label={paused ? 'Resume' : 'Pause'} primary defaultFocus active={focusActive} onPress={() => setPaused(!paused)} />
            <DAction label="Skip" active={focusActive} onPress={skip} />
            <DAction label="Exit" active={focusActive} onPress={exit} />
          </DRow>
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, gap: 26, paddingBottom: 20 }}>
      <BriefingCard icon="sparkle" label={scheduled ? `SCHEDULED TODAY · ${scheduled.title.toUpperCase()}` : 'MOVEMENT BREAK'}
        headline="Time to get the wiggles out" summary={MOVE_SAFETY_NOTE} />
      <SectionLabel>WHO IS MOVING?</SectionLabel>
      <DRow style={{ gap: 16 }}>
        {household.members.map((member) => {
          const on = joined.includes(member.id);
          const tone = memberTone(member, p.dark);
          return (
            <DButton key={member.id} label={`${on ? 'Remove' : 'Add'} ${member.name}`} role="checkbox" checked={on} active={focusActive} radius={38}
              onPress={() => setJoined(on ? joined.filter((id) => id !== member.id) : [...joined, member.id])}
              style={{ height: 76, flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 10, paddingRight: 24, backgroundColor: on ? tone.surface : p.card, borderWidth: 2, borderColor: on ? tone.accent : p.border }}>
              <MemberAvatar member={member} size={56} />
              <DText size={28} weight={700} color={on ? p.ink : p.muted}>{member.name}</DText>
            </DButton>
          );
        })}
      </DRow>
      <SectionLabel>PICK A ROUTINE</SectionLabel>
      <DRow style={{ flex: 1, gap: 28 }}>
        {MOVE_ROUTINES.map((item, position) => {
          const minutes = Math.max(1, Math.round(moveSegments(item).reduce((sum, s) => sum + s.seconds, 0) / 60));
          const suggested = scheduled?.moveRoutineId ? scheduled.moveRoutineId === item.id : position === 0;
          return (
            <DButton key={item.id} label={`Start ${item.name}`} active={focusActive} defaultFocus={suggested} radius={36}
              onPress={() => start(item)} style={{ flex: 1, paddingHorizontal: 36, paddingVertical: 30, gap: 14, backgroundColor: p.card, borderWidth: 2, borderColor: p.border }}>
              <DText size={22} weight={800} color={p.muted} style={{ letterSpacing: 3.2 }}>{`${item.moves.length} MOVES · ${minutes} MIN · ${item.stars}★`}</DText>
              <DText heading size={40} weight={700}>{item.name}</DText>
              {item.moves.map((move) => <DText key={move.name} size={24} color={p.muted} numberOfLines={1}>{move.name}</DText>)}
            </DButton>
          );
        })}
      </DRow>
    </View>
  );
}

// Family night ---------------------------------------------------------------------------------------

export function FamilyNightTVScreen({ household, now }: FamilyScreenProps) {
  const p = useDesignPalette(true);
  const settings = household.familyNight;
  if (!settings) {
    return (
      <View style={{ flex: 1, gap: 28 }}>
        <PageHeader label="EVERY WEEK, TOGETHER" title="Family night" />
        <BriefingCard icon="sparkle" label="SET IT UP ON THE PHONE" headline="Pick a night. Everyone votes."
          summary="A parent chooses the weekly night in the Hometide app. Everyone suggests and votes from their phone, and the vote shows here live." />
      </View>
    );
  }
  const today = localDateKey(now, household.family.timezone);
  const poll = (household.familyNightPolls || []).filter((item) => item.id >= today).sort((a, b) => a.id.localeCompare(b.id))[0];
  const order = settings.pickerOrder.length ? settings.pickerOrder : household.members.map((member) => member.id);
  const picker = order[settings.pickerIndex % order.length];
  const counts = poll ? familyNightTally(poll) : {};
  const most = Math.max(1, ...Object.values(counts));
  const winner = poll?.suggestions.find((item) => item.id === poll.winnerSuggestionId);
  const weekday = poll ? WEEKDAYS[(new Date(`${poll.id}T12:00:00`).getDay() + 6) % 7] : WEEKDAYS[settings.weekday];
  const voted = poll ? Object.keys(poll.votes).length : 0;
  const headline = winner ? winner.title : poll?.status === 'tie' ? 'It’s a tie!' : poll?.suggestions.length ? 'The vote is open' : 'Ideas, anyone?';
  const summary = winner
    ? poll?.decidedBy === 'picker' ? `${name(household, poll.pickerMemberId)} picked it from the tie.` : 'Chosen by the family vote.'
    : poll?.status === 'tie' ? `${name(household, poll.pickerMemberId)} picks from the tied ideas on the phone.`
      : poll?.suggestions.length ? `${voted} of ${household.members.length} voted. On a tie, ${name(household, picker)} picks.`
        : `Suggest a ${settings.activityType} from the Hometide phone app to start this week’s vote.`;
  return (
    <View style={{ flex: 1, gap: 26 }}>
      <BriefingCard icon="sparkle" label={`FAMILY NIGHT · ${weekday.toUpperCase()} ${settings.time}`} headline={headline} summary={summary} />
      <DRow style={{ flex: 1, gap: 28, minHeight: 0 }}>
        <DPanel home style={{ flex: 1.7, paddingVertical: 30, paddingHorizontal: 40, gap: 18 }}>
          <SectionLabel>{poll && poll.status !== 'decided' ? `LIVE VOTE · ${voted} OF ${household.members.length} VOTED` : 'THIS WEEK’S IDEAS'}</SectionLabel>
          {(poll?.suggestions || []).slice(0, 5).map((item) => {
            const votes = counts[item.id] || 0;
            const by = household.members.find((m) => m.id === item.byMemberId);
            const tone = memberTone(by, p.dark);
            const isWinner = item.id === poll?.winnerSuggestionId;
            return (
              <View key={item.id} style={{ gap: 8 }} accessibilityLabel={`${item.title}: ${votes} votes`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <MemberAvatar member={by} size={40} />
                  <DText size={30} weight={isWinner ? 800 : 700} style={{ flex: 1 }} numberOfLines={1}>{item.title}</DText>
                  <DText size={28} weight={800} color={p.muted}>{votes}</DText>
                </View>
                <View style={{ height: 16, borderRadius: 8, backgroundColor: p.nextUp }}>
                  <View style={{ height: 16, borderRadius: 8, width: `${Math.max(4, (votes / most) * 100)}%`, backgroundColor: isWinner ? GOLD : tone.accent }} />
                </View>
              </View>
            );
          })}
          {!poll?.suggestions.length ? <DText size={28} color={p.muted}>No ideas yet this week.</DText> : null}
        </DPanel>
        <DPanel home style={{ flex: 1, paddingVertical: 30, paddingHorizontal: 36, gap: 14 }}>
          <SectionLabel>PICKER ROTATION</SectionLabel>
          {order.slice(0, 6).map((id) => {
            const member = household.members.find((m) => m.id === id);
            return (
              <View key={id} style={{ height: 64, flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 12, borderRadius: 20, backgroundColor: id === picker ? p.briefing : 'transparent' }}>
                <MemberAvatar member={member} size={48} />
                <DText size={28} weight={id === picker ? 800 : 600} style={{ flex: 1 }}>{member?.name ?? 'Someone'}</DText>
                {id === picker ? <DText size={22} weight={800} color={p.briefingLabel}>this week</DText> : null}
              </View>
            );
          })}
        </DPanel>
      </DRow>
    </View>
  );
}
