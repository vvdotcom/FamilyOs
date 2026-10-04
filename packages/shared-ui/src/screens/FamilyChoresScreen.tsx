import React, { useState } from 'react';
import { View } from 'react-native';
import { SpatialNavigationNode, SpatialNavigationScrollView } from 'react-tv-space-navigation';
import {
  Avatar,
  Check,
  DAction,
  DButton,
  DFooter,
  DPanel,
  DRow,
  DText,
  formatDate,
  localDateKey,
  memberColor,
  useDesignPalette,
} from '../design/DesignSystem';
import { FamilyScreenProps } from './familyTypes';

type Task = {
  id: string;
  title: string;
  member?: string;
  done: boolean;
  period: string;
  detail?: string;
  toggle: () => void;
};
export default function FamilyChoresScreen({
  household,
  now,
  focusActive,
  onCompleteChore,
  onToggleRoutineStep,
}: FamilyScreenProps) {
  const p = useDesignPalette();
  const timezone = household.family.timezone;
  const [upcoming, setUpcoming] = useState(false);
  const today = localDateKey(now, timezone);
  const tasks: Task[] = household.chores
    .filter((chore) =>
      upcoming
        ? chore.dueAt && localDateKey(chore.dueAt, timezone) > today
        : !chore.dueAt || localDateKey(chore.dueAt, timezone) <= today,
    )
    .map((chore) => {
      const hour = chore.dueAt
        ? Number(
            new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: timezone }).format(
              new Date(chore.dueAt),
            ),
          )
        : 15;
      return {
        id: chore.id,
        title: chore.title,
        member: chore.assignedToMemberId,
        done: chore.status === 'completed',
        period: hour < 12 ? 'Morning' : hour < 18 ? 'After school' : 'Evening',
        detail: [typeof chore.points === 'number' ? `+${chore.points} points` : '', chore.recurrence]
          .filter(Boolean)
          .join(' · '),
        toggle: () => onCompleteChore(chore.id, chore.status !== 'completed'),
      };
    });
  if (!upcoming)
    household.routines.forEach((routine) =>
      routine.steps.forEach((step) =>
        tasks.push({
          id: `${routine.id}-${step.id}`,
          title: step.title,
          member: routine.memberId,
          done: step.completed,
          period: routine.period === 'morning' ? 'Morning' : 'Evening',
          toggle: () => onToggleRoutineStep(routine.id, step.id),
        }),
      ),
    );
  return (
    <View style={{ flex: 1, gap: 26 }}>
      <DRow style={{ height: 101, alignItems: 'center', gap: 20 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <DText size={24} weight={700} color={p.muted} style={{ letterSpacing: 1.2 }}>
            {formatDate(now, timezone).toUpperCase()}
          </DText>
          <DText size={68} weight={800} heading style={{ letterSpacing: -1.36 }}>
            {upcoming ? 'Coming up' : 'Today’s chores'}
          </DText>
        </View>
        {household.members.map((member) => {
          const assigned = tasks.filter((task) => task.member === member.id);
          const done = assigned.filter((task) => task.done).length;
          return (
            <View
              key={member.id}
              accessibilityLabel={`${member.name}: ${done} of ${assigned.length} complete`}
              style={{
                minWidth: 196,
                height: 70,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 9,
                borderRadius: 35,
                backgroundColor: p.card,
                borderWidth: 1,
                borderColor: p.border,
              }}>
              <Avatar id={member.id} initials={member.initials} size={52} />
              <View style={{ flex: 1, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <DText size={22} weight={800}>
                    {member.name}
                  </DText>
                  <DText size={18} color={p.muted}>
                    {done}/{assigned.length}
                  </DText>
                </View>
                <View style={{ height: 7, borderRadius: 4, backgroundColor: p.soft }}>
                  <View
                    style={{
                      height: 7,
                      width: `${assigned.length ? (done / assigned.length) * 100 : 0}%`,
                      borderRadius: 4,
                      backgroundColor: memberColor(member.id).accent,
                    }}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </DRow>
      <DRow style={{ flex: 1, gap: 24 }}>
        {['Morning', 'After school', 'Evening'].map((period, periodIndex) => {
          const group = tasks.filter((task) => task.period === period);
          return (
            <SpatialNavigationNode key={period} orientation="vertical">
              <DPanel style={{ flex: 1, padding: 22 }}>
                <DText heading size={34} weight={700}>
                  {period}
                </DText>
                <DText size={22} color={p.muted} style={{ marginTop: 7, marginBottom: 26 }}>
                  {group.filter((task) => !task.done).length} to do · {group.filter((task) => task.done).length} done
                </DText>
                <SpatialNavigationScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 14, padding: 7 }}>
                  {group.map((task, index) => {
                    const member = household.members.find((item) => item.id === task.member);
                    const c = memberColor(task.member, p.dark);
                    return (
                      <View key={task.id} style={{ gap: 4 }}>
                        <DButton
                          label={`${task.done ? 'Mark incomplete' : 'Complete'} ${task.title}`}
                          role="checkbox"
                          checked={task.done}
                          onPress={task.toggle}
                          active={focusActive}
                          defaultFocus={periodIndex === 0 && index === 0}
                          radius={18}
                          style={{
                            height: 76,
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 16,
                            gap: 16,
                            backgroundColor: task.done ? p.soft : c.surface,
                          }}>
                          <Check done={task.done} size={38} color={c.accent} />
                          <DText
                            size={26}
                            weight={700}
                            color={task.done ? p.muted : p.ink}
                            numberOfLines={1}
                            style={{ flex: 1, textDecorationLine: task.done ? 'line-through' : 'none' }}>
                            {task.title}
                          </DText>
                          <Avatar id={task.member} initials={member?.initials ?? 'F'} size={40} />
                        </DButton>
                        {task.detail ? (
                          <DText size={18} color={p.muted} style={{ paddingLeft: 18 }}>
                            {task.detail}
                          </DText>
                        ) : null}
                      </View>
                    );
                  })}
                  {!group.length ? (
                    <DText size={24} color={p.muted}>
                      Nothing planned. Enjoy the breathing room.
                    </DText>
                  ) : null}
                </SpatialNavigationScrollView>
              </DPanel>
            </SpatialNavigationNode>
          );
        })}
      </DRow>
      <DFooter
        action="Check off / undo"
        detail={`${tasks.filter((task) => task.done).length} of ${tasks.length} complete`}>
        <DAction
          label={upcoming ? 'Today’s chores' : 'Coming up'}
          onPress={() => setUpcoming(!upcoming)}
          active={focusActive}
          size={22}
          style={{ minHeight: 44 }}
        />
      </DFooter>
    </View>
  );
}
