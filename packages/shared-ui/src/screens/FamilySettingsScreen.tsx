import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { DAction, DButton, DFooter, DPanel, DRow, DText, useDesignPalette } from '../design/DesignSystem';
import { useFamilyTheme } from '../theme';
import { usePageBack } from '../hooks/usePageBack';
import { SpatialNavigationNode } from 'react-tv-space-navigation';
import { ModalFocusRoot } from '../components/ModalFocusRoot';
import { CANVAS_COVER, NumberPad } from './FamilyTVFeatures';
import { QRCode } from '../components/QRCode';
import { FamilyScreenProps } from './familyTypes';

export default function FamilySettingsScreen({
  household,
  focusActive,
  calendarState,
  weatherState,
  onRefreshData,
  agentStatus = 'checking',
  briefing,
  actionHistory = [],
  tvPairing = { status: 'unpaired' },
  onStartPairing,
  onUnpairTV,
  tvParentMode = false,
  onUnlockParentMode,
  onLockParentMode,
  wallCalendar,
}: FamilyScreenProps & { onResetDemo: () => void }) {
  const p = useDesignPalette();
  const { mode, setMode } = useFamilyTheme();
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  usePageBack(() => {
    setUnlocking(false);
    setConfirmUnpair(false);
  }, unlocking || confirmUnpair);
  const paired = tvPairing.status === 'paired';
  const unlock = async (code: string) => {
    setUnlockBusy(true);
    setUnlockError('');
    try {
      await onUnlockParentMode?.(code);
      setUnlocking(false);
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : 'That code did not work.');
    } finally {
      setUnlockBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, gap: 28 }}>
      <View style={{ gap: 10 }}>
        <DText size={24} weight={700} color={p.muted} style={{ letterSpacing: 1.2 }}>
          MAKE HOMETIDE FEEL LIKE HOME
        </DText>
        <DText heading size={68} weight={800} style={{ letterSpacing: -1.36 }}>
          Settings
        </DText>
      </View>
      <DRow style={{ flex: 1, gap: 24 }}>
        <SpatialNavigationNode orientation="vertical">
        <DPanel style={{ flex: 1.2, padding: 36, gap: 24 }}>
          <DText size={22} weight={800} color={p.muted}>
            HOUSEHOLD
          </DText>
          <DText size={34} heading weight={700}>
            {household.family.name}
          </DText>
          <DText size={24} color={p.muted}>
            {tvPairing.status === 'paired' ? 'This TV is linked to your family household.' : 'Pair this TV with your Hometide account to show your family here.'}
          </DText>
          <View style={{ height: 1, backgroundColor: p.border }} />
          <DText size={34} heading weight={700}>TV connection</DText>
          {tvPairing.status === 'paired' ? (
            <>
              <DText size={24} color={p.muted}>Connected to your household. Calendar, chores, lists, and meals refresh about every 5 seconds.</DText>
              <DRow style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <DAction label="Unpair this TV" onPress={() => setConfirmUnpair(true)} active={focusActive && !unlocking && !confirmUnpair} />
                <DAction
                  label={tvParentMode ? 'Lock parent mode' : 'Parent mode · enter code'}
                  primary={!tvParentMode}
                  onPress={() => {
                    if (tvParentMode) void onLockParentMode?.();
                    else {
                      setUnlockError('');
                      setUnlocking(true);
                    }
                  }}
                  active={focusActive && !unlocking && !confirmUnpair}
                />
              </DRow>
              <DText size={22} color={p.muted} accessibilityLiveRegion="polite">
                {tvParentMode ? 'Parent mode is on. It locks after 5 minutes without changes.' : 'Checking off chores and lists works for everyone. Other changes need parent mode.'}
              </DText>
            </>
          ) : tvPairing.status === 'waiting' && tvPairing.code ? (
            <DRow style={{ gap: 28, alignItems: 'center' }}>
              {tvPairing.pairUrl ? (
                <QRCode value={tvPairing.pairUrl} size={216} accessibilityLabel="Scan to connect this TV with your phone" />
              ) : null}
              <View style={{ flex: 1, gap: 8 }}>
                <DText size={24} color={p.muted}>
                  {tvPairing.pairUrl ? 'Scan with your phone, then tap Approve TV. Or type this code:' : 'Enter this code in the signed-in Hometide phone app. It expires in 10 minutes.'}
                </DText>
                <DText heading size={tvPairing.pairUrl ? 56 : 88} weight={800} numberOfLines={1} style={{ letterSpacing: tvPairing.pairUrl ? 4 : 8 }}>{tvPairing.code}</DText>
                <DText size={22} color={p.muted} accessibilityLiveRegion="polite">Waiting for approval… expires in 10 minutes.</DText>
              </View>
            </DRow>
          ) : (
            <>
              <DText size={24} color={p.muted}>{tvPairing.error || (tvPairing.status === 'checking' ? 'Checking this TV’s connection…' : 'Pair with the phone to show your household data on this TV.')}</DText>
              <DAction
                label={tvPairing.status === 'creating' ? 'Creating code…' : 'Show pairing code'}
                onPress={() => {
                  if (tvPairing.status === 'unpaired') onStartPairing?.();
                }}
                active={focusActive}
              />
            </>
          )}
        </DPanel>
        </SpatialNavigationNode>
        {/* Appearance and reset get their own panel so the household column never runs past the
            1080p canvas (on Vega the single column clipped "Reset demo household"). */}
        <SpatialNavigationNode orientation="vertical">
        <DPanel style={{ flex: 1, padding: 36, gap: 24 }}>
          <DText size={34} heading weight={700}>
            Appearance
          </DText>
          <DText size={24} color={p.muted}>
            Choose a comfortable look for your TV.
          </DText>
          <DButton
            label="Dark mode"
            role="switch"
            checked={mode === 'dark'}
            active={focusActive}
            defaultFocus
            onPress={() => setMode(mode === 'light' ? 'dark' : 'light')}
            radius={20}
            style={{
              height: 88,
              paddingHorizontal: 24,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 24,
              backgroundColor: p.background,
            }}>
            <DText size={28} weight={700} style={{ flex: 1 }}>
              Dark mode
            </DText>
            <DText size={24} color={p.muted}>
              {mode === 'dark' ? 'On' : 'Off'}
            </DText>
            <SwitchPill on={mode === 'dark'} />
          </DButton>
          <DText size={22} color={p.muted} accessibilityLiveRegion="polite">
            {mode === 'light' ? 'Light theme selected' : 'Dark theme selected'}
          </DText>
          {wallCalendar ? (
            <>
              <DButton
                label="Wall calendar when idle"
                role="switch"
                checked={wallCalendar.enabled}
                active={focusActive && !confirmUnpair}
                onPress={wallCalendar.onToggle}
                radius={20}
                style={{ height: 88, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 24, backgroundColor: p.background }}>
                <DText size={28} weight={700} style={{ flex: 1 }}>
                  Wall calendar when idle
                </DText>
                <DText size={24} color={p.muted}>
                  {wallCalendar.enabled ? 'On' : 'Off'}
                </DText>
                <SwitchPill on={wallCalendar.enabled} />
              </DButton>
              <DText size={22} color={p.muted}>
                {`After ${wallCalendar.idleMinutes} idle minutes, show today in large type. For longer, raise the Fire TV screensaver wait: Settings → Display & Sounds → Ambient Experience.`}
              </DText>
              <DAction label="Show wall calendar now" onPress={wallCalendar.onShowNow} active={focusActive && !confirmUnpair} style={{ alignSelf: 'flex-start' }} />
            </>
          ) : null}
        </DPanel>
        </SpatialNavigationNode>
        <SpatialNavigationNode orientation="vertical">
        <DPanel style={{ flex: 1, padding: 32, gap: 16 }}>
          <DText size={34} heading weight={700}>
            About this build
          </DText>
          <View style={{ flexDirection: 'row', gap: 24 }}>
            <DText size={26} weight={700} style={{ flex: 1 }}>
              Family agent
            </DText>
            <DText size={24} color={p.muted}>
              {agentStatus === 'available'
                ? 'Connected'
                : agentStatus === 'unpaired'
                  ? 'Reachable · not paired'
                  : agentStatus === 'offline'
                  ? 'Offline'
                  : 'Connecting'}
            </DText>
          </View>
          <DText size={22} color={p.muted}>
            Briefing: {briefing?.provider === 'ai' ? 'Amazon Bedrock' : 'deterministic fallback'}
          </DText>
          {actionHistory[0] ? (
            <DText size={22} color={p.muted}>
              Pickup updated:{' '}
              {household.members.find((member) => member.id === actionHistory[0].toMemberId)?.name ?? 'family member'}
            </DText>
          ) : null}
          <DText size={24} color={p.muted}>
            {tvPairing.status === 'paired'
              ? 'Household data comes from your Hometide account. Voice requests appear here for confirmation.'
              : 'No family is connected yet. Pair this TV to show your calendar, chores, meals, and lists.'}
          </DText>
          <View style={{ height: 1, backgroundColor: p.border }} />
          {[
            ['Calendar', calendarState],
            ['Weather', weatherState],
          ].map(([label, state]) => {
            const status = state as typeof calendarState;
            const live = label === 'Weather' ? status.source === 'National Weather Service' : paired;
            const place = label === 'Weather' ? weatherState.data?.location : undefined;
            const text = status.status === 'available'
              ? live ? `Live${place ? ` · ${place}` : ''}` : 'Ready'
              : status.status === 'cached' ? 'Saved copy' : status.status === 'loading' ? 'Loading' : status.status === 'empty' ? 'Nothing yet' : 'Unavailable';
            return (
              <View key={String(label)} style={{ flexDirection: 'row', gap: 24 }}>
                <DText size={26} weight={700} style={{ flex: 1 }}>
                  {String(label)}
                </DText>
                <DText size={24} color={p.muted} numberOfLines={1} style={{ maxWidth: 360 }}>
                  {text}
                </DText>
              </View>
            );
          })}
          <DRow style={{ gap: 12, flexWrap: 'wrap' }}>
            <DAction
              label="Refresh now"
              onPress={onRefreshData}
              active={focusActive && !confirmUnpair}
            />
          </DRow>
          <View style={{ flex: 1 }} />
          <DText size={22} color={p.muted}>
            {tvPairing.status === 'paired'
              ? 'Changes sync with your family account.'
              : Platform.OS === 'web'
                ? 'Theme is saved in this browser.'
                : 'Theme and pairing are saved on this TV.'}
          </DText>
        </DPanel>
        </SpatialNavigationNode>
      </DRow>
      <DFooter action="Select" />
      {confirmUnpair ? (
        <View style={{ position: 'absolute', zIndex: 50, ...CANVAS_COVER, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17130FCC' }}>
          <ModalFocusRoot isActive={focusActive}>
            <DPanel style={{ width: 860, padding: 48, gap: 24 }}>
              <DText heading size={44} weight={800}>
                Unpair this TV?
              </DText>
              <DText size={26} color={p.muted}>
                Your family’s calendar, chores, and photos leave this TV. To bring them back, pair again with the Hometide phone app.
              </DText>
              <DRow style={{ gap: 16 }}>
                <DAction label="Keep this TV paired" primary defaultFocus onPress={() => setConfirmUnpair(false)} active={focusActive} />
                <DAction
                  label="Unpair"
                  onPress={() => {
                    setConfirmUnpair(false);
                    onUnpairTV?.();
                  }}
                  active={focusActive}
                />
              </DRow>
            </DPanel>
          </ModalFocusRoot>
        </View>
      ) : null}
      {unlocking ? (
        <View style={{ position: 'absolute', zIndex: 50, ...CANVAS_COVER, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17130FCC' }}>
          <ModalFocusRoot isActive={focusActive}>
            <NumberPad
              title="Parent mode"
              detail="Enter the four-digit parent code. Parent mode locks again after 5 idle minutes."
              error={unlockError}
              busy={unlockBusy}
              onSubmit={(code) => void unlock(code)}
              onCancel={() => setUnlocking(false)}
            />
          </ModalFocusRoot>
        </View>
      ) : null}
    </View>
  );
}

function SwitchPill({ on }: { on: boolean }) {
  const p = useDesignPalette();
  return (
    <View style={{ width: 88, height: 48, borderRadius: 24, backgroundColor: on ? p.selected : p.muted }}>
      <View style={{ position: 'absolute', top: 6, left: on ? 46 : 6, width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF' }} />
    </View>
  );
}
