import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Copy, Icon, useTheme } from './ui';
import type { HouseholdAPI } from './household';
import { listen, primeSpeech, speak, speechSupported, stopSpeaking, type Listener } from './voiceInput';

// "Ask Hometide": hold the round mic in the tab bar, speak, release. The words go to the same voice assistant
// the Hometide Alexa skill uses (POST /v1/voice/simulate), so changes still arrive as requests a parent confirms.

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'reply' | 'error' | 'typing';
type Reply = { reply: string; proposalIds: string[] };

// The blue of the voice button on the Fire TV remote, so the phone mic reads as "talk to Hometide".
const MIC_BLUE = '#1E9BD7';
const MIC_SIZE = 60;
/** How far the mic rises above the tab bar's top edge. */
export const MIC_RAISE = 20;
const SAMPLES = ['What’s on today?', 'What chores are left?', 'Any conflicts this week?'];
const useNative = Platform.OS !== 'web';
// Long-pressing on a phone browser would otherwise select text or open the share callout.
const noSelect = Platform.OS === 'web'
  ? ({ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' } as any)
  : null;

export function useVoiceCommand({ api, preview, onAnswered }: {
  api: HouseholdAPI;
  preview: boolean;
  onAnswered: (proposed: boolean) => void;
}) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [message, setMessage] = useState('');
  const listener = useRef<Listener | null>(null);
  const pressedAt = useRef(0);
  const turn = useRef(0);
  const canListen = speechSupported();

  const ask = useCallback(async (utterance: string) => {
    const text = utterance.trim();
    if (!text) return;
    const mine = ++turn.current;
    setHeard(text);
    setReply(null);
    setPhase('thinking');
    try {
      const answer = api.simulateVoice
        ? await api.simulateVoice(text)
        : preview
          ? { reply: 'In the live app, Hometide answers here. Any change waits for a parent to confirm.', proposalIds: [] }
          : null;
      if (mine !== turn.current) return;
      if (!answer) throw new Error('Voice is available once you’re signed in.');
      setReply({ reply: answer.reply, proposalIds: answer.proposalIds || [] });
      setPhase('reply');
      speak(answer.reply);
      onAnswered((answer.proposalIds || []).length > 0);
    } catch (error) {
      if (mine !== turn.current) return;
      setMessage(error instanceof Error ? error.message : 'Hometide couldn’t answer that. Try again.');
      setPhase('error');
    }
  }, [api, preview, onAnswered]);

  const pressIn = useCallback(() => {
    pressedAt.current = Date.now();
    stopSpeaking();
    primeSpeech();
    if (!canListen) {
      // No speech recognition here (Expo Go, some browsers): open the type box right away, where the
      // keyboard's own mic does the dictation.
      setPhase((current) => (current === 'typing' ? 'idle' : 'typing'));
      return;
    }
    listener.current?.cancel();
    turn.current += 1;
    setHeard('');
    setReply(null);
    setMessage('');
    setPhase('listening');
    listener.current = listen({
      onText: setHeard,
      onDone: (text) => {
        listener.current = null;
        if (text.trim()) void ask(text);
        else if (Date.now() - pressedAt.current < 600) setPhase('typing'); // A tap, not a hold: offer typing.
        else {
          setMessage('I didn’t catch that. Hold the mic while you talk, then let go.');
          setPhase('error');
        }
      },
      onError: (text) => {
        listener.current = null;
        setMessage(text);
        setPhase('error');
      },
    });
    if (!listener.current) setPhase('typing');
  }, [ask, canListen]);

  const pressOut = useCallback(() => {
    if (!canListen) return;
    listener.current?.finish();
  }, [canListen]);

  const close = useCallback(() => {
    turn.current += 1;
    listener.current?.cancel();
    listener.current = null;
    stopSpeaking();
    setPhase('idle');
  }, []);

  useEffect(() => () => {
    listener.current?.cancel();
    stopSpeaking();
  }, []);

  return { phase, heard, reply, message, canListen, ask, pressIn, pressOut, close, type: () => setPhase('typing') };
}

export type VoiceCommand = ReturnType<typeof useVoiceCommand>;

/** The round mic in the tab bar. */
export function MicButton({ voice }: { voice: VoiceCommand }) {
  const t = useTheme();
  const listening = voice.phase === 'listening';
  const thinking = voice.phase === 'thinking';
  const pulse = useRef(new Animated.Value(0)).current;
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(grow, { toValue: listening ? 1 : 0, useNativeDriver: useNative, friction: 6 }).start();
    if (!listening) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: useNative }),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse, grow]);
  const ring = (delay: number) => {
    const value = Animated.modulo(Animated.add(pulse, new Animated.Value(delay)), 1);
    return {
      position: 'absolute' as const, top: 0, left: 0, width: MIC_SIZE, height: MIC_SIZE, borderRadius: MIC_SIZE / 2, backgroundColor: MIC_BLUE,
      opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] }),
      transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] }) }],
    };
  };
  return (
    // The mic floats half above the tab bar, centred, like a raised action button.
    <View style={{ flex: 1, minWidth: 0, minHeight: 58, alignItems: 'center', justifyContent: 'flex-start' }}>
      <View style={{ width: MIC_SIZE, height: MIC_SIZE, marginTop: -MIC_RAISE - 8, alignItems: 'center', justifyContent: 'center' }}>
        {listening ? (
          <>
            <Animated.View pointerEvents="none" style={ring(0)} />
            <Animated.View pointerEvents="none" style={ring(0.5)} />
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={voice.canListen ? 'Ask Hometide. Hold to talk.' : 'Ask Hometide'}
          accessibilityHint={voice.canListen ? 'Hold, speak, then let go. Tap to type instead.' : 'Opens a box to type or dictate a request.'}
          accessibilityState={{ busy: thinking }}
          onPressIn={voice.pressIn}
          onPressOut={voice.pressOut}
          delayLongPress={10000}
          hitSlop={8}
          style={noSelect}
        >
          {({ pressed }) => (
            <Animated.View
              style={{
                width: MIC_SIZE, height: MIC_SIZE, borderRadius: MIC_SIZE / 2, alignItems: 'center', justifyContent: 'center',
                backgroundColor: MIC_BLUE, borderWidth: 5, borderColor: t.nav,
                shadowColor: MIC_BLUE, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
                opacity: pressed && !listening ? 0.85 : 1,
                transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
              }}
            >
              {thinking ? <ActivityIndicator color="#FFFFFF" /> : <Icon name="mic" size={26} color="#FFFFFF" />}
            </Animated.View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Bars() {
  const t = useTheme();
  const values = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 110),
          Animated.timing(value, { toValue: 1, duration: 340, easing: Easing.inOut(Easing.quad), useNativeDriver: useNative }),
          Animated.timing(value, { toValue: 0, duration: 340, easing: Easing.inOut(Easing.quad), useNativeDriver: useNative }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 28 }} aria-hidden>
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={{
            width: 4, height: 28, borderRadius: 2, backgroundColor: MIC_BLUE,
            transform: [{ scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }],
          }}
        />
      ))}
    </View>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.soft, opacity: pressed ? 0.7 : 1 })}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth={2.4} strokeLinecap="round" aria-hidden>
        <Path d="M6 6l12 12M18 6L6 18" />
      </Svg>
    </Pressable>
  );
}

