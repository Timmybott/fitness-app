import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { bridge } from '@/lib/bridge';
import { type Meal } from '@/lib/types';

export type PickedPhoto = { uri: string; base64: string };

/** Camera or photo library, then shrinks the image so uploads stay small. Null if cancelled. */
export async function pickPhoto(source: 'camera' | 'library', width = 1024): Promise<PickedPhoto | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Kamerazugriff wurde nicht erlaubt. Du kannst ihn in den iPhone-Einstellungen aktivieren.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;

  const image = await ImageManipulator.manipulate(result.assets[0].uri).resize({ width }).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error('Foto konnte nicht verarbeitet werden');
  return { uri: saved.uri, base64: saved.base64 };
}

/**
 * Takes the food photo first and only then opens the analysis screen: launching the camera while a
 * screen was still animating in left the camera black.
 */
export async function startPhotoEntry(date: string, meal: Meal, mode: 'food' | 'drink' = 'food') {
  try {
    const photo = await pickPhoto('camera');
    if (!photo) return;
    bridge.setPhoto(photo);
    router.push({ pathname: '/photo', params: { date, meal, mode } });
  } catch (e) {
    Alert.alert('Foto', (e as Error).message);
  }
}
