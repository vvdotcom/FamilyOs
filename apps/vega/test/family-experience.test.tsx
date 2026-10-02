import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {
  createDemoHousehold,
  DEMO_NOW,
  detectConflicts,
  ProviderState,
  WeatherForecast,
} from '@familyos/domain';
import {FamilyThemeProvider} from '../../../packages/shared-ui/src/theme';
import FamilyCalendarScreen from '../../../packages/shared-ui/src/screens/FamilyCalendarScreen';
import FamilyChoresScreen from '../../../packages/shared-ui/src/screens/FamilyChoresScreen';
import FamilyHomeScreen from '../../../packages/shared-ui/src/screens/FamilyHomeScreen';
import FamilySettingsScreen from '../../../packages/shared-ui/src/screens/FamilySettingsScreen';
import FamilyWallScreen from '../../../packages/shared-ui/src/screens/FamilyWallScreen';
import {FamilyScreenProps} from '../../../packages/shared-ui/src/screens/familyTypes';
import {memberColor, registerMemberColors} from '../../../packages/shared-ui/src/design/DesignSystem';
import {voiceTVAction} from '../../../packages/shared-ui/src/navigation/voiceCommands';
import {weatherKind, WeatherIcon} from '../../../packages/shared-ui/src/design/WeatherIcon';

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
      children:
        | React.ReactNode
        | ((state: {isFocused: boolean}) => React.ReactNode);
    }) =>
      ReactModule.createElement(
        ReactNative.Pressable,
        {...viewProps, onPress: onSelect},
        typeof children === 'function'
          ? children({isFocused: false})
          : children,
      ),
    SpatialNavigationScrollView: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
    }) => ReactModule.createElement(ReactNative.ScrollView, props, children),
  };
});

