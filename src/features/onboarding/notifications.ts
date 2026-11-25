import { Platform } from 'react-native';

import { ensureAndroidChannel, syncPushRegistration } from '@/lib/push';

/**
 * Requests the operating-system permission shown on the final onboarding step.
 *
 * Android 13 does not show its prompt until a channel exists, so the channel
 * must be created first. Web has no expo-notifications permission API; the
 * mobile app is the notification surface until browser push is built.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (process.env.EXPO_OS === 'web' || Platform.OS === 'web') return false;

  const Notifications = await import('expo-notifications');
  const isAllowed = (settings: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>) =>
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

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
