import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Two haptics, and no others. Haptics are supplementary: iOS suppresses them
 * in Low Power Mode and while the camera or dictation is up, so every gesture
 * has to read without them. Both swallow their errors for the same reason.
 */

/** One selection tick: a threshold crossed, a state flipped. */
export function tick() {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync().catch(() => {});
}

/** One rigid impact: a decision committed. */
export function impact() {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
}
