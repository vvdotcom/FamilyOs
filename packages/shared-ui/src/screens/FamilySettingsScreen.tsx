import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { DAction, DButton, DFooter, DPanel, DRow, DText, useDesignPalette } from '../design/DesignSystem';
import { useFamilyTheme } from '../theme';
import { usePageBack } from '../hooks/usePageBack';
import { SpatialNavigationNode } from 'react-tv-space-navigation';
import { ModalFocusRoot } from '../components/ModalFocusRoot';
import { CANVAS_COVER, NumberPad } from './FamilyTVFeatures';
import { FamilyScreenProps } from './familyTypes';

export default function FamilySettingsScreen({
  household,
  onResetDemo,
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
}: FamilyScreenProps & { onResetDemo: () => void }) {
  const p = useDesignPalette();
  const { mode, setMode } = useFamilyTheme();
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);
  usePageBack(() => setUnlocking(false), unlocking);
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
          MAKE FAMILYOS FEEL LIKE HOME
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
            {tvPairing.status === 'paired' ? 'This TV is linked to your family household.' : 'Your family data stays in this local demo for now.'}
          </DText>
          <View style={{ height: 1, backgroundColor: p.border }} />
          <DText size={34} heading weight={700}>TV connection</DText>
          {tvPairing.status === 'paired' ? (
            <>
              <DText size={24} color={p.muted}>Connected to your household. Calendar, chores, lists, and meals refresh about every 5 seconds.</DText>
              <DRow style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <DAction label="Unpair this TV" onPress={onUnpairTV ?? (() => {})} active={focusActive && !unlocking} />
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
                  active={focusActive && !unlocking}
                />
              </DRow>
              <DText size={22} color={p.muted} accessibilityLiveRegion="polite">
                {tvParentMode ? 'Parent mode is on. It locks after 5 minutes without changes.' : 'Checking off chores and lists works for everyone. Other changes need parent mode.'}
              </DText>
            </>
          ) : tvPairing.status === 'waiting' && tvPairing.code ? (
            <>
              <DText size={24} color={p.muted}>Enter this code in the signed-in FamilyOS phone app. It expires in 10 minutes.</DText>
              <DText heading size={88} weight={800} style={{ letterSpacing: 8 }}>{tvPairing.code}</DText>
              <DText size={22} color={p.muted} accessibilityLiveRegion="polite">Waiting for phone approval…</DText>
            </>
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
            <View
              style={{
                width: 88,
                height: 48,
                borderRadius: 24,
                backgroundColor: mode === 'dark' ? p.selected : p.muted,
              }}>
              <View
                style={{
                  position: 'absolute',
                  top: 6,
                  left: mode === 'dark' ? 46 : 6,
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: '#FFFFFF',
                }}
              />
            </View>
          </DButton>
          <DText size={22} color={p.muted} accessibilityLiveRegion="polite">
            {mode === 'light' ? 'Light theme selected' : 'Dark theme selected'}
          </DText>
          <View style={{ flex: 1 }} />
          <DAction
            label="Reset demo household"
            onPress={onResetDemo}
            active={focusActive}
            style={{ alignSelf: 'flex-start' }}
          />
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
                : agentStatus === 'offline'
                  ? 'Offline · local demo'
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
              ? 'Household data comes from your FamilyOS account. Voice requests appear here for confirmation.'
              : 'Fictional household data. No external accounts, phone sync, or cloud services are connected.'}
          </DText>
          <View style={{ height: 1, backgroundColor: p.border }} />
          {[
            ['Calendar', calendarState],
            ['Weather', weatherState],
          ].map(([label, state]) => {
            const status = state as typeof calendarState;
            return (
              <View key={String(label)} style={{ flexDirection: 'row', gap: 24 }}>
                <DText size={26} weight={700} style={{ flex: 1 }}>
                  {String(label)}
                </DText>
                <DText size={24} color={p.muted}>
                  {status.status === 'available' ? 'Demo ready' : status.status}
                </DText>
              </View>
            );
          })}
          <DAction
            label="Refresh demo data"
            onPress={onRefreshData}
            active={focusActive}
            style={{ alignSelf: 'flex-start' }}
          />
          <View style={{ flex: 1 }} />
          <DText size={22} color={p.muted}>
            {tvPairing.status === 'paired'
              ? 'Changes sync with your family account.'
              : Platform.OS === 'web'
                ? 'Chores and theme are saved in this browser.'
                : 'Chores, theme, and pairing are saved on this TV.'}
          </DText>
        </DPanel>
        </SpatialNavigationNode>
      </DRow>
      <DFooter action="Select" />
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
