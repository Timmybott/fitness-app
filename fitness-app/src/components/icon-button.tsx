import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';
import { type SFSymbol } from 'sf-symbols-typescript';

import { Colors } from '@/constants/theme';

type Props = { icon: SFSymbol; onPress: () => void; filled?: boolean };

export function IconButton({ icon, onPress, filled }: Props) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [styles.button, filled && styles.filled, pressed && styles.pressed]}>
      <SymbolView
        name={icon}
        size={filled ? 14 : 18}
        weight="bold"
        tintColor={filled ? Colors.onAccent : Colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.accent },
  pressed: { opacity: 0.6 },
});
