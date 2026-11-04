import { type PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/app-text';
import { Colors, Spacing } from '@/constants/theme';

/**
 * Scroll container for screens under a native header. `automatic` insets let the
 * large title collapse on scroll and keep content clear of the tab bar.
 */
export function Screen({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return (
    <ScrollView
      style={styles.scroll}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerStyle={[styles.content, style]}>
      {children}
    </ScrollView>
  );
}

/** iOS-style grouped section with an uppercase caption above and optional footnote below. */
export function Section({ title, footer, children }: PropsWithChildren<{ title?: string; footer?: string }>) {
  return (
    <View style={styles.section}>
      {title && (
        <AppText type="caption" color={Colors.textSecondary} style={styles.sectionTitle}>
          {title.toUpperCase()}
        </AppText>
      )}
      {children}
      {footer && (
        <AppText type="caption" color={Colors.textSecondary} style={styles.sectionTitle}>
          {footer}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.four },
  section: { gap: Spacing.two },
  sectionTitle: { marginHorizontal: Spacing.three },
});
