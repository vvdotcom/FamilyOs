import React from 'react';
import { View } from 'react-native';
import { Avatar, DAction, DFooter, DPanel, DRow, DText, formatTime, useDesignPalette } from '../design/DesignSystem';
import { FamilyScreenProps } from './familyTypes';

export default function FamilyMembersScreen({ household, now, onFocusNavigation, focusActive }: FamilyScreenProps) {
  const p = useDesignPalette();
  return (
    <View style={{ flex: 1, gap: 28 }}>
      <View style={{ gap: 10 }}>
        <DText size={24} weight={700} color={p.muted} style={{ letterSpacing: 1.2 }}>
          {household.family.name.toUpperCase()}
        </DText>
        <DText heading size={68} weight={800} style={{ letterSpacing: -1.36 }}>
          Meet your family
        </DText>
      </View>
      <View style={{ flex: 1, gap: 24 }}>
        {[0, 2].map((start) => (
          <DRow key={start} style={{ flex: 1, gap: 24 }}>
            {household.members.slice(start, start + 2).map((member) => {
              const next = household.events
                .filter(
                  (event) =>
                    (event.memberIds.includes(member.id) || event.responsibleMemberId === member.id) &&
                    Date.parse(event.endAt) > now.getTime(),
                )
                .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
              return (
                <DPanel key={member.id} style={{ flex: 1, gap: 22, padding: 36 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
                    <Avatar id={member.id} initials={member.initials} size={80} pastel />
                    <View style={{ gap: 6 }}>
                      <DText heading size={38} weight={700}>
                        {member.name}
                      </DText>
                      <DText size={22} weight={700} color={p.muted}>
                        {member.role === 'adult' ? 'PARENT' : 'KID'}
                      </DText>
                    </View>
                  </View>
                  <View style={{ height: 1, backgroundColor: p.border }} />
                  <DText size={26}>
                    {next
                      ? `${next.title} · ${formatTime(next.startAt, household.family.timezone)}`
                      : 'Free for the rest of today'}
                  </DText>
                </DPanel>
              );
            })}
          </DRow>
        ))}
      </View>
      <DFooter action="Select">
        <DAction
          label="Back to sections"
          onPress={onFocusNavigation}
          active={focusActive}
          defaultFocus
          size={22}
          style={{ minHeight: 44 }}
        />
      </DFooter>
    </View>
  );
}
