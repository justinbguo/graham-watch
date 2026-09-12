import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

// React Query assumes a browser: it watches window focus and navigator.onLine.
// Neither exists here, so foreground and connectivity have to be wired by hand.
onlineManager.setEventListener((setOnline) => {
  const subscription = Network.addNetworkStateListener((state) => {
    setOnline(Boolean(state.isConnected));
  });
  return subscription.remove;
});

function handleAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
}

export function QueryProvider({ children }: PropsWithChildren) {
  // Created in state so Fast Refresh doesn't throw the cache away on every edit.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Phones drop connections constantly; a couple of retries is normal,
            // not a sign of a real failure.
            retry: 2,
            staleTime: 30_000,
            refetchOnWindowFocus: true,
          },
        },
      })
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
