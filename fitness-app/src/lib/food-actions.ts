import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { api, invalidate } from '@/lib/api';
import { type Food } from '@/lib/types';

export const FAVORITE_COLOR = '#FFCC00';

/** Favourite on/off and delete for one of the user's own foods (long press in lists). */
export function foodActions(f: Food) {
  if (!f.id) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  Alert.alert(f.name, undefined, [
    {
      text: f.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten',
      onPress: () => api.put(`/foods/${f.id}/favorite`, { favorite: !f.favorite }).then(invalidate),
    },
    { text: 'Bearbeiten', onPress: () => router.push({ pathname: '/food-edit', params: { id: f.id } }) },
    {
      text: 'Löschen',
      style: 'destructive',
      onPress: () =>
        Alert.alert(`„${f.name}“ löschen?`, 'Bereits eingetragene Mahlzeiten bleiben erhalten.', [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Löschen', style: 'destructive', onPress: () => api.del(`/foods/${f.id}`).then(invalidate) },
        ]),
    },
    { text: 'Abbrechen', style: 'cancel' },
  ]);
}
