import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { Screen } from '@/components/ui';
import { SignInPanel } from '@/features/auth/SignInPanel';
import { FilterProvider } from '@/features/filters/provider';
import { SaveFlightProvider } from '@/features/saved/flight';
import { useSession } from '@/providers/session';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// The fallback for the modal routes, which have no boundary of their own. A
// screen-level boundary is preferred where one exists, so this runs only when
// the failure is in this layout or in a route that did not claim it.
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function AppLayout() {
  const { isSignedIn, isLoading } = useSession();

  // iOS has no guest deck. The header cannot spare a Log in control beside
  // the title, and the phone is not a preview of the site. Web keeps the
  // deck, with Log in in that slot.
  if (Platform.OS === 'ios' && !isSignedIn) {
    if (isLoading) return null;
    return (
      <Screen>
        <SignInPanel />
      </Screen>
    );
  }

  return (
    <FilterProvider>
      {/* Outside the Stack: a saved card flies over the tab bar on its way to
          the Wishlist tab, so the overlay has to sit above every screen. */}
      <SaveFlightProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="listing/[listingId]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="dealer/[dealerId]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="drops" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="collector/[userId]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen
            name="conversation/[conversationId]"
            options={{ presentation: 'fullScreenModal' }}
          />
          <Stack.Screen
            name="photos/[listingId]"
            options={{ presentation: 'fullScreenModal', animation: 'none' }}
          />
          <Stack.Screen name="inquiry/[listingId]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="new-message" options={{ presentation: 'modal' }} />
          <Stack.Screen name="new-group" options={{ presentation: 'modal' }} />
          <Stack.Screen name="edit-listing/[listingId]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="import-inventory" options={{ presentation: 'modal' }} />
          <Stack.Screen name="seller-messages" options={{ presentation: 'modal' }} />
          <Stack.Screen name="apply" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="graham-pro" options={{ presentation: 'modal' }} />
          <Stack.Screen name="filters/[surface]" options={{ presentation: 'modal' }} />
          {/* A tab switch cuts. The door on Buy should read as the thing that opened. */}
          <Stack.Screen
            name="search"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="sign-in"
            options={{
              presentation: 'modal',
              ...(Platform.OS === 'web'
                ? { animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }
                : {}),
            }}
          />
        </Stack>
      </SaveFlightProvider>
    </FilterProvider>
  );
}