function TypeBox({ voice }: { voice: VoiceCommand }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const send = () => {
    if (!text.trim()) return;
    void voice.ask(text);
    setText('');
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          returnKeyType="send"
          maxLength={400}
          placeholder="Ask or suggest a change"
          placeholderTextColor={t.muted}
          accessibilityLabel="Ask Hometide"
          style={{
            flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1.5,
            borderColor: t.fieldBorder, backgroundColor: t.bg, color: t.ink, fontFamily: 'Figtree-600', fontSize: 16,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!text.trim()}
          onPress={send}
          style={({ pressed }) => ({
            width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
            backgroundColor: t.primary, opacity: !text.trim() ? 0.35 : pressed ? 0.75 : 1,
          })}
        >
          <Icon name="up" size={22} color={t.primaryInk} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {SAMPLES.map((sample) => (
          <Pressable
            key={sample}
            accessibilityRole="button"
            onPress={() => void voice.ask(sample)}
            style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: t.soft, opacity: pressed ? 0.7 : 1 })}
          >
            <Copy size={13} weight={700}>{sample}</Copy>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** The card that rises above the tab bar while listening, thinking and answering. */
export function VoicePanel({ voice, onReview, bottom }: { voice: VoiceCommand; onReview: () => void; bottom: number }) {
  const t = useTheme();
  const rise = useRef(new Animated.Value(0)).current;
  const open = voice.phase !== 'idle';
  useEffect(() => {
    Animated.timing(rise, { toValue: open ? 1 : 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: useNative }).start();
  }, [open, rise]);
  if (!open) return null;
  const { phase, heard, reply, message } = voice;
  const title = phase === 'listening' ? 'Listening' : phase === 'typing' ? 'Ask Hometide' : 'Hometide';
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      aria-live="polite"
      style={{
        position: 'absolute', left: 12, right: 12, bottom, zIndex: 3,
        opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}
    >
      <View
        style={{
          padding: 18, gap: 14, borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.card,
          shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {phase === 'listening' ? <Bars /> : (
            <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.soft }}>
              <Icon name={phase === 'typing' ? 'mic' : 'sparkle'} size={16} />
            </View>
          )}
          <Copy size={13} weight={800} color={t.muted} style={{ flex: 1, letterSpacing: 1.04 }}>{title.toUpperCase()}</Copy>
          {phase !== 'listening' ? <CloseButton onPress={voice.close} /> : null}
        </View>

        {phase === 'listening' ? (
          <View style={{ gap: 6 }}>
            <Copy size={20} weight={700} color={heard ? t.ink : t.muted}>{heard || 'Go ahead, I’m listening…'}</Copy>
            <Copy size={13} color={t.muted}>Let go to send</Copy>
          </View>
        ) : null}

        {phase === 'thinking' || phase === 'reply' ? (
          <View style={{ gap: 12 }}>
            <View style={{ alignSelf: 'flex-end', maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: t.soft }}>
              <Copy size={15} weight={700}>{heard}</Copy>
            </View>
            {phase === 'thinking' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color={t.muted} />
                <Copy size={15} color={t.muted}>Hometide is on it…</Copy>
              </View>
            ) : (
              <Copy size={18} weight={600}>{reply?.reply}</Copy>
            )}
          </View>
        ) : null}

        {phase === 'reply' && reply && reply.proposalIds.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              voice.close();
              onReview();
            }}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14,
              backgroundColor: t.okBg, opacity: pressed ? 0.8 : 1,
            })}
          >
            <Icon name="check" size={20} color={t.ok} />
            <Copy size={14} weight={700} color={t.ok} style={{ flex: 1 }}>Waiting for a parent to confirm, on the TV or here</Copy>
            <Copy size={14} weight={800} color={t.ok}>Review</Copy>
          </Pressable>
        ) : null}

        {phase === 'reply' ? (
          <Copy size={12} color={t.muted}>{voice.canListen ? 'Hold the mic to ask something else.' : 'Tap the mic to ask something else.'}</Copy>
        ) : null}

        {phase === 'error' ? (
          <View style={{ gap: 12 }}>
            <Copy size={16} color={t.danger}>{message}</Copy>
            <Pressable
              accessibilityRole="button"
              onPress={voice.type}
              style={({ pressed }) => ({ alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: t.soft, opacity: pressed ? 0.7 : 1 })}
            >
              <Copy size={14} weight={700}>Type instead</Copy>
            </Pressable>
          </View>
        ) : null}

        {phase === 'typing' ? (
          <>
            <Copy size={13} color={t.muted}>
              {voice.canListen ? 'Tip: hold the blue mic and talk, or type here.' : 'Tap the mic on your keyboard to talk, or type.'}
            </Copy>
            <TypeBox voice={voice} />
          </>
        ) : null}
      </View>
    </Animated.View>
  );
}
