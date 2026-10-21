import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { isDemo } from '@/lib/demo';
import { conversationIdFromNotification, syncPushRegistration } from '@/lib/push';
import { useSession } from '@/providers/session';

/**
 * Keeps this phone's push token current, and opens the thread a notification
 * named. Mounted once under the session so it survives navigation.
 */
export function PushBridge() {
  const { userId } = useSession();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || Platform.OS === 'web' || isDemo) return;
    void syncPushRegistration().catch(() => undefined);

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPushRegistration().catch(() => undefined);
    });

    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const key = response.notification.request.identifier;
      if (handled.current === key) return;
      const conversationId = conversationIdFromNotification(response);
      if (!conversationId) return;
      handled.current = key;
      router.push(`/conversation/${conversationId}`);
    };

    // Wait for a session. A tap that launches the app arrives before the
    // signed-in stack exists, and pushing the thread then is a no-op.
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const taps = Notifications.addNotificationResponseReceivedListener(open);

    return () => {
      appState.remove();
      taps.remove();
    };
  }, [userId]);

  return null;
}
