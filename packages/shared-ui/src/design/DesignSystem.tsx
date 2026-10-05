import React from 'react';
import { Image, Platform, StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import { DefaultFocus, SpatialNavigationFocusableView, SpatialNavigationNode } from 'react-tv-space-navigation';
import { useFamilyTheme } from '../theme';

// These values are measured from the supplied 1920 × 1080 design, not inferred.
export function useDesignPalette(home = false) {
  const { mode } = useFamilyTheme();
  const dark = mode === 'dark';
  return {
    dark,
    background: dark ? '#171A20' : '#F7F5F0',
    card: dark ? '#252A32' : '#FFFFFF',
    ink: dark ? '#F8F5EE' : home ? '#14203A' : '#1F1B16',
    muted: dark ? '#C3C0B8' : home ? '#5B6478' : '#5F574B',
    border: dark ? '#424650' : home ? '#E9EBF0' : '#ECE6DB',
    soft: dark ? '#32363F' : '#F4F0E8',
    selected: dark ? '#E4A32A' : home ? '#14203A' : '#1F1B16',
    onSelected: dark ? '#171A20' : '#FFFFFF',
    focus: '#E08A1E',
    briefing: dark ? '#3D3526' : '#F6EBD3',
    briefingBorder: dark ? '#685530' : '#EADCBC',
    briefingLabel: dark ? '#EDC875' : '#6B5320',
    nextUp: dark ? '#252E3D' : '#EEF2F8',
    nextBorder: dark ? '#424D64' : '#E0E6F0',
    warning: dark ? '#62411D' : '#FCEACF',
    warningInk: dark ? '#FFD699' : '#A84C12',
  };
}

export type DesignPalette = ReturnType<typeof useDesignPalette>;
export type Weight = 400 | 500 | 600 | 700 | 800;

export function designFont(size: number, weight: Weight, heading = false) {
  if (!heading) return `Figtree-${weight}`;
  if (weight === 800) return `Bricolage-800-${[34, 56, 64, 68].includes(size) ? size : 56}`;
  const optical = [34, 38, 40, 44, 96].reduce(
    (best, current) => (Math.abs(current - size) < Math.abs(best - size) ? current : best),
    34,
  );
  return `Bricolage-700-${optical}`;
}

export function DText({
  size = 26,
  weight = 600,
  heading = false,
  color,
  style,
  ...props
}: TextProps & {
  size?: number;
  weight?: Weight;
  heading?: boolean;
  color?: string;
}) {
  const palette = useDesignPalette();
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: designFont(size, weight, heading),
          fontWeight: 'normal',
          fontSize: size,
          lineHeight: heading ? size * 1.05 : size * 1.2,
          includeFontPadding: false,
          color: color ?? palette.ink,
        },
        style,
      ]}
    />
  );
}

const icons = {
  sparkle: require('../assets/design-icons/sparkle.png'),
  menu: require('../assets/design-icons/menu.png'),
  alert: require('../assets/design-icons/alert.png'),
  soccer: require('../assets/design-icons/soccer.png'),
  check: require('../assets/design-icons/check.png'),
  weather: require('../assets/design-icons/weather.png'),
  home: require('../assets/design-icons/home.png'),
  calendar: require('../assets/design-icons/calendar.png'),
  chores: require('../assets/design-icons/chores.png'),
  meals: require('../assets/design-icons/meals.png'),
  lists: require('../assets/design-icons/lists.png'),
  photos: require('../assets/design-icons/photos.png'),
  moon: require('../assets/design-icons/moon.png'),
  left: require('../assets/design-icons/left.png'),
  right: require('../assets/design-icons/right.png'),
  directions: require('../assets/design-icons/directions.png'),
  scroll: require('../assets/design-icons/scroll.png'),
  photo: require('../assets/design-icons/photo.png'),
};
export type IconName = keyof typeof icons;
export function DIcon({ name, size = 28, color = '#1F1B16' }: { name: IconName; size?: number; color?: string }) {
  return (
    <Image
      source={icons[name]}
      accessible={false}
      style={{ width: size, height: size, tintColor: color, flexShrink: 0 }}
    />
  );
}