jest.mock('../../../packages/shared-ui/src/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

const household = createDemoHousehold();
const now = new Date(DEMO_NOW);
const calendarState: ProviderState<typeof household.events> = {
  status: 'available',
  data: household.events,
  source: 'Demo calendar',
};
const weatherState: ProviderState<WeatherForecast> = {
  status: 'available',
  data: {
    location: 'Tucson, AZ',
    condition: 'Sunny',
    temperatureF: 89,
    highF: 94,
    lowF: 68,
    summary: 'Warm and sunny this afternoon.',
  },
};

function makeProps(
  overrides: Partial<FamilyScreenProps> = {},
): FamilyScreenProps {
  return {
    household,
    conflicts: detectConflicts(household.members, household.events, {now}),
    now,
    calendarState,
    weatherState,
    focusActive: true,
    onNavigate: jest.fn(),
    onFocusNavigation: jest.fn(),
    onCompleteChore: jest.fn(),
    onToggleRoutineStep: jest.fn(),
    onTogglePreparationItem: jest.fn(),
    onRefreshData: jest.fn(),
    ...overrides,
  };
}

function themed(element: React.ReactElement) {
  return render(<FamilyThemeProvider>{element}</FamilyThemeProvider>);
}

describe('Phase 3 household experience', () => {
  it.each([
    ['Sunny', 'sunny'], ['Clear', 'sunny'], ['Partly cloudy', 'partly-cloudy'],
    ['Overcast', 'cloudy'], ['Rain showers', 'rain'], ['Thunderstorms', 'storm'],
    ['Snow', 'snow'], ['Fog', 'fog'], ['Windy', 'wind'], ['Unavailable', 'unknown'],
  ])('matches the weather icon to %s', (condition, kind) => {
    expect(weatherKind(condition)).toBe(kind);
    const screen = render(<WeatherIcon condition={condition} color="#000" />);
    expect(screen.getByTestId(`weather-icon-${kind}`)).toBeTruthy();
    expect(screen.getByLabelText(`${condition} weather`)).toBeTruthy();
  });
  it('renders the household dashboard with the next event, family status, and responsibilities', () => {
    const screen = themed(<FamilyHomeScreen {...makeProps()} />);
    expect(screen.getByText('Emma pickup')).toBeTruthy();
    expect(screen.getByText('FAMILY')).toBeTruthy();
    expect(screen.getByText('NEXT UP')).toBeTruthy();
    expect(
      screen.getAllByText(/Alex is available to help/).length,
    ).toBeGreaterThan(0);
  });

  it('opens event details with travel, weather, participants, and a working preparation toggle', () => {
    const props = makeProps();
    const screen = themed(<FamilyCalendarScreen {...props} />);
    fireEvent.press(screen.getByLabelText('Open Soccer practice'));

    expect(screen.getByText('Soccer practice')).toBeTruthy();
    expect(screen.getByText('About 20 minutes travel time')).toBeTruthy();
    expect(screen.getByText(/89°F and Sunny near Tucson, AZ/)).toBeTruthy();
    expect(screen.getByText('OWNER')).toBeTruthy();
    expect(screen.getByText('Event owner')).toBeTruthy();
    expect(screen.getByText('PARTICIPANTS')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Water bottle, still needed'));
    expect(props.onTogglePreparationItem).toHaveBeenCalledWith(
      'soccer-emma',
      'water-bottle',
    );
  });

  it('marks a chore complete from the TV-friendly chores board', () => {
    const props = makeProps();
    const screen = themed(<FamilyChoresScreen {...props} />);
    expect(screen.getByText('+2 points · daily')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Complete Put shoes by the door'));
    expect(props.onCompleteChore).toHaveBeenCalledWith('shoes-door', true);
  });

  it('shows a recoverable calendar provider error and offers retry', () => {
    const props = makeProps({
      calendarState: {
        status: 'unavailable',
        message: 'Calendar is unavailable. Try again later.',
      },
    });
    const screen = themed(<FamilyCalendarScreen {...props} />);
    expect(screen.getByText('Calendar unavailable')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry calendar'));
    expect(props.onRefreshData).toHaveBeenCalledTimes(1);
  });
});

describe('Connected calendars on the TV', () => {
  const synced = () => {
    const home = createDemoHousehold();
    home.calendars = [{
      id: 'c1', label: 'Emma school', provider: 'google', host: 'calendar.google.com', memberIds: ['emma'],
      status: 'ok', message: '', lastSyncedAt: '2026-09-22T21:00:00Z', eventCount: 2,
    }];
    const allDay = (id: string, title: string, start: string, end: string) => ({
      id, familyId: home.family.id, title, category: 'school' as const, startAt: `${start}T00:00:00-07:00`,
      endAt: `${end}T00:00:00-07:00`, ownerMemberId: 'emma', memberIds: ['emma'], preparation: [],
      source: 'google' as const, allDay: true, calendarId: 'c1',
    });
    home.events.push(allDay('cal-c1-a', 'Picture day', '2026-09-22', '2026-09-23'));
    home.events.push(allDay('cal-c1-b', 'Fall break', '2026-09-23', '2026-09-26'));
    return home;
  };

  it('lists all-day items on Home without making them next up', () => {
    const home = synced();
    const screen = themed(<FamilyHomeScreen {...makeProps({household: home, conflicts: detectConflicts(home.members, home.events, {now}),
      calendarState: {status: 'available', data: home.events, source: 'Demo calendar'}})} />);
    expect(screen.getByText('Picture day')).toBeTruthy();
    expect(screen.getByText('All day')).toBeTruthy();
    expect(screen.queryByLabelText('Open next event: Picture day')).toBeNull();
  });

  it('keeps all-day items out of the time grid, shows multi-day ones on each day, and says where they came from', () => {
    const home = synced();
    const screen = themed(<FamilyCalendarScreen {...makeProps({household: home,
      calendarState: {status: 'available', data: home.events, source: 'Demo calendar'}})} />);
    expect(screen.queryByLabelText('Open Picture day')).toBeNull();
    expect(screen.getAllByLabelText('Open Picture day, all day')).toHaveLength(1);
    expect(screen.getAllByLabelText('Open Fall break, all day')).toHaveLength(3);
    fireEvent.press(screen.getAllByLabelText('Open Fall break, all day')[0]);
    expect(screen.getByText('All day')).toBeTruthy();
    expect(screen.getByText(/From Google Calendar \(Emma school\)/)).toBeTruthy();
  });

  it('never reports a conflict for an all-day item', () => {
    const home = synced();
    const conflicts = detectConflicts(home.members, home.events, {now});
    expect(conflicts.some(item => item.eventIds.some(id => id.startsWith('cal-c1')))).toBe(false);
  });
});

describe('Wall calendar and TV settings', () => {
  it('shows the day at a glance and leaves on any press', () => {
    const onExit = jest.fn();
    const conflicts = detectConflicts(household.members, household.events, {now});
    const screen = themed(<FamilyWallScreen household={household} now={now} weatherState={weatherState} paired={false}
      onExit={onExit} conflicts={conflicts} />);
    expect(screen.getByTestId('wall-calendar')).toBeTruthy();
    expect(screen.getByText('Needs a driver')).toBeTruthy();
    expect(screen.getByText('TODAY')).toBeTruthy();
    expect(screen.getByTestId('wall-next-up')).toBeTruthy();
    expect(screen.getByText(/H 94° L 68°/)).toBeTruthy();
    expect(screen.getByText('Press any button on the remote to use Hometide')).toBeTruthy();
    fireEvent.press(screen.getByTestId('wall-calendar'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('dims to a quiet clock at night', () => {
    const late = new Date('2026-09-22T23:10:00-07:00');
    const screen = themed(<FamilyWallScreen household={household} now={late} weatherState={weatherState} paired={false} onExit={jest.fn()} />);
    expect(screen.getByTestId('wall-calendar-night')).toBeTruthy();
    expect(screen.queryByText('TODAY')).toBeNull();
  });

  it('asks before unpairing and labels live weather', () => {
    const onUnpairTV = jest.fn();
    const onToggle = jest.fn();
    const props = makeProps({
      tvPairing: {status: 'paired'},
      onUnpairTV,
      weatherState: {...weatherState, source: 'National Weather Service'},
      wallCalendar: {enabled: true, idleMinutes: 2, onToggle, onShowNow: jest.fn()},
    });
    const screen = themed(<FamilySettingsScreen {...props} onResetDemo={jest.fn()} />);
    expect(screen.getByText('Live · Tucson, AZ')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Unpair this TV'));
    expect(onUnpairTV).not.toHaveBeenCalled();
    expect(screen.getByText('Unpair this TV?')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Keep this TV paired'));
    expect(screen.queryByText('Unpair this TV?')).toBeNull();
    fireEvent.press(screen.getByLabelText('Unpair this TV'));
    fireEvent.press(screen.getByLabelText('Unpair'));
    expect(onUnpairTV).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Wall calendar when idle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('Agent status and Back handling', () => {
  it('says "not paired" when the hosted service answers but the TV is not paired yet', () => {
    const unpaired = themed(
      <FamilySettingsScreen {...makeProps({agentStatus: 'unpaired'})} onResetDemo={jest.fn()} />,
    );
    expect(unpaired.getByText('Reachable · not paired')).toBeTruthy();
    expect(unpaired.queryByText('Offline · local demo')).toBeNull();
    const offline = themed(
      <FamilySettingsScreen {...makeProps({agentStatus: 'offline'})} onResetDemo={jest.fn()} />,
    );
    expect(offline.getByText('Offline · local demo')).toBeTruthy();
  });

  it('registers the Back listeners once, however often the shell re-renders', () => {
    const {BackHandler} = require('react-native');
    const remote = {addKeydownListener: jest.fn(), removeKeydownListener: jest.fn()};
    jest.doMock('../../../packages/shared-ui/src/app/remote-control/RemoteControlManager', () => ({
      __esModule: true,
      default: remote,
    }));
    // Required after doMock so the hook picks up the mocked remote (the Kepler manager needs a TV runtime).
    const {useBackToHome} = require('../../../packages/shared-ui/src/hooks/useBackToHome');
    const addSpy = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({remove: jest.fn()});
    const setRoute = jest.fn();
    function Probe({route}: {route: 'Home' | 'Calendar' | 'Chores'}) {
      useBackToHome(route, setRoute, 'content', jest.fn(), () => false);
      return null;
    }
    const probe = render(<Probe route="Home" />);
    for (let i = 0; i < 25; i += 1) {
      probe.rerender(<Probe route={i % 2 ? 'Calendar' : 'Chores'} />);
    }
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(remote.addKeydownListener).toHaveBeenCalledTimes(1);
    // The single handler still sees the latest route: Back from Chores goes Home.
    const handler = addSpy.mock.calls[0][1] as () => boolean;
    handler();
    expect(setRoute).toHaveBeenLastCalledWith('Home');
    probe.unmount();
    addSpy.mockRestore();
  });
});

describe('Member colors for real households', () => {
  it("uses each person's chosen color, or their place in the family, instead of one shared color", () => {
    registerMemberColors([
      {id: 'a1b2', accentColor: '#6B45A8'},
      {id: 'c3d4', accentColor: '#2e7a3a'},
      {id: 'e5f6'},
    ]);
    expect(memberColor('a1b2').accent).toBe(memberColor('emma').accent);
    expect(memberColor('c3d4').accent).toBe(memberColor('leo').accent);
    expect(memberColor('e5f6').accent).toBe(memberColor('emma').accent); // Third in the family, no color chosen.
    expect(memberColor('unknown').accent).toBe(memberColor('family').accent);
    registerMemberColors([]);
  });
});

describe('Voice commands on the TV', () => {
  it('maps a voice request to a screen, the wall calendar, or nothing', () => {
    expect(voiceTVAction({screen: 'Calendar', day: '2026-10-02'})).toEqual({kind: 'route', route: 'Calendar', day: '2026-10-02'});
    expect(voiceTVAction({screen: 'Chores', day: '2026-10-02'})).toEqual({kind: 'route', route: 'Chores', day: null});
    expect(voiceTVAction({screen: 'Wall'})).toEqual({kind: 'wall'});
    expect(voiceTVAction({screen: 'Netflix'})).toEqual({kind: 'ignore'});
    expect(voiceTVAction({screen: 'Calendar', day: 'tomorrow'})).toEqual({kind: 'route', route: 'Calendar', day: null});
  });

  it('opens the calendar day view on the day voice asked for', () => {
    const screen = themed(<FamilyCalendarScreen {...makeProps({initialDay: '2026-09-25'})} />);
    expect(screen.getByText('September 25')).toBeTruthy();
  });
});
