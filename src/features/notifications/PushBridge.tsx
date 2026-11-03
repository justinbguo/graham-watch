import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { isDemo } from '@/lib/demo';
import { recordDropOpened, routeFromNotification, syncPushRegistration } from '@/lib/push';
import { useSession } from '@/providers/session';

/**
 * Keeps this phone's push token current, and opens what a notification named.
 * Permission is asked on the last onboarding step and after the first follow.
 * This bridge does not prompt on launch.
 *
 * Mounted once under the session so it survives navigation.
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
      const route = routeFromNotification(response);
      if (!route) return;
      handled.current = key;
      if (route.type === 'conversation') {
        router.push(`/conversation/${route.conversationId}`);
        return;
      }
      void recordDropOpened(route.dropNotificationId).catch(() => undefined);
      if (route.dealerId) router.push(`/dealer/${route.dealerId}`);
      else router.push('/drops');
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
