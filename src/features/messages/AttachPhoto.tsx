import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Alert, Platform, Pressable } from 'react-native';

import type { MessagePhoto } from '@/data/messages';
import { HIT_TARGET, size } from '@/lib/theme';
import { useTheme } from '@/providers/theme';

/**
 * Compatible turns an iPhone HEIC into a jpeg. The message bucket only
 * accepts jpeg, png, and webp, and a HEIC that previews fine would fail on send.
 */
const pickerOptions = {
  mediaTypes: ['images'] as ImagePicker.MediaType[],
  quality: 0.7,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

/**
 * expo-image-picker is the system camera and the system photo library. A
 * message photo has to be a file the phone already has, or one it just took.
 */
export function AttachPhoto({
  disabled = false,
  onPick,
  onError,
}: {
  disabled?: boolean;
  onPick: (photo: MessagePhoto) => void;
  onError: (message: string) => void;
}) {
  const theme = useTheme();

  async function fromLibrary() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      take(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not open photos.');
    }
  }

  async function fromCamera() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        onError('The camera is not available.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync(pickerOptions);
      take(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not open the camera.');
    }
  }

  function take(result: ImagePicker.ImagePickerResult) {
    if (result.canceled) return;
    const asset = result.assets[0];
    onPick({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  }

  function choose() {
    if (Platform.OS === 'web') {
      void fromLibrary();
      return;
    }
    Alert.alert('Add a photo', undefined, [
      { text: 'Take photo', onPress: () => void fromCamera() },
      { text: 'Camera roll', onPress: () => void fromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add a photo"
      disabled={disabled}
      hitSlop={(HIT_TARGET - size.icon) / 2}
      onPress={choose}
      style={({ pressed }) => pressed && { opacity: 0.72 }}>
      <MaterialCommunityIcons name="camera-outline" size={size.icon} color={theme.color.ink} />
    </Pressable>
  );
}
