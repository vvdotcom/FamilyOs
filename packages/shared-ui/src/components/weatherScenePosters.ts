import type { WeatherSceneName } from '@familyos/domain';

export interface WeatherSceneProps {
  scene: WeatherSceneName;
  /** Play the looping video (off when the viewer asked for reduced motion: the still poster stays). */
  animate?: boolean;
  /** 0–1 black veil over the scene, for the quiet night clock. */
  dim?: number;
}

/**
 * First frame of each loop, bundled with the app: shown instantly, offline, with reduced motion, and
 * underneath the video until it starts playing. The loops themselves stream from the Hometide API.
 */
export const SCENE_POSTERS: Record<WeatherSceneName, number> = {
  'clear-day': require('../assets/scenes/clear-day.jpg'),
  'clear-evening': require('../assets/scenes/clear-evening.jpg'),
  'clear-night-orion': require('../assets/scenes/clear-night-orion.jpg'),
  'clear-night-big-dipper': require('../assets/scenes/clear-night-big-dipper.jpg'),
  'clear-night-cassiopeia': require('../assets/scenes/clear-night-cassiopeia.jpg'),
  'clear-night-cygnus': require('../assets/scenes/clear-night-cygnus.jpg'),
  'rain-day': require('../assets/scenes/rain-day.jpg'),
  'rain-night': require('../assets/scenes/rain-night.jpg'),
  'heat-day': require('../assets/scenes/heat-day.jpg'),
  'heat-night': require('../assets/scenes/heat-night.jpg'),
  'snow-day': require('../assets/scenes/snow-day.jpg'),
  'snow-night': require('../assets/scenes/snow-night.jpg'),
  'blizzard-day': require('../assets/scenes/blizzard-day.jpg'),
  'blizzard-night': require('../assets/scenes/blizzard-night.jpg'),
  'storm-day': require('../assets/scenes/storm-day.jpg'),
  'storm-night': require('../assets/scenes/storm-night.jpg'),
};
