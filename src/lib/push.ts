import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { isDemo } from './demo';
import { routeFromPushData, type PushRoute } from './pushRoute';
import { supabase } from './supabase';

/** Matches the channel created for Android 13 and the `channelId` on each push. */
export const PUSH_CHANNEL_ID = 'watch-updates';

const allowed = (settings: Notifications.NotificationPermissionsStatus) =>
  settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

if (Platform.OS !== 'web') {
  // Without a handler, a reply that arrives while Graham is open is swallowed
  // on iOS. The banner is the system one; we do not draw our own.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/** Android 13 will not prompt, and will not show a push, until a channel exists. */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'Watch updates',
    description: 'New watches from dealers you follow, and replies.',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

let currentToken: string | null = null;

async function readToken(): Promise<string | null> {
  const id = projectId();
  if (!id) return null;
  const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
  return token.data || null;
}

/**
 * Store this device's Expo push token for the signed-in account.
 * No permission, no session, or a web browser: nothing is written.
 */
export async function syncPushRegistration(): Promise<void> {
  if (Platform.OS === 'web' || isDemo) return;

  const { data } = await supabase.auth.getSession();
  if (!data.session) return;

  await ensureAndroidChannel();
  const settings = await Notifications.getPermissionsAsync();
  if (!allowed(settings)) return;

  const token = await readToken();
  if (!token) return;
  currentToken = token;

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { error } = await supabase.rpc('register_push_token', {
    p_platform: platform,
    p_token: token,
  });
  if (error) throw error;
}

/** Forget this device before the session is gone. Other phones keep their tokens. */
export async function releasePushToken(): Promise<void> {
  if (Platform.OS === 'web' || isDemo) return;

  let token = currentToken;
  if (!token) {
    const settings = await Notifications.getPermissionsAsync();
    if (!allowed(settings)) return;
    token = await readToken();
  }
  if (!token) return;

  const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
  currentToken = null;
  if (error) throw error;
}

export function routeFromNotification(
  response: Notifications.NotificationResponse | null,
): PushRoute | null {
  return routeFromPushData(response?.notification.request.content.data);
}

export function conversationIdFromNotification(
  response: Notifications.NotificationResponse | null,
): string | null {
  const route = routeFromNotification(response);
  return route?.type === 'conversation' ? route.conversationId : null;
}

/** The buyer opened a drop. The first tap is the one the open rate counts. */
export async function recordDropOpened(id: string): Promise<void> {
  if (isDemo) return;
  const { error } = await supabase.rpc('record_drop_opened', { p_id: id });
  if (error) throw error;
}
