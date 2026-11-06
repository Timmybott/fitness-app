import { router } from 'expo-router';
import { Alert } from 'react-native';

import { type Template } from '@/lib/types';
import { getDraft, startWorkout } from '@/lib/workout-draft';

/**
 * Starts a workout (from a template or free) and opens it. Only one workout can run at a time.
 * `closeSheet` first dismisses the screen it is called from (the template sheet).
 */
export async function beginWorkout(template: Template | null, closeSheet = false) {
  if (getDraft()) {
    Alert.alert('Es läuft schon ein Workout', 'Erst beenden oder verwerfen.', [
      {
        text: 'Zum Workout',
        onPress: () => {
          if (closeSheet) router.back();
          router.push('/workout');
        },
      },
      { text: 'OK', style: 'cancel' },
    ]);
    return;
  }
  await startWorkout(template);
  if (closeSheet) router.back();
  router.push('/workout');
}