export function DButton({
  children,
  label,
  onPress,
  style,
  active = true,
  defaultFocus = false,
  selected,
  checked,
  role = 'button',
  radius = 16,
}: {
  children: React.ReactNode;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  active?: boolean;
  defaultFocus?: boolean;
  selected?: boolean;
  checked?: boolean;
  role?: 'button' | 'checkbox' | 'radio' | 'switch';
  radius?: number;
}) {
  const palette = useDesignPalette();
  return (
    <DefaultFocus enable={active && defaultFocus}>
      <SpatialNavigationFocusableView
        onSelect={onPress}
        style={StyleSheet.flatten([{ position: 'relative', borderRadius: radius }, style])}
        viewProps={{
          accessibilityRole: role,
          accessibilityLabel: label,
          accessibilityState: { selected, checked },
          ...(Platform.OS === 'web' ? { 'aria-checked': checked, 'aria-selected': selected } : {}),
          ...(Platform.OS !== 'web' ? { onTouchEnd: onPress } : {}),
        }}>
        {({ isFocused }) => (
          <>
            {children}
            {active && isFocused ? (
              <View
                testID="tv-focus-ring"
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -7,
                  bottom: -7,
                  left: -7,
                  right: -7,
                  borderRadius: radius + 7,
                  borderColor: palette.focus,
                  borderWidth: 4,
                }}
              />
            ) : null}
          </>
        )}
      </SpatialNavigationFocusableView>
    </DefaultFocus>
  );
}

export function DAction({
  label,
  onPress,
  active,
  primary = false,
  size = 26,
  style,
  defaultFocus = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  primary?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  defaultFocus?: boolean;
}) {
  const p = useDesignPalette();
  return (
    <DButton
      label={label}
      onPress={onPress}
      active={active}
      defaultFocus={defaultFocus}
      radius={32}
      style={[
        {
          minHeight: 64,
          paddingHorizontal: 28,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: primary ? p.selected : p.card,
          borderWidth: primary ? 0 : 2,
          borderColor: p.border,
        },
        style,
      ]}>
      <DText size={size} weight={primary ? 800 : 600} color={primary ? p.onSelected : p.ink}>
        {label}
      </DText>
    </DButton>
  );
}

export function DRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <SpatialNavigationNode orientation="horizontal">
      <View style={[{ flexDirection: 'row' }, style]}>{children}</View>
    </SpatialNavigationNode>
  );
}

