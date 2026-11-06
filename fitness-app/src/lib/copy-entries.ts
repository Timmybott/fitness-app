import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';

import { api, invalidate } from '@/lib/api';
import { formatDateKey } from '@/lib/date';
import { logEntryToHealth } from '@/lib/health';
import { MEALS, type Entry, type Meal } from '@/lib/types';

/** Copies all entries (or one meal's) from one day to another, after asking. */
export function copyDay(fromDate: string, toDate: string, fromMeal?: Meal, toMeal?: Meal) {
  const what = fromMeal ? (MEALS.find((m) => m.key === fromMeal)?.label ?? '') : 'Alle Einträge';
  Alert.alert(`${what} von ${formatDateKey(fromDate)} übernehmen?`, `Sie werden zu ${formatDateKey(toDate)} hinzugefügt.`, [
    { text: 'Abbrechen', style: 'cancel' },
    {
      text: 'Übernehmen',
      onPress: async () => {
        try {
          const copied = await api.post<Entry[]>('/entries/copy', { fromDate, toDate, fromMeal, toMeal });
          if (copied.length === 0) return Alert.alert('Nichts zu übernehmen', `An ${formatDateKey(fromDate)} ist dazu nichts eingetragen.`);
          copied.forEach(logEntryToHealth);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          invalidate();
        } catch (e) {
          Alert.alert('Fehler', (e as Error).message);
        }
      },
    },
  ]);
}
