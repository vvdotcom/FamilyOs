import React from 'react';
import { View, Text } from 'react-native';

export function weatherKind(condition: string) {
  const value = condition.toLowerCase();
  if (/thunder|storm/.test(value)) return 'storm';
  if (/snow|sleet|ice|flurr/.test(value)) return 'snow';
  if (/rain|drizzle|shower/.test(value)) return 'rain';
  if (/partly|mostly sunny/.test(value)) return 'partly-cloudy';
  if (/cloud|overcast/.test(value)) return 'cloudy';
  if (/fog|mist|haze/.test(value)) return 'fog';
  if (/wind|breez/.test(value)) return 'wind';
  if (/sun|clear/.test(value)) return 'sunny';
  return 'unknown';
}

const symbols = {
  sunny: '☀',
  'partly-cloudy': '⛅',
  cloudy: '☁',
  rain: '☂',
  storm: 'ϟ',
  snow: '❄',
  fog: '≋',
  wind: '≈',
  unknown: '?',
};

/** Uses the provider condition, never a fixed sunny/rainy placeholder. */
export function WeatherIcon({ condition, size = 28, color }: { condition: string; size?: number; color: string }) {
  const kind = weatherKind(condition);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${condition} weather`}
      testID={`weather-icon-${kind}`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Text accessible={false} style={{ fontSize: size * 0.85, lineHeight: size, color }}>
        {symbols[kind]}
      </Text>
    </View>
  );
}
