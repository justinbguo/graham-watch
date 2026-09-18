import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationLightTheme,
  SplashScreen,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useOnboardingGate } from '@/data/profile';
import { FilterProvider } from '@/features/filters/provider';
import { QueryProvider } from '@/providers/query';
import { SessionProvider, useSession } from '@/providers/session';
import { ThemeProvider, useTheme } from '@/providers/theme';

SplashScreen.preventAutoHideAsync();

// Catches what the per-screen boundaries cannot: a provider failing before any
// screen exists. Without it that case is a white screen with no way out.
export { RootErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

// The type is the system face, so there is nothing to load and nothing to
// wait for. The splash stays up for the session and profile alone.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <QueryProvider>
          <SessionProvider>
            <FilterProvider>
              <SplashScreenController />
              <Chrome />
            </FilterProvider>
          </SessionProvider>
        </QueryProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function SplashScreenController() {
  const { isLoading } = useSession();
  const { ready } = useOnboardingGate();
  if (!isLoading && ready) SplashScreen.hide();
  return null;
}

/**
 * React Navigation paints the screen backgrounds and headers itself, so it needs
 * the same palette. Without this the gaps between screens flash white in dark
 * mode during a push.
 */
function Chrome() {
  const theme = useTheme();

  const navigationTheme = useMemo(() => {
    const base = theme.scheme === 'dark' ? NavigationDarkTheme : NavigationLightTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.color.background,
        card: theme.color.surface,
        text: theme.color.text,
        border: theme.color.border,
        primary: theme.color.text,
      },
    };
  }, [theme]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationThemeProvider>
  );
}

/**
 * Three destinations, and the gate has to know which before it renders any of
 * them. While the profile is still loading no guard passes, the stack renders
 * nothing, and the splash screen stays up to cover it.
 */
function RootNavigator() {
  const { isSignedIn } = useSession();
  const { ready, needsOnboarding } = useOnboardingGate();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isSignedIn && ready && !needsOnboarding}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={isSignedIn && ready && needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
