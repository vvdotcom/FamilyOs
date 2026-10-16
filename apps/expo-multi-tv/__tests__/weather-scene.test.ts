import {
  SCENE_CONSTELLATIONS,
  WEATHER_SCENES,
  sceneTimeOfDay,
  weatherSceneKind,
  weatherSceneName,
} from '@familyos/domain';

describe('wall-calendar weather scenes', () => {
  test.each([
    ['Sunny', 75, 'clear'],
    ['Mostly Cloudy', 61, 'clear'],
    ['Patchy Fog', 50, 'clear'],
    ['Chance Light Rain', 58, 'rain'],
    ['Rain Showers Likely', 55, 'rain'],
    ['Drizzle', 52, 'rain'],
    ['Chance Showers And Thunderstorms', 81, 'storm'],
    ['Tropical Storm Conditions Possible', 84, 'storm'],
    ['Hurricane Warning', 86, 'storm'],
    ['Light Snow Likely', 29, 'snow'],
    ['Rain And Snow', 34, 'snow'],
    ['Freezing Drizzle', 30, 'snow'],
    ['Heavy Snow', 24, 'blizzard'],
    ['Blowing Snow', 18, 'blizzard'],
    ['Blizzard Warning', 14, 'blizzard'],
    ['Sunny', 108, 'heat'],
    ['Hot', 98, 'heat'],
  ])('%s at %i°F is a %s scene', (condition, temperature, kind) => {
    expect(weatherSceneKind(condition, temperature)).toBe(kind);
  });

  test('an unknown or missing forecast falls back to a clear sky', () => {
    expect(weatherSceneKind(undefined)).toBe('clear');
    expect(weatherSceneKind('Forecast available', 70)).toBe('clear');
  });

  test('the forecast decides day and night when it knows, the clock otherwise', () => {
    expect(sceneTimeOfDay(13, true)).toBe('day');
    expect(sceneTimeOfDay(17.5, true)).toBe('evening');
    expect(sceneTimeOfDay(18.5, false)).toBe('night');
    expect(sceneTimeOfDay(10)).toBe('day');
    expect(sceneTimeOfDay(18)).toBe('evening');
    expect(sceneTimeOfDay(21)).toBe('night');
    expect(sceneTimeOfDay(4)).toBe('night');
  });

  test('clear nights rotate through the constellations, one per day', () => {
    const nights = [0, 1, 2, 3, 4].map((dayIndex) => weatherSceneName({ condition: 'Clear', hour: 22, dayIndex }));
    expect(nights).toEqual([
      'clear-night-orion',
      'clear-night-big-dipper',
      'clear-night-cassiopeia',
      'clear-night-cygnus',
      'clear-night-orion',
    ]);
    expect(weatherSceneName({ condition: 'Clear', hour: 22, dayIndex: -1 })).toBe('clear-night-cygnus');
  });

  test('only clear skies get the golden evening; other weather keeps its day scene until dark', () => {
    expect(weatherSceneName({ condition: 'Sunny', hour: 17.5, dayIndex: 0 })).toBe('clear-evening');
    expect(weatherSceneName({ condition: 'Rain', hour: 17.5, dayIndex: 0 })).toBe('rain-day');
    expect(weatherSceneName({ condition: 'Rain', hour: 23, dayIndex: 0 })).toBe('rain-night');
    expect(weatherSceneName({ condition: 'Thunderstorms', hour: 20, isDaytime: false, dayIndex: 0 })).toBe('storm-night');
  });

  test('every name the picker returns is a scene that exists', () => {
    const conditions = ['Sunny', 'Rain', 'Thunderstorms', 'Snow', 'Blizzard', 'Hot'];
    for (const condition of conditions) {
      for (const hour of [3, 9, 13, 17.5, 21]) {
        for (let dayIndex = 0; dayIndex < SCENE_CONSTELLATIONS.length; dayIndex += 1) {
          const name = weatherSceneName({ condition, temperatureF: condition === 'Hot' ? 104 : 70, hour, dayIndex });
          expect(WEATHER_SCENES).toContain(name);
        }
      }
    }
    expect(WEATHER_SCENES).toHaveLength(16);
  });
});
