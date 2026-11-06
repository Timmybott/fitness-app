import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { type SetTarget } from '@/lib/types';

/** A set row as typed (strings, so fields can be empty while editing). */
export type SetRow = { weight: string; reps: string; done?: boolean };

type Props = {
  sets: SetRow[];
  onChange: (index: number, patch: Partial<SetRow>) => void;
  onAddSet: () => void;
  /**
   * 'log' (workout): "Zuletzt" column, last time's values as placeholders, ✓ to complete a set.
   * 'plan' (template): no history, − to remove a set.
   */
  mode: 'log' | 'plan';
  last?: SetTarget[];
  onToggleDone?: (index: number) => void;
  onRemoveSet?: (index: number) => void;
};

/** The set table shared by the workout and the template editor: Satz | (Zuletzt) | kg | Wdh | action. */
export function SetTable({ sets, onChange, onAddSet, mode, last = [], onToggleDone, onRemoveSet }: Props) {
  const log = mode === 'log';
  return (
    <View>
      <View style={styles.row}>
        <AppText type="caption" color={Colors.textTertiary} style={styles.colSet}>
          SATZ
        </AppText>
        {log ? (
          <AppText type="caption" color={Colors.textTertiary} style={styles.colLast}>
            ZULETZT
          </AppText>
        ) : (
          <View style={styles.colLast} />
        )}
        <AppText type="caption" color={Colors.textTertiary} style={styles.colInput}>
          KG
        </AppText>
        <AppText type="caption" color={Colors.textTertiary} style={styles.colInput}>
          WDH
        </AppText>
        <View style={styles.colAction} />
      </View>

      {sets.map((s, i) => {
        const previous = last[i];
        // In the workout, empty fields fall back to last time's values, so those are the placeholders.
        const hint = log ? (last[i] ?? last.at(-1)) : undefined;
        return (
          <View key={i} style={[styles.row, s.done && styles.done]}>
            <AppText type="headline" style={styles.colSet}>
              {i + 1}
            </AppText>
            {log ? (
              <AppText type="caption" color={Colors.textSecondary} style={styles.colLast}>
                {previous ? `${previous.weight} × ${previous.reps}` : '–'}
              </AppText>
            ) : (
              <View style={styles.colLast} />
            )}
            <Field value={s.weight} placeholder={hint ? String(hint.weight) : log ? '0' : '–'} onChange={(v) => onChange(i, { weight: v })} decimal />
            <Field value={s.reps} placeholder={hint ? String(hint.reps) : '0'} onChange={(v) => onChange(i, { reps: v })} />
            {log ? (
              <Pressable onPress={() => onToggleDone?.(i)} hitSlop={6} style={[styles.colAction, styles.check, s.done && styles.checkDone]}>
                <SymbolView name="checkmark" size={14} weight="bold" tintColor={s.done ? Colors.onAccent : Colors.textTertiary} />
              </Pressable>
            ) : (
              <Pressable onPress={() => onRemoveSet?.(i)} hitSlop={6} style={styles.colAction}>
                <SymbolView name="minus.circle.fill" size={20} tintColor={Colors.danger} />
              </Pressable>
            )}
          </View>
        );
      })}

      <Pressable onPress={onAddSet} style={({ pressed }) => [styles.addSet, pressed && styles.dim]}>
        <AppText type="caption" color={Colors.accent}>
          + Satz
        </AppText>
      </Pressable>
    </View>
  );
}

function Field({ value, placeholder, onChange, decimal }: { value: string; placeholder: string; onChange: (v: string) => void; decimal?: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={Colors.textTertiary}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      selectTextOnFocus
      style={[styles.colInput, styles.input]}
    />
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 6, borderRadius: Radius.small },
  done: { backgroundColor: Colors.accentDim },
  colSet: { width: 36, textAlign: 'center' },
  colLast: { flex: 1 },
  colInput: { width: 64, textAlign: 'center' },
  colAction: { width: 32, alignItems: 'center', justifyContent: 'center' },
  input: {
    height: 34,
    borderRadius: Radius.small,
    backgroundColor: Colors.cardElevated,
    color: Colors.text,
    fontSize: 17,
    fontWeight: 600,
  },
  check: { height: 32, borderRadius: 16, backgroundColor: Colors.cardElevated },
  checkDone: { backgroundColor: Colors.accent },
  addSet: { alignItems: 'center', paddingVertical: Spacing.two },
});
