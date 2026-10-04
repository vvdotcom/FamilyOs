import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  createDemoHousehold,
  DEMO_NOW,
  detectConflicts,
  HouseholdSnapshot,
  moveSegments,
  MOVE_ROUTINES,
} from '@familyos/domain';
import {FamilyThemeProvider} from '../../../packages/shared-ui/src/theme';
import {FamilyScreenProps} from '../../../packages/shared-ui/src/screens/familyTypes';
import {
  FamilyApprovalsScreen,
  FamilyMoveScreen,
  FamilyNightTVScreen,
  NumberPad,
  ProposalOverlay,
} from '../../../packages/shared-ui/src/screens/FamilyTVFeatures';

jest.mock('react-tv-space-navigation', () => {
  const ReactModule = require('react');
  const ReactNative = require('react-native');
  const lockActions = {lock: () => undefined, unlock: () => undefined};
  const passthrough = ({children}: {children: React.ReactNode}) =>
    ReactModule.createElement(ReactModule.Fragment, null, children);
  return {
    DefaultFocus: passthrough,
    useLockSpatialNavigation: () => lockActions,
    SpatialNavigationRoot: passthrough,
    SpatialNavigationNode: passthrough,
    SpatialNavigationFocusableView: ({
      children,
      viewProps,
      onSelect,
    }: {
      viewProps: object;
      onSelect: () => void;
      children: React.ReactNode | ((state: {isFocused: boolean}) => React.ReactNode);
    }) =>
      ReactModule.createElement(
        ReactNative.Pressable,
        {...viewProps, onPress: onSelect},
        typeof children === 'function' ? children({isFocused: false}) : children,
      ),
    SpatialNavigationScrollView: ({children, ...props}: {children: React.ReactNode}) =>
      ReactModule.createElement(ReactNative.ScrollView, props, children),
  };
});

jest.mock('../../../packages/shared-ui/src/hooks/useReducedMotion', () => ({
  useReducedMotion: jest.fn(() => false),
}));
const reducedMotion = jest.requireMock('../../../packages/shared-ui/src/hooks/useReducedMotion').useReducedMotion as jest.Mock;

jest.mock('../../../packages/shared-ui/src/api/familyAgentClient', () => {
  class FamilyAgentError extends Error {
    constructor(message: string, readonly status?: number, readonly code?: string) {
      super(message);
    }
  }
  return {
    FamilyAgentError,
    familyAgentClient: {
      decideProposal: jest.fn(),
      decideChorePhoto: jest.fn(),
      decideRedemption: jest.fn(),
      completeMove: jest.fn(),
      imageSource: jest.fn(async (path: string) => ({uri: `https://tv.test/${path}`})),
    },
  };
});

const {familyAgentClient, FamilyAgentError} = jest.requireMock(
  '../../../packages/shared-ui/src/api/familyAgentClient',
);

const now = new Date(DEMO_NOW);
function makeProps(household: HouseholdSnapshot, overrides: Partial<FamilyScreenProps> = {}): FamilyScreenProps {
  return {
    household,
    conflicts: detectConflicts(household.members, household.events, {now}),
    now,
    calendarState: {status: 'available', data: household.events, source: 'Demo'},
    weatherState: {status: 'loading'},
    focusActive: true,
    onNavigate: jest.fn(),
    onFocusNavigation: jest.fn(),
    onCompleteChore: jest.fn(),
    onToggleRoutineStep: jest.fn(),
    onTogglePreparationItem: jest.fn(),
    onRefreshData: jest.fn(),
    tvPairing: {status: 'paired'},
    ...overrides,
  };
}
const themed = (element: React.ReactElement) => render(<FamilyThemeProvider>{element}</FamilyThemeProvider>);
const enter = (screen: ReturnType<typeof render>, code: string) =>
  code.split('').forEach(digit => fireEvent.press(screen.getByLabelText(digit)));

beforeEach(() => jest.clearAllMocks());

