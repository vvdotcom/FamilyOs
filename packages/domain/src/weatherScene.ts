/**
 * Which wall-calendar landscape to show: the weather kind from the forecast, and the time of day.
 *
 * The scenes are looping videos named `<kind>-<day|night>`, plus `clear-evening` for a clear late
 * afternoon and one clear night per constellation (`clear-night-orion`, ...).
 */

export type WeatherSceneKind = 'clear' | 'rain' | 'heat' | 'snow' | 'blizzard' | 'storm';
export type SceneTime = 'day' | 'evening' | 'night';

export const SCENE_CONSTELLATIONS = ['orion', 'big-dipper', 'cassiopeia', 'cygnus'] as const;

/** Every scene name the wall can ask for. */
export const WEATHER_SCENES = [
  'clear-day',
  'clear-evening',
  ...SCENE_CONSTELLATIONS.map((name) => `clear-night-${name}`),
  ...(['rain', 'heat', 'snow', 'blizzard', 'storm'] as const).flatMap((kind) => [`${kind}-day`, `${kind}-night`]),
] as const;

export type WeatherSceneName = (typeof WEATHER_SCENES)[number];

/** 100°F and up reads as a heat day, whatever the sky looks like. */
export const HEAT_SCENE_F = 100;

/** Map an NWS short forecast ("Chance Showers And Thunderstorms") to a scene kind. */
export function weatherSceneKind(condition: string | undefined, temperatureF?: number): WeatherSceneKind {
  const text = (condition || '').toLowerCase();
  const snowy = /snow|sleet|flurr|wintry|ice pellets|freezing/.test(text);
  if (/blizzard/.test(text) || (snowy && /heavy|blowing|wind/.test(text))) return 'blizzard';
  if (snowy) return 'snow';
  if (/thunder|t-storm|tstorm|tropical|hurricane|storm/.test(text)) return 'storm';
  if (/rain|shower|drizzle/.test(text)) return 'rain';
  if ((temperatureF !== undefined && temperatureF >= HEAT_SCENE_F) || /\bhot\b|heat/.test(text)) return 'heat';
  return 'clear';
}

/**
 * Day, golden evening or night. The forecast's own isDaytime (sunrise to sunset) wins when it is known;
 * otherwise the household clock decides.
 */
export function sceneTimeOfDay(hour: number, isDaytime?: boolean): SceneTime {
  const night = isDaytime === undefined ? hour >= 19.5 || hour < 6 : !isDaytime;
  if (night) return 'night';
  return hour >= 17 ? 'evening' : 'day';
}

export interface WeatherSceneInput {
  condition?: string;
  temperatureF?: number;
  /** Household-local hour, with minutes as a fraction (15.5 is 3:30 PM). */
  hour: number;
  isDaytime?: boolean;
  /** Any number that changes once a day (for example the day of the year): picks tonight's constellation. */
  dayIndex: number;
}

export function weatherSceneName({ condition, temperatureF, hour, isDaytime, dayIndex }: WeatherSceneInput): WeatherSceneName {
  const kind = weatherSceneKind(condition, temperatureF);
  const time = sceneTimeOfDay(hour, isDaytime);
  if (kind === 'clear') {
    if (time === 'night') {
      const index = ((Math.trunc(dayIndex) % SCENE_CONSTELLATIONS.length) + SCENE_CONSTELLATIONS.length) % SCENE_CONSTELLATIONS.length;
      return `clear-night-${SCENE_CONSTELLATIONS[index]}` as WeatherSceneName;
    }
    return time === 'evening' ? 'clear-evening' : 'clear-day';
  }
  return `${kind}-${time === 'night' ? 'night' : 'day'}` as WeatherSceneName;
}
