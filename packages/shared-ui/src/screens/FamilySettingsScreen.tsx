import React from 'react';
import { View } from 'react-native';
import { DAction, DButton, DFooter, DPanel, DRow, DText, useDesignPalette } from '../design/DesignSystem';
import { useFamilyTheme } from '../theme';
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
}: FamilyScreenProps & { onResetDemo: () => void }) {
  const p = useDesignPalette();
  const { mode, setMode } = useFamilyTheme();
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
        <DPanel style={{ flex: 1.2, padding: 36, gap: 24 }}>
          <DText size={22} weight={800} color={p.muted}>
            HOUSEHOLD
          </DText>
          <DText size={34} heading weight={700}>
            {household.family.name}
          </DText>
          <DText size={24} color={p.muted}>
            Your family data stays in this local demo for now.
          </DText>
          <View style={{ height: 1, backgroundColor: p.border }} />
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
        <DPanel style={{ flex: 1, padding: 36, gap: 24 }}>
          <DText size={34} heading weight={700}>
            About this build
          </DText>
          <DText size={26}>FamilyOS local preview</DText>
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
            Fictional household data. No external accounts, phone sync, or cloud services are connected.
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
            Web edits are saved in this browser. Native preview edits are session-only. Vega device testing is still
            required.
          </DText>
        </DPanel>
      </DRow>
      <DFooter action="Select" />
    </View>
  );
}