describe('Phase 12-14 TV features', () => {
  it('masks the parent code and submits only four digits', () => {
    const onSubmit = jest.fn();
    const screen = themed(<NumberPad title="Parent code" onSubmit={onSubmit} onCancel={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Submit code'));
    expect(onSubmit).not.toHaveBeenCalled();
    enter(screen, '48261');
    expect(screen.getByLabelText('4 of 4 digits entered')).toBeTruthy();
    expect(screen.queryByText('4826')).toBeNull();
    fireEvent.press(screen.getByLabelText('Submit code'));
    expect(onSubmit).toHaveBeenCalledWith('4826');
  });

  it('confirms a voice request with the remote, asking for the parent code when required', async () => {
    familyAgentClient.decideProposal
      .mockRejectedValueOnce(new FamilyAgentError('Ask a parent', 403, 'PARENT_CODE_REQUIRED'))
      .mockResolvedValueOnce({data: {proposal: {resultMessage: 'Done. Every screen will show the change.'}}});
    const onDone = jest.fn();
    const proposal = {
      id: 'p1', source: 'voice' as const, kind: 'pickup_swap' as const, status: 'pending' as const,
      summary: 'Alex takes Emma pickup instead of Jordan.', requestedBy: 'voice:parent',
      createdAt: '2026-09-22T20:00:00Z', expiresAt: '2026-09-23T20:00:00Z',
    };
    const screen = themed(<ProposalOverlay proposal={proposal} onDone={onDone} onDismiss={jest.fn()} />);
    expect(screen.getByText('VOICE REQUEST · NEEDS A YES')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Confirm'));
    await waitFor(() => expect(screen.getByText('Confirm this change')).toBeTruthy());
    enter(screen, '4826');
    fireEvent.press(screen.getByLabelText('Submit code'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Done. Every screen will show the change.'));
    expect(familyAgentClient.decideProposal).toHaveBeenLastCalledWith('p1', 'confirm', '4826');
  });

  it('offers a learned routine with its reason, and a no is final', async () => {
    familyAgentClient.decideProposal.mockResolvedValueOnce({data: {proposal: {resultMessage: 'Nothing was changed.'}}});
    const onDone = jest.fn();
    const routine = {
      id: 'r1', source: 'hometide' as const, kind: 'routine' as const, status: 'pending' as const,
      summary: 'Make Alex the usual Emma pickup on Tuesdays and Thursdays?',
      payload: {detail: "Jordan's Team meeting overlaps it every week. You swapped one by hand; it comes up 24 times.", memory: 'agentcore' as const},
      requestedBy: 'hometide', createdAt: '2026-09-22T20:00:00Z', expiresAt: '2026-09-23T20:00:00Z',
    };
    const screen = themed(<ProposalOverlay proposal={routine} onDone={onDone} onDismiss={jest.fn()} />);
    expect(screen.getByText('HOMETIDE NOTICED · NEEDS A YES')).toBeTruthy();
    expect(screen.getByText(/You swapped one by hand/)).toBeTruthy();
    expect(screen.getByText(/Hometide remembers your answer/)).toBeTruthy();
    expect(screen.getByLabelText('Yes, make it the routine')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('No, don’t ask again'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Nothing was changed.'));
    expect(familyAgentClient.decideProposal).toHaveBeenLastCalledWith('r1', 'reject', undefined);
  });

  it('runs a movement break session and saves stars once at the end', async () => {
    jest.useFakeTimers();
    try {
    familyAgentClient.completeMove.mockResolvedValue({data: {}});
    const household = createDemoHousehold();
    const props = makeProps(household);
    const screen = themed(<FamilyMoveScreen {...props} />);
    expect(screen.getByText(/not medical or fitness advice/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Start Wiggle warm-up'));
    expect(screen.getByText('Reach for the sky')).toBeTruthy();
    expect(screen.getByLabelText('30 seconds left')).toBeTruthy();
    act(() => jest.advanceTimersByTime(3000));
    expect(screen.getByLabelText('27 seconds left')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pause'));
    act(() => jest.advanceTimersByTime(5000));
    expect(screen.getByLabelText('27 seconds left')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Resume'));
    const segments = moveSegments(MOVE_ROUTINES[0]).length;
    for (let i = 0; i < segments; i += 1) fireEvent.press(screen.getByLabelText('Skip'));
    jest.useRealTimers(); // waitFor polls with real timers.
    await waitFor(() => expect(familyAgentClient.completeMove).toHaveBeenCalledTimes(1));
    const children = household.members.filter(member => member.role === 'child').map(member => member.id);
    expect(familyAgentClient.completeMove).toHaveBeenCalledWith(
      expect.objectContaining({routineId: 'wiggle-warmup', memberIds: children}),
    );
    await waitFor(() => expect(screen.getByText('Great moving, everyone!')).toBeTruthy());
    expect(screen.getAllByText('+2 stars').length).toBe(children.length);
    expect(props.onRefreshData).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the family night vote live with the rotating picker', () => {
    const household: HouseholdSnapshot = {
      ...createDemoHousehold(),
      familyNight: {weekday: 4, time: '18:30', activityType: 'movie', pickerOrder: ['emma', 'leo'], pickerIndex: 1},
      familyNightPolls: [{
        id: '2026-09-25', activityType: 'movie', status: 'open', tiedSuggestionIds: [],
        suggestions: [{id: 's1', title: 'Paddington', byMemberId: 'emma'}, {id: 's2', title: 'Board games', byMemberId: 'leo'}],
        votes: {emma: 's1', leo: 's1', alex: 's2'},
      }],
    };
    const screen = themed(<FamilyNightTVScreen {...makeProps(household)} />);
    expect(screen.getByText(/LIVE VOTE · 3 OF 4 VOTED/)).toBeTruthy();
    expect(screen.getByLabelText('Paddington: 2 votes')).toBeTruthy();
    expect(screen.getByLabelText('Board games: 1 votes')).toBeTruthy();
    expect(screen.getByText('this week')).toBeTruthy();
  });

  it('approves a chore photo from the TV with the parent code and celebrates', async () => {
    reducedMotion.mockReturnValue(true);
    familyAgentClient.decideChorePhoto.mockResolvedValue({data: {}});
    const base = createDemoHousehold();
    const household: HouseholdSnapshot = {
      ...base,
      chores: base.chores.map(chore => (chore.id === 'pack-backpack' ? {...chore, verifyWithPhoto: true} : chore)),
      choreVerifications: [{
        id: 'v1', choreId: 'pack-backpack', memberId: 'emma', photoId: 'chk-1', verdict: 'looks_done',
        reason: 'Nice work!', confidence: 0.8, provider: 'demo', status: 'pending', submittedAt: '2026-09-22T20:00:00Z',
      }],
    };
    const props = makeProps(household);
    const screen = themed(<FamilyApprovalsScreen {...props} />);
    expect(screen.getByText('Looks done · advice only')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Approve · 5★'));
    enter(screen, '4826');
    fireEvent.press(screen.getByLabelText('Submit code'));
    await waitFor(() => expect(familyAgentClient.decideChorePhoto).toHaveBeenCalledWith('v1', 'approve', '4826'));
    expect(props.onRefreshData).toHaveBeenCalled();
    expect(screen.getByLabelText('Emma earned 5 stars')).toBeTruthy();
    reducedMotion.mockReturnValue(false);
  });
});
