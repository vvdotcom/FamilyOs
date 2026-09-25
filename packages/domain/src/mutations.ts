import { Chore, HouseholdSnapshot, ProposedAction } from './types';
import { detectConflicts } from './conflicts';

export function setChoreCompleted(
  household: HouseholdSnapshot,
  choreId: string,
  completed: boolean,
  completedAt: string,
): HouseholdSnapshot {
  if (!Number.isFinite(Date.parse(completedAt))) throw new Error('Chore completion requires a valid timestamp.');
  let found = false;
  const chores = household.chores.map((chore): Chore => {
    if (chore.id !== choreId) return { ...chore };
    found = true;
    if (completed) return { ...chore, status: 'completed' as const, completedAt };
    const pending = { ...chore, status: 'pending' as const };
    delete pending.completedAt;
    return pending;
  });
  if (!found) throw new Error(`Chore not found: ${choreId}`);
  return { ...household, chores };
}

export function toggleRoutineStep(household: HouseholdSnapshot, routineId: string, stepId: string): HouseholdSnapshot {
  let routineFound = false;
  let stepFound = false;
  const routines = household.routines.map((routine) => {
    if (routine.id !== routineId) return { ...routine, steps: routine.steps.map((step) => ({ ...step })) };
    routineFound = true;
    return {
      ...routine,
      steps: routine.steps.map((step) => {
        if (step.id !== stepId) return { ...step };
        stepFound = true;
        return { ...step, completed: !step.completed };
      }),
    };
  });
  if (!routineFound) throw new Error(`Routine not found: ${routineId}`);
  if (!stepFound) throw new Error(`Routine step not found: ${stepId}`);
  return { ...household, routines };
}

export function togglePreparationItem(
  household: HouseholdSnapshot,
  eventId: string,
  itemId: string,
): HouseholdSnapshot {
  let eventFound = false;
  let itemFound = false;
  const events = household.events.map((event) => {
    if (event.id !== eventId) return { ...event, preparation: event.preparation.map((item) => ({ ...item })) };
    eventFound = true;
    return {
      ...event,
      preparation: event.preparation.map((item) => {
        if (item.id !== itemId) return { ...item };
        itemFound = true;
        return { ...item, completed: !item.completed };
      }),
    };
  });
  if (!eventFound) throw new Error(`Event not found: ${eventId}`);
  if (!itemFound) throw new Error(`Preparation item not found: ${itemId}`);
  return { ...household, events };
}

export function confirmReassignment(
  household: HouseholdSnapshot,
  action: ProposedAction,
  confirmedAt: string,
): { household: HouseholdSnapshot; action: ProposedAction } {
  if (!Number.isFinite(Date.parse(confirmedAt))) throw new Error('Action confirmation requires a valid timestamp.');
  if (action.type !== 'reassign_responsibility' || action.status !== 'proposed') {
    throw new Error('Only a pending pickup reassignment can be confirmed.');
  }
  const conflict = detectConflicts(household.members, household.events, { now: confirmedAt }).find(
    (item) => item.id === action.conflictId && item.type === 'responsibility_overlap',
  );
  const event = household.events.find((item) => item.id === action.eventId);
  const target = household.members.find((item) => item.id === action.toMemberId);
  if (!conflict || !event || event.responsibleMemberId !== action.fromMemberId) {
    throw new Error('The schedule changed. Review this pickup again before confirming.');
  }
  if (!target || target.role !== 'adult' || target.id === action.fromMemberId) {
    throw new Error('A pickup can only be assigned to another adult.');
  }
  const start = Date.parse(event.startAt);
  const end = Date.parse(event.endAt);
  const busy = household.events.some(
    (candidate) =>
      candidate.id !== event.id &&
      (candidate.memberIds.includes(target.id) || candidate.responsibleMemberId === target.id) &&
      start < Date.parse(candidate.endAt) &&
      Date.parse(candidate.startAt) < end,
  );
  if (busy) throw new Error('The suggested adult is no longer available.');
  return {
    household: {
      ...household,
      events: household.events.map((item) =>
        item.id === event.id ? { ...item, responsibleMemberId: target.id } : { ...item },
      ),
    },
    action: { ...action, status: 'confirmed', confirmedAt },
  };
}