export function DPanel({
  children,
  style,
  home = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  home?: boolean;
}) {
  const p = useDesignPalette(home);
  return (
    <View
      style={[
        {
          backgroundColor: p.card,
          borderWidth: 2,
          borderColor: p.border,
          borderRadius: home ? 36 : 28,
          padding: 26,
          shadowColor: p.ink,
          shadowOpacity: p.dark ? 0 : 0.06,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const memberColors = {
  alex: { surface: '#DCE7F7', accent: '#2F5FA8', ink: '#1B3F78', avatar: '#9DC3F7', dark: '#283A53' },
  jordan: { surface: '#FBE1CB', accent: '#B45118', ink: '#8B350C', avatar: '#F6B18A', dark: '#50392C' },
  emma: { surface: '#E8DDF7', accent: '#6E46AE', ink: '#522B93', avatar: '#C5ADF3', dark: '#3B2D50' },
  leo: { surface: '#D9EEDA', accent: '#2C7B3B', ink: '#1F5A2A', avatar: '#9EDAA5', dark: '#293E2D' },
  family: { surface: '#F6E7B0', accent: '#8B6A0B', ink: '#5C4500', avatar: '#F6E7B0', dark: '#443D25' },
};
type MemberPalette = (typeof memberColors)[keyof typeof memberColors];
// The phone app's color choices (ui.tsx memberColors), mapped to the TV palette.
const accentPalette: Record<string, MemberPalette> = {
  '#2F5FA8': memberColors.alex,
  '#B4541B': memberColors.jordan,
  '#2E7A3A': memberColors.leo,
  '#6B45A8': memberColors.emma,
  '#8A6A0A': memberColors.family,
};
const orderPalette = [memberColors.alex, memberColors.jordan, memberColors.emma, memberColors.leo];
let householdPalette: Record<string, MemberPalette> = {};
/** Real households use generated member IDs: color each person by their chosen color, or by family order. */
export function registerMemberColors(members: { id: string; accentColor?: string }[]) {
  householdPalette = Object.fromEntries(
    members.map((member, index) => [
      member.id,
      accentPalette[(member.accentColor || '').toUpperCase()] ?? orderPalette[index % orderPalette.length],
    ]),
  );
}
export function memberColor(id: string | undefined, dark = false) {
  const result =
    memberColors[id as keyof typeof memberColors] ?? (id ? householdPalette[id] : undefined) ?? memberColors.family;
  return { ...result, surface: dark ? result.dark : result.surface, ink: dark ? result.avatar : result.ink };
}
export function Avatar({
  id,
  initials,
  size = 44,
  pastel = false,
}: {
  id?: string;
  initials: string;
  size?: number;
  pastel?: boolean;
}) {
  const c = memberColor(id);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: pastel ? c.avatar : c.accent,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
      }}>
      <DText size={size * 0.46} weight={800} color={pastel ? '#14203A' : '#FFFFFF'}>
        {initials}
      </DText>
    </View>
  );
}
export function Check({ done, color = '#1F1B16', size = 36 }: { done: boolean; color?: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: done ? 0 : 3,
        borderColor: done ? color : '#A89E8C',
        backgroundColor: done ? color : '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
      {done ? <DIcon name="check" size={size * 0.56} color="#FFFFFF" /> : null}
    </View>
  );
}
export function DFooter({ action, detail, children }: { action: string; detail?: string; children?: React.ReactNode }) {
  const p = useDesignPalette();
  return (
    <DRow style={{ height: 44, alignItems: 'center', gap: 44 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Keycap>
          <DIcon name="directions" size={24} color={p.ink} />
        </Keycap>
        <DText size={22} color={p.muted}>
          Move around
        </DText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Keycap>
          <DText size={18} weight={800}>
            OK
          </DText>
        </Keycap>
        <DText size={22} color={p.muted}>
          {action}
        </DText>
      </View>
      {children}
      <View style={{ flex: 1 }} />
      {detail ? (
        <DText size={22} color={p.muted}>
          {detail}
        </DText>
      ) : null}
    </DRow>
  );
}
export function Keycap({ children }: { children: React.ReactNode }) {
  const p = useDesignPalette();
  return (
    <View
      style={{
        minWidth: 44,
        height: 44,
        paddingHorizontal: 8,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: p.dark ? p.border : '#C9C0B0',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {children}
    </View>
  );
}
export const headingStyle: TextStyle = { letterSpacing: -1.36 };
/**
 * Intl.DateTimeFormat is slow to construct on Fire TV (Vega): a week of a seeded household (a few hundred
 * events) built thousands per render, which froze the app. Each formatter is built once per locale and options.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
export function dateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter;
}
export function formatDate(date: Date, timezone: string) {
  return dateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone }).format(date);
}
export function formatTime(value: string | Date, timezone: string, meridiem = true) {
  const result = dateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(value));
  return meridiem ? result : result.replace(/\s[AP]M$/, '');
}
/** Day keys are asked for the same timestamps on every render, so they are remembered (bounded). */
const dateKeys = new Map<string, string>();
export function localDateKey(value: string | Date, timezone: string) {
  const cacheKey = `${timezone}|${typeof value === 'string' ? value : value.getTime()}`;
  const cached = dateKeys.get(cacheKey);
  if (cached !== undefined) return cached;
  const result = dateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).format(
    new Date(value),
  );
  if (dateKeys.size > 20_000) dateKeys.clear();
  dateKeys.set(cacheKey, result);
  return result;
}

/** Whether an event belongs on a household-local day. All-day items span every day until their (exclusive) end. */
export function eventOnDay(event: { startAt: string; endAt: string; allDay?: boolean }, dayKey: string, timezone: string) {
  const start = localDateKey(event.startAt, timezone);
  if (!event.allDay) return start === dayKey;
  const end = localDateKey(event.endAt, timezone);
  return start <= dayKey && (dayKey < end || start === end);
}
/** "All day", or the start (and optionally end) time in the household's time zone. */
export function eventTimeLabel(event: { startAt: string; endAt: string; allDay?: boolean }, timezone: string, withEnd = true) {
  if (event.allDay) return 'All day';
  return withEnd ? `${formatTime(event.startAt, timezone)} – ${formatTime(event.endAt, timezone)}` : formatTime(event.startAt, timezone);
}
