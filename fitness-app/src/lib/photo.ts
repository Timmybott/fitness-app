import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type PickedPhoto = { uri: string; base64: string };

/** Opens the camera, then shrinks the photo so uploads stay small (~150 KB). Null if cancelled. */
export async function takeFoodPhoto(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Kamerazugriff wurde nicht erlaubt. Du kannst ihn in den iPhone-Einstellungen aktivieren.');

  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets[0]) return null;

  const image = await ImageManipulator.manipulate(result.assets[0].uri).resize({ width: 1024 }).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error('Foto konnte nicht verarbeitet werden');
  return { uri: saved.uri, base64: saved.base64 };
}
