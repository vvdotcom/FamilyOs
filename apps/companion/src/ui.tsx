import React, { createContext, useContext } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

// Measured from the user's Claude Phone artboards (390 × 844). Their styling takes
// precedence over generic UI conventions, including rounded cards and uppercase labels.
export const themes = {
  light: {
    bg: '#F7F5F0',
    card: '#FFFFFF',
    ink: '#1F1B16',
    muted: '#5F574B',
    line: '#ECE6DB',
    soft: '#F1EDE5',
    primary: '#1F1B16',
    primaryInk: '#FFFFFF',
    fieldBorder: '#D6CCBB',
    checkBorder: '#A89D8B',
    ok: '#2E7A3A',
    okBg: '#DDF0DF',
    danger: '#A83E2A',
  },
  dark: {
    bg: '#1A1714',
    card: '#221E19',
    ink: '#F4EEE4',
    muted: '#B8AE9F',
    line: '#332C25',
    soft: '#2E2822',
    primary: '#F4EEE4',
    primaryInk: '#1A1714',
    fieldBorder: '#4A433A',
    checkBorder: '#8A7F70',
    ok: '#7CC98A',
    okBg: '#1F3F27',
    danger: '#F08B75',
  },
};
export const ThemeContext = createContext(themes.light);
export const useTheme = () => useContext(ThemeContext);
export const memberColors = ['#2F5FA8', '#B4541B', '#2E7A3A', '#6B45A8', '#8A6A0A'];
const fills = [
  ['#DCE7F7', '#1B3F78', '#243A5E', '#DCE8FB'],
  ['#FBE1CC', '#7A3510', '#4A2C18', '#FCDCC4'],
  ['#D9EEDA', '#1F5A2A', '#1F3F27', '#D3F0D5'],
  ['#E9DFF7', '#4A2A80', '#372A55', '#E7DCFA'],
  ['#F6E7B0', '#5C4500', '#463A10', '#F6E7B0'],
];
export function memberTint(index: number, dark: boolean) {
  const c = fills[((index % 5) + 5) % 5];
  return { backgroundColor: c[dark ? 2 : 0], color: c[dark ? 3 : 1] };
}
export type IconName =
  | 'calendar'
  | 'lists'
  | 'remote'
  | 'settings'
  | 'tv'
  | 'plus'
  | 'right'
  | 'left'
  | 'up'
  | 'down'
  | 'check'
  | 'chores'
  | 'meals'
  | 'photos'
  | 'back'
  | 'home'
  | 'mic'
  | 'more'
  | 'moon'
  | 'edit'
  | 'trash'
  | 'share'
  | 'people'
  | 'refresh';
const paths: Partial<Record<IconName, string>> = {
  plus: 'M12 5v14M5 12h14',
  right: 'M9 6l6 6-6 6',
  left: 'M15 6l-6 6 6 6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  check: 'M5 12l4 4 10-10',
  lists: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8',
  tv: 'M8 21h8',
  calendar: 'M3 10h18M8 3v4M16 3v4',
  chores: 'M8 12l3 3 5-6',
  meals: 'M6 3v7a2 2 0 004 0V3M8 12v9M17 3c-2 1.5-3 4-3 7h3v11',
  photos: 'M21 16l-5-5-9 9',
  back: 'M9 14l-5-5 5-5M4 9h11a5 5 0 010 10h-3',
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  mic: 'M5 11a7 7 0 0014 0M12 18v3',
  more: 'M4 6h16M4 12h16M4 18h16',
  moon: 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z',
  edit: 'M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  share: 'M12 3v13M7 8l5-5 5 5M5 13v7h14v-7',
  people: 'M2.5 20a6.5 6.5 0 0113 0M16 14.5a5 5 0 015.5 5.5',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0112-1l2 6M4 12l2 6a7 7 0 0012-1',
};
export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || t.ink}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name] && <Path d={paths[name]} />}
      {name === 'calendar' && <Rect x={3} y={5} width={18} height={16} rx={3} />}
      {name === 'tv' && <Rect x={2} y={4} width={20} height={13} rx={2} />}
      {name === 'chores' && <Rect x={3} y={3} width={18} height={18} rx={4} />}
      {name === 'remote' && (
        <>
          <Rect x={7} y={2} width={10} height={20} rx={5} />
          <Circle cx={12} cy={8} r={2} />
          <Path d="M12 14v.01M12 17v.01" />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle cx={16} cy={7} r={2} />
          <Circle cx={10} cy={17} r={2} />
        </>
      )}
      {name === 'photos' && (
        <>
          <Rect x={3} y={4} width={18} height={16} rx={3} />
          <Circle cx={9} cy={10} r={2} />
        </>
      )}
      {name === 'mic' && <Rect x={9} y={3} width={6} height={11} rx={3} />}
      {name === 'people' && (
        <>
          <Circle cx={9} cy={8} r={3.5} />
          <Circle cx={17} cy={9} r={2.5} />
        </>
      )}
    </Svg>
  );
}
export function Copy({
  children,
  size = 16,
  weight = 600,
  color,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  weight?: 400 | 500 | 600 | 700 | 800;
  color?: string;
  style?: any;
}) {
  const t = useTheme();
  return (
    <Text
      style={[
        { fontFamily: `Figtree-${weight}`, fontSize: size, color: color || t.ink, lineHeight: size * 1.35 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Copy size={13} weight={800} color={t.muted} style={{ letterSpacing: 1.04 }}>
      {children}
    </Copy>
  );
}
export function Heading({ children, small = false }: { children: React.ReactNode; small?: boolean }) {
  const t = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontFamily: small ? 'Bricolage-700-34' : 'Bricolage-800-34',
        fontSize: small ? 32 : 36,
        lineHeight: small ? 35.2 : 37.8,
        letterSpacing: -0.72,
        color: t.ink,
      }}
    >
      {children}
    </Text>
  );
}
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        { borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, overflow: 'hidden' },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  children,
  onPress,
  primary = false,
  disabled = false,
  icon,
  label,
  style,
  textSize = 15,
}: {
  children?: React.ReactNode;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  icon?: IconName;
  label?: string;
  style?: StyleProp<ViewStyle>;
  textSize?: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 44,
          paddingHorizontal: 14,
          borderRadius: 12,
          backgroundColor: primary ? t.primary : t.soft,
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={20} color={primary ? t.primaryInk : t.ink} />}
      {children && (
        <Copy size={textSize} weight={700} color={primary ? t.primaryInk : t.ink}>
          {children}
        </Copy>
      )}
    </Pressable>
  );
}
export function Input({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Label>{label.toUpperCase()}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        {...props}
        style={[
          {
            minHeight: 52,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: t.fieldBorder,
            backgroundColor: t.card,
            color: t.ink,
            fontFamily: 'Figtree-600',
            fontSize: 18,
          },
          props.style,
        ]}
      />
    </View>
  );
}
export const layout = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stack: { gap: 16 },
  grow: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 16 },
  divider: { height: 1 },
  section: { gap: 8 },
});
