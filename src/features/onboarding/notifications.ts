import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ensureAndroidChannel, syncPushRegistration } from '@/lib/push';

function isAllowed(settings: Notifications.NotificationPermissionsStatus): boolean {
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/**
 * Requests the operating-system permission shown on the final onboarding step.
 *
 * Android 13 does not show its prompt until a channel exists, so the channel
 * must be created first. Web has no expo-notifications permission API; the
 * mobile app is the notification surface until browser push is built.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  const allowed = isAllowed(existing)
    ? true
    : isAllowed(
        await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        }),
      );

  // The permission is what onboarding records. Registering the token can fail
  // in Expo Go (that binary is Expo's, not Graham's) and still succeed on the
  // next launch of a real build.
  if (allowed) await syncPushRegistration().catch(() => undefined);
  return allowed;
}
