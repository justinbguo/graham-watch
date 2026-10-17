import * as SystemUI from 'expo-system-ui';
import { Platform } from 'react-native';

import type { Theme } from '@/lib/theme';

/** Root view background. Matches the active scheme so gaps and sheets do not flash the wrong tone. */
export function applySystemChrome(theme: Theme) {
  if (Platform.OS === 'web') return;
  void SystemUI.setBackgroundColorAsync(theme.color.background);
}
