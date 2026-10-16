import { CalendarEvent, HouseholdSnapshot } from './types';

export type ProviderStatus = 'loading' | 'available' | 'cached' | 'empty' | 'unavailable';

export interface ProviderState<T> {
  status: ProviderStatus;
  data?: T;
  message?: string;
  source?: string;
}

export interface EventRange {
  from?: string;
  to?: string;
}

export interface CalendarProvider {
  readonly name: string;
  listEvents(range?: EventRange): Promise<CalendarEvent[]>;
}

export interface WeatherHour {
  /** ISO start of the hour, with the forecast office's UTC offset. */
  startTime: string;
  condition: string;
  temperatureF: number;
  /** Chance of precipitation in percent, when the forecast gives one. */
  precipChance?: number | null;
}

export interface WeatherForecast {
  location: string;
  condition: string;
  temperatureF: number;
  highF: number;
  lowF: number;
  summary: string;
  /** Sunrise-to-sunset flag for the current hour (NWS). */
  isDaytime?: boolean;
  /** The next hours, for "rain from 3 PM" style notes. */
  hourly?: WeatherHour[];
}

export interface WeatherProvider {
  readonly name: string;
  getForecast(location: string, at?: string): Promise<WeatherForecast | undefined>;
}

export function createDemoCalendarProvider(household: HouseholdSnapshot): CalendarProvider {
  const events = household.events.map((event) => ({
    ...event,
    memberIds: [...event.memberIds],
    preparation: event.preparation.map((item) => ({ ...item })),
  }));
  return {
    name: 'Demo calendar',
    async listEvents(range = {}) {
      const from = range.from ? Date.parse(range.from) : undefined;
      const to = range.to ? Date.parse(range.to) : undefined;
      return events
        .filter((event) => {
          const startsAt = Date.parse(event.startAt);
          const endsAt = Date.parse(event.endAt);
          return (from === undefined || endsAt > from) && (to === undefined || startsAt < to);
        })
        .map((event) => ({
          ...event,
          memberIds: [...event.memberIds],
          preparation: event.preparation.map((item) => ({ ...item })),
        }));
    },
  };
}

export function createDemoWeatherProvider(): WeatherProvider {
  return {
    name: 'Demo forecast',
    async getForecast(location) {
      return {
        location,
        condition: 'Sunny',
        temperatureF: 89,
        highF: 94,
        lowF: 68,
        summary: 'Warm and sunny this afternoon.',
      };
    },
  };
}

export async function loadCalendarData(
  provider: CalendarProvider,
  cachedEvents: CalendarEvent[] = [],
): Promise<ProviderState<CalendarEvent[]>> {
  try {
    const data = await provider.listEvents();
    return data.length
      ? { status: 'available', data, source: provider.name }
      : { status: 'empty', data: [], source: provider.name, message: 'No events in this date range.' };
  } catch {
    return cachedEvents.length
      ? {
          status: 'cached',
          data: copyEvents(cachedEvents),
          source: 'Saved schedule',
          message: 'Calendar is unavailable. Showing saved events.',
        }
      : { status: 'unavailable', message: 'Calendar is unavailable. Try again later.' };
  }
}

export async function loadWeatherData(
  provider: WeatherProvider,
  location: string,
  at?: string,
  cachedForecast?: WeatherForecast,
): Promise<ProviderState<WeatherForecast>> {
  try {
    const data = await provider.getForecast(location, at);
    return data
      ? { status: 'available', data, source: provider.name }
      : { status: 'empty', message: 'No forecast is available for this event.', source: provider.name };
  } catch {
    return cachedForecast
      ? {
          status: 'cached',
          data: { ...cachedForecast },
          source: 'Saved forecast',
          message: 'Weather is unavailable. Showing the last saved forecast.',
        }
      : { status: 'unavailable', message: 'Weather is unavailable right now.' };
  }
}

function copyEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.map((event) => ({
    ...event,
    memberIds: [...event.memberIds],
    preparation: event.preparation.map((item) => ({ ...item })),
  }));
}
