import { Stack } from 'expo-router';

import { FilterProvider } from '@/features/filters/provider';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function AppLayout() {
  return (
    <FilterProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="inquiry/[listingId]" options={{ presentation: 'modal' }} />
      </Stack>
    </FilterProvider>
  );
}
