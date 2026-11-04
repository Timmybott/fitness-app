import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { Children, isValidElement, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { type SFSymbol } from 'sf-symbols-typescript';

import { AppText } from '@/components/app-text';
import { Colors, Radius, Spacing } from '@/constants/theme';

/** Inset grouped list (like iOS Settings). Children are separated by hairlines. */
export function List({ children }: PropsWithChildren) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.list}>
      {items.map((child, i) => (
        <View key={child.key ?? i}>
          {i > 0 && <View style={styles.separator} />}
          {child}
        </View>
      ))}
    </View>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: SFSymbol;
  iconColor?: string;
  destructive?: boolean;
  chevron?: boolean;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function Row({ title, subtitle, value, icon, iconColor, destructive, chevron, right, onPress, onLongPress }: RowProps) {
  return (
    <Pressable
      onPress={
        onPress &&
        (() => {
          Haptics.selectionAsync();
          onPress();
        })
      }
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {icon && (
        <View style={[styles.icon, { backgroundColor: iconColor ?? Colors.accent }]}>
          <SymbolView name={icon} size={15} tintColor={Colors.onAccent} weight="semibold" />
        </View>
      )}
      <View style={styles.flex}>
        <AppText color={destructive ? Colors.danger : Colors.text} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle && (
          <AppText type="caption" color={Colors.textSecondary} numberOfLines={1}>
            {subtitle}
          </AppText>
        )}
      </View>
      {value && <AppText color={Colors.textSecondary}>{value}</AppText>}
      {right}
      {chevron && <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={Colors.textTertiary} />}
    </Pressable>
  );
}

export function PrimaryButton({ title, onPress, disabled, loading }: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.primary, (pressed || disabled || loading) && styles.dim]}>
      <AppText type="headline" color={Colors.onAccent}>
        {loading ? '…' : title}
      </AppText>
    </Pressable>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Pressable onPress={onRetry} style={styles.error}>
      <SymbolView name="wifi.exclamationmark" size={18} tintColor={Colors.danger} />
      <View style={styles.flex}>
        <AppText type="caption">{message}</AppText>
        {onRetry && (
          <AppText type="caption" color={Colors.textSecondary}>
            Tippen zum erneut Versuchen
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

export function EmptyState({ icon, title, text }: { icon: SFSymbol; title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <SymbolView name={icon} size={36} tintColor={Colors.textTertiary} />
      <AppText type="headline">{title}</AppText>
      <AppText color={Colors.textSecondary} style={styles.center}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pressed: { backgroundColor: Colors.cardElevated },
  dim: { opacity: 0.5 },
  list: { backgroundColor: Colors.card, borderRadius: Radius.large, borderCurve: 'continuous', overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.separator, marginLeft: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 12, minHeight: 50 },
  icon: { width: 30, height: 30, borderRadius: 8, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: Colors.accent, borderRadius: Radius.medium, borderCurve: 'continuous', paddingVertical: Spacing.three, alignItems: 'center' },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: '#2A1414',
  },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five, paddingHorizontal: Spacing.four },
});
