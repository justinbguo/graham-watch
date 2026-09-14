import { Stack } from 'expo-router';

import { FilterProvider } from '@/features/filters/provider';
import { SaveFlightProvider } from '@/features/saved/flight';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function AppLayout() {
  return (
    <FilterProvider>
      {/* Outside the Stack: a saved card flies over the tab bar on its way to
          the Saved tab, so the overlay has to sit above every screen. */}
      <SaveFlightProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="listing/[listingId]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="photos/[listingId]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="inquiry/[listingId]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="edit-listing/[listingId]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="import-inventory" options={{ presentation: 'modal' }} />
          <Stack.Screen name="claim-shop" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="filters/[surface]" options={{ presentation: 'modal' }} />
        </Stack>
      </SaveFlightProvider>
    </FilterProvider>
  );
}
