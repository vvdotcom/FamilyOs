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
import {FamilyScreenProps} from '../../../packages/shared-ui/src/screens/familyTypes';
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
