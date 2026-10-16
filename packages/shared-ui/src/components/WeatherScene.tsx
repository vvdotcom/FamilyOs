import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { SCENE_POSTERS, WeatherSceneProps } from './weatherScenePosters';

/**
 * The wall calendar's weather landscape. This build (Fire OS / Android TV, and tests) shows the still
 * poster; the Vega build (WeatherScene.vega.tsx) and the browser build (WeatherScene.web.tsx) play the loop.
 */
export default function WeatherScene({ scene, dim = 0 }: WeatherSceneProps) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`weather-scene-${scene}`}>
      <Image source={SCENE_POSTERS[scene]} resizeMode="cover" style={styles.fill} />
      {dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})` }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { width: '100%', height: '100%' } });
