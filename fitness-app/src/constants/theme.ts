/**
 * App-wide design tokens. The app is dark-only (sporty look), see `userInterfaceStyle` in app.json.
 */

import { Platform } from 'react-native';

export const Colors = {
  background: '#000000',
  card: '#141518',
  cardElevated: '#1E1F24',
  separator: '#2A2B31',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  textTertiary: '#5A5A60',
  accent: '#C6FF3D',
  accentDim: '#3A4A12',
  onAccent: '#0B0F00',
  kcal: '#C6FF3D',
  protein: '#FF6B4A',
  carbs: '#3DA9FF',
  fat: '#FFC23D',
  danger: '#FF453A',
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    rounded: 'normal',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 10,
  medium: 16,
  large: 24,
} as const;

/** Extra bottom padding so content can scroll clear of the floating tab bar. */
export const BottomTabInset = Platform.select({ ios: 90, android: 80 }) ?? 0;
