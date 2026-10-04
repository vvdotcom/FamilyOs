import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { permissionSettingsName } from './storage';

export type WeatherPlace = {
  latitude: number;
  longitude: number;
  label: string;
  source: 'device' | 'search';
  timezone?: string;
};

/** Two decimals is about 1 km: enough for a forecast, never a street address. */
const round = (value: number) => Math.round(value * 100) / 100;
const phoneTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

async function placeName(latitude: number, longitude: number, fallback: string): Promise<string> {
  if (Platform.OS === 'web') return fallback;
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
    const town = place?.city || place?.subregion || place?.district || place?.name;
    const area = place?.isoCountryCode === 'US' ? place?.region : place?.country;
    return [town, area].filter(Boolean).join(', ').slice(0, 80) || fallback;
  } catch {
    return fallback;
  }
}

/** Ask for approximate location once and turn it into a household weather place. */
export async function detectPlace(): Promise<WeatherPlace> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      Platform.OS === 'web'
        ? `Location access is off. Turn it on for this site in ${permissionSettingsName()} and try again.`
        : `Location access is off. Search for your city or ZIP code instead, or turn it on in ${permissionSettingsName()}.`,
    );
  }
  // Low accuracy is enough for weather and works with iOS "Approximate location".
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
  const latitude = round(position.coords.latitude);
  const longitude = round(position.coords.longitude);
  return { latitude, longitude, label: await placeName(latitude, longitude, 'Current location'), source: 'device', timezone: phoneTimezone() };
}

/** Find a city or ZIP code with the phone's own geocoder. */
export async function searchPlace(query: string): Promise<WeatherPlace> {
  const text = query.trim();
  if (!text) throw new Error('Enter a city or ZIP code.');
  if (Platform.OS === 'web') throw new Error('City search isn’t available in the web app yet. Use “Use my location” instead.');
  let results: Location.LocationGeocodedLocation[] = [];
  try {
    results = await Location.geocodeAsync(text);
  } catch {
    results = [];
  }
  if (!results.length) throw new Error(`We couldn’t find “${text}”. Try a city and state, like “Phoenix, AZ”, or a ZIP code.`);
  const latitude = round(results[0].latitude);
  const longitude = round(results[0].longitude);
  // Parents set this up at home, so the phone's time zone is the household's. Settings shows it.
  return { latitude, longitude, label: await placeName(latitude, longitude, text.slice(0, 80)), source: 'search', timezone: phoneTimezone() };
}
