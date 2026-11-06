import Storage from 'expo-sqlite/kv-store';

/**
 * Local reminders (no server, no push): water, meals, training days and weighing.
 * They live on this iPhone only, so the settings are stored on the device too.
 *
 * expo-notifications is a native module that older app builds don't contain; it is loaded lazily
 * so the same JS keeps running there (the reminders screen then asks for the new app version).
 */

export type Time = { hour: number; minute: number };
export type ReminderSettings = {
  water: { on: boolean; from: number; to: number; everyHours: number };
  meals: { on: boolean; breakfast: Time; lunch: Time; dinner: Time };
  /** Weekdays 1 = Monday … 7 = Sunday. */
  training: { on: boolean; days: number[]; time: Time };
  weigh: { on: boolean; time: Time };
};

export const DEFAULT_REMINDERS: ReminderSettings = {
  water: { on: false, from: 10, to: 20, everyHours: 2 },
  meals: { on: false, breakfast: { hour: 9, minute: 30 }, lunch: { hour: 13, minute: 0 }, dinner: { hour: 19, minute: 30 } },
  training: { on: false, days: [1, 3, 5], time: { hour: 18, minute: 0 } },
  weigh: { on: false, time: { hour: 7, minute: 30 } },
};

const KEY = 'reminders';

export function loadReminders(): ReminderSettings {
  try {
    const raw = Storage.getItemSync(KEY);
    return raw ? { ...DEFAULT_REMINDERS, ...JSON.parse(raw) } : DEFAULT_REMINDERS;
  } catch {
    return DEFAULT_REMINDERS;
  }
}

type NotificationsModule = typeof import('expo-notifications');
let module: NotificationsModule | null | undefined;

async function notifications(): Promise<NotificationsModule | null> {
  if (module !== undefined) return module;
  try {
    const m = await import('expo-notifications');
    // Throws on builds without the native module.
    await m.getPermissionsAsync();
    m.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    module = m;
  } catch {
    module = null;
  }
  return module;
}

/** false when this app build doesn't include notifications yet (needs the new build from GitHub). */
export async function remindersAvailable() {
  return (await notifications()) != null;
}

/** Saves the settings and replaces all scheduled reminders. Returns false if notifications aren't allowed. */
export async function saveReminders(settings: ReminderSettings): Promise<boolean> {
  Storage.setItemSync(KEY, JSON.stringify(settings));
  const N = await notifications();
  if (!N) return false;

  const anyOn = settings.water.on || settings.meals.on || settings.training.on || settings.weigh.on;
  if (anyOn) {
    const current = await N.getPermissionsAsync();
    const granted = current.granted || (await N.requestPermissionsAsync()).granted;
    if (!granted) return false;
  }

  await N.cancelAllScheduledNotificationsAsync();
  const daily = (time: Time, title: string, body: string) =>
    N.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: { type: N.SchedulableTriggerInputTypes.DAILY, hour: time.hour, minute: time.minute },
    });

  if (settings.water.on) {
    const { from, to, everyHours } = settings.water;
    for (let h = from; h <= to; h += Math.max(1, everyHours)) {
      await daily({ hour: h, minute: 0 }, 'Zeit für Wasser 💧', 'Ein Glas zwischendurch – trag es kurz in der App ein.');
    }
  }
  if (settings.meals.on) {
    await daily(settings.meals.breakfast, 'Frühstück eintragen?', 'Halte deine Kalorien im Blick.');
    await daily(settings.meals.lunch, 'Mittagessen eintragen?', 'Ein Foto reicht – die KI schätzt den Rest.');
    await daily(settings.meals.dinner, 'Abendessen eintragen?', 'Damit dein Tag vollständig ist.');
  }
  if (settings.training.on) {
    for (const day of settings.training.days) {
      await N.scheduleNotificationAsync({
        content: { title: 'Heute ist Trainingstag 💪', body: 'Starte dein Workout direkt aus der App.', sound: true },
        // expo-notifications counts weekdays from Sunday = 1.
        trigger: { type: N.SchedulableTriggerInputTypes.WEEKLY, weekday: (day % 7) + 1, hour: settings.training.time.hour, minute: settings.training.time.minute },
      });
    }
  }
  if (settings.weigh.on) {
    await daily(settings.weigh.time, 'Kurz auf die Waage?', 'Morgens nüchtern ist der Wert am vergleichbarsten.');
  }
  return true;
}
