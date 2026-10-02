import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Copy, useTheme } from './ui';

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const clock = (value: Date) => `${pad(value.getHours())}:${pad(value.getMinutes())}`;
const toDate = (day: string, time = '12:00') => {
  const [y, m, d] = (day || dateKey(new Date())).split('-').map(Number);
  const [h, min] = (time || '12:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0);
};
const dark = (bg: string) => bg === '#1A1714';

/**
 * Web only: a real browser date or time input. Phone browsers open their own date and time wheels
 * for these, so the web app gets the same pickers people know from their phone.
 */
export function WebDateTimeInput({ label, mode, value, onChange }: {
  label: string;
  mode: 'date' | 'time';
  value: Date;
  onChange: (value: Date) => void;
}) {
  const t = useTheme();
  return React.createElement('input', {
    type: mode,
    value: mode === 'date' ? dateKey(value) : clock(value),
    step: mode === 'time' ? 300 : undefined,
    'aria-label': label,
    onChange: (event: { target: { value: string } }) => {
      const text = event.target.value;
      if (mode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text)) onChange(toDate(text, clock(value)));
      if (mode === 'time' && /^([01]\d|2[0-3]):[0-5]\d/.test(text)) onChange(toDate(dateKey(value), text.slice(0, 5)));
    },
    style: {
      minHeight: 44,
      padding: '0 12px',
      borderRadius: 12,
      border: `1px solid ${t.line}`,
      background: t.soft,
      color: t.ink,
      // 16px keeps iPhone Safari from zooming in when the field gets focus.
      font: '600 16px Figtree-600, system-ui, sans-serif',
      colorScheme: dark(t.bg) ? 'dark' : 'light',
    },
  });
}

/** One labelled row with the platform's own date or time control. Values stay as YYYY-MM-DD / HH:MM strings. */
function PickerRow({ label, mode, value, onChange, display }: {
  label: string;
  mode: 'date' | 'time';
  value: Date;
  onChange: (value: Date) => void;
  display: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') {
    return (
      <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Copy size={15} weight={700} color={t.muted}>{label}</Copy>
        <WebDateTimeInput label={label} mode={mode} value={value} onChange={onChange} />
      </View>
    );
  }
  return (
    <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Copy size={15} weight={700} color={t.muted}>{label}</Copy>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={value}
          mode={mode}
          display="compact"
          minuteInterval={5}
          themeVariant={dark(t.bg) ? 'dark' : 'light'}
          accessibilityLabel={label}
          onChange={(_event, next) => next && onChange(next)}
        />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${display}`}
            onPress={() => setOpen(true)}
            style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center', backgroundColor: t.soft }}
          >
            <Copy weight={700}>{display}</Copy>
          </Pressable>
          {open ? (
            <DateTimePicker
              value={value}
              mode={mode}
              onChange={(_event, next) => {
                setOpen(false);
                if (next) onChange(next);
              }}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const date = toDate(value);
  return (
    <PickerRow label={label} mode="date" value={date} onChange={(next) => onChange(dateKey(next))}
      display={date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} />
  );
}

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const date = toDate(dateKey(new Date()), value || '12:00');
  return (
    <PickerRow label={label} mode="time" value={date} onChange={(next) => onChange(clock(next))}
      display={date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} />
  );
}

/** A small full-screen moment of delight when stars are earned. Respects Reduce Motion. */
export function StarCelebration({ message, detail, onDone }: { message: string | null; detail?: string; onDone: () => void }) {
  const t = useTheme();
  const scale = useRef(new Animated.Value(0.6)).current;
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!message) return;
    scale.setValue(reduce ? 1 : 0.6);
    if (!reduce) Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
    AccessibilityInfo.announceForAccessibility?.(message);
    const timer = setTimeout(onDone, 2600);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onDone}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${message}. Close`} onPress={onDone}
        style={{ flex: 1, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ backgroundColor: t.card, borderRadius: 28, paddingVertical: 32, paddingHorizontal: 28, alignItems: 'center', gap: 10, minWidth: 260 }}>
          <Animated.Text style={{ fontSize: 76, transform: [{ scale }] }} accessibilityElementsHidden>⭐</Animated.Text>
          <Copy size={22} weight={800} style={{ textAlign: 'center' }}>{message}</Copy>
          {detail ? <Copy size={14} color={t.muted} style={{ textAlign: 'center' }}>{detail}</Copy> : null}
        </View>
      </Pressable>
    </Modal>
  );
}
