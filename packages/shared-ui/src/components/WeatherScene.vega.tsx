import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';
import { KeplerVideoSurfaceView, VideoPlayer } from '@amazon-devices/react-native-w3cmedia';
import { familyAgentClient } from '../api/familyAgentClient';
import { SCENE_POSTERS, WeatherSceneProps } from './weatherScenePosters';

/**
 * Vega build: the loop plays through Vega's own media pipeline (W3C Media VideoPlayer on a
 * KeplerVideoSurfaceView, the same pattern as Amazon's Vega video sample), so the Stick decodes it in
 * hardware. The bundled poster sits on top until the first frame plays, and stays if playback fails.
 *
 * Vega ends an app that keeps a media player while it is in the background (crash reason ReclaimMediaResource),
 * which happens when the Fire TV screensaver starts on top of the wall. So the player is paused the moment the app
 * leaves the foreground and released straight after, and a new one starts when Hometide is back.
 */
export default function WeatherScene({ scene, animate = true, dim = 0 }: WeatherSceneProps) {
  const player = useRef<VideoPlayer | null>(null);
  const initialized = useRef(false);
  const surface = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const url = familyAgentClient.sceneUrl(scene);

  useEffect(() => {
    let subscription: { remove: () => void } | undefined;
    try {
      subscription = AppState.addEventListener('change', (state) => {
        const away = state === 'background' || state === 'inactive';
        if (away) {
          try {
            player.current?.pause(); // at once; the player itself is released when the effect below cleans up
          } catch {
            // Released below either way.
          }
        }
        setForeground(!away);
      });
    } catch {
      // No app-state events on this platform: the player follows the wall's own lifetime.
    }
    return () => subscription?.remove();
  }, []);

  const start = useCallback(() => {
    const video = player.current;
    if (!video || !initialized.current || !surface.current) return;
    video.setSurfaceHandle(surface.current);
    video.play().catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (!animate || !foreground) return undefined;
    let active = true;
    const video = new VideoPlayer();
    player.current = video;
    initialized.current = false;
    setPlaying(false);
    setFailed(false);
    const onPlaying = () => active && setPlaying(true);
    const onError = () => active && setFailed(true);
    video
      .initialize()
      .then(() => {
        if (!active) return;
        initialized.current = true;
        video.addEventListener('playing', onPlaying);
        video.addEventListener('error', onError);
        video.muted = true;
        video.loop = true;
        video.autoplay = false;
        video.src = url;
        video.load();
        start();
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      try {
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onError);
        if (initialized.current) {
          video.pause();
          if (surface.current) video.clearSurfaceHandle(surface.current);
        }
      } catch {
        // The player is going away either way.
      }
      initialized.current = false;
      if (player.current === video) player.current = null;
      video.deinitialize().catch(() => undefined);
    };
  }, [url, animate, foreground, start]);

  const onSurfaceViewCreated = useCallback((handle: string) => {
    surface.current = handle;
    start();
  }, [start]);
  const onSurfaceViewDestroyed = useCallback((handle: string) => {
    if (initialized.current) player.current?.clearSurfaceHandle(handle);
    surface.current = null;
    setPlaying(false);
  }, []);

  const video = animate && foreground && !failed;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`weather-scene-${scene}`}>
      {video ? (
        <KeplerVideoSurfaceView
          style={StyleSheet.absoluteFill}
          scalingmode="fill"
          onSurfaceViewCreated={onSurfaceViewCreated}
          onSurfaceViewDestroyed={onSurfaceViewDestroyed}
        />
      ) : null}
      {!video || !playing ? <Image source={SCENE_POSTERS[scene]} resizeMode="cover" style={styles.fill} /> : null}
      {dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})` }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' } });
