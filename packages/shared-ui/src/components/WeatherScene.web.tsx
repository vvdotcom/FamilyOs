import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { familyAgentClient } from '../api/familyAgentClient';
import { SCENE_POSTERS, WeatherSceneProps } from './weatherScenePosters';

/** Browser build: a muted, looping <video> over the bundled poster. */
export default function WeatherScene({ scene, animate = true, dim = 0 }: WeatherSceneProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [scene]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`weather-scene-${scene}`}>
      <Image source={SCENE_POSTERS[scene]} resizeMode="cover" style={styles.fill} />
      {animate && !failed
        ? React.createElement('video', {
            key: scene,
            src: familyAgentClient.sceneUrl(scene),
            autoPlay: true,
            loop: true,
            muted: true,
            playsInline: true,
            'aria-hidden': true,
            onError: () => setFailed(true),
            style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
          })
        : null}
      {dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})` }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { width: '100%', height: '100%' } });
