import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { permissionSettingsName } from './storage';

export type PickedImage = { uri: string; base64: string; width: number; height: number };
export type PickedDocument = { base64: string; name: string; sourceType: 'ics' | 'email' | 'flyer' | 'photo' };

/** Thrown when the person declined camera or photo access, so screens can explain how to fix it. */
export class PermissionDeniedError extends Error {}

/**
 * Take or choose one photo, then downscale and re-encode it as JPEG on the phone.
 * Re-encoding drops EXIF and location data before anything is uploaded; the server strips it again.
 */
export async function pickPhoto(source: 'camera' | 'library', maxSide = 1600): Promise<PickedImage | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PermissionDeniedError(
      source === 'camera'
        ? `Camera access is off. Turn it on for Hometide in ${permissionSettingsName()}, or choose a photo instead.`
        : `Photo access is off. Turn it on for Hometide in ${permissionSettingsName()}.`,
    );
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const scale = Math.min(1, maxSide / Math.max(asset.width || maxSide, asset.height || maxSide));
  const context = ImageManipulator.manipulate(asset.uri);
  if (scale < 1) context.resize({ width: Math.round((asset.width || maxSide) * scale) });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('The photo could not be prepared. Please try another one.');
  return { uri: saved.uri, base64: saved.base64, width: saved.width, height: saved.height };
}

/** Choose a flyer PDF, an email (.eml), or a team calendar (.ics) to import for review. */
export async function pickDocument(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'text/calendar', 'message/rfc822', 'text/plain', 'image/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if ((asset.size || 0) > 5_000_000) throw new Error('Choose a file smaller than 5 MB.');
  const name = asset.name || 'document';
  const lower = name.toLowerCase();
  const sourceType = lower.endsWith('.ics') ? 'ics' : lower.endsWith('.eml') ? 'email' : /\.(jpe?g|png|heic|webp)$/.test(lower) ? 'photo' : 'flyer';
  const base64 = Platform.OS === 'web' ? await browserFileBase64(asset.file, asset.uri) : await new File(asset.uri).base64();
  return { base64, name, sourceType };
}

/** Web only: read a chosen file as base64 (no data: prefix), like the phone's file system does. */
async function browserFileBase64(file: Blob | undefined, uri: string): Promise<string> {
  const blob = file ?? (await (await fetch(uri)).blob());
  const dataURL = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That file could not be read. Please try another one.'));
    reader.readAsDataURL(blob);
  });
  return dataURL.slice(dataURL.indexOf(',') + 1);
}
