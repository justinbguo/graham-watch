import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

// expo-linking's openURL assigns window.location on web, so this opens a new
// tab there.
export function openExternal(url: string): void {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(url);
}
