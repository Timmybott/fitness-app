import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

export type AppTextProps = TextProps & {
  type?: 'largeTitle' | 'title' | 'headline' | 'body' | 'caption' | 'number';
  color?: string;
};

export function AppText({ style, type = 'body', color = Colors.text, ...rest }: AppTextProps) {
  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: 800, letterSpacing: -0.5 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: 700 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: 600 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: 400 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: 500 },
  number: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: 800,
    fontFamily: Fonts.rounded,
    fontVariant: ['tabular-nums'],
  },
});
