import { useFonts } from 'expo-font';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationLightTheme,
  router,
  SplashScreen,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useOnboardingGate } from '@/data/profile';
import { GuestProvider } from '@/features/auth/GuestProvider';
import { FilterProvider } from '@/features/filters/provider';
import { PushBridge } from '@/features/notifications/PushBridge';
import { Telemetry } from '@/features/telemetry/Telemetry';
import { haasFonts } from '@/lib/fonts';
import { installErrorReporter } from '@/lib/report';
import { applySystemChrome } from '@/lib/systemChrome';

installErrorReporter();
import { QueryProvider } from '@/providers/query';
import { RevenueCatProvider } from '@/providers/revenuecat';
import { SessionProvider, useSession } from '@/providers/session';
import { ThemeProvider, useTheme } from '@/providers/theme';

SplashScreen.preventAutoHideAsync();

// Catches what the per-screen boundaries cannot: a provider failing before any
// screen exists. Without it that case is a white screen with no way out.
export { RootErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

// Neue Haas Grotesk, including the wordmark. One load, before the splash
// drops, so the first screen is not set in the system face.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <QueryProvider>
          <SessionProvider>
            <RevenueCatProvider>
              <GuestProvider>
                <FilterProvider>
                  <SplashScreenController />
                  <Telemetry />
                  <PushBridge />
                  <Chrome />
                </FilterProvider>
              </GuestProvider>
            </RevenueCatProvider>
          </SessionProvider>
        </QueryProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function SplashScreenController() {
  const { isLoading } = useSession();
  const { ready } = useOnboardingGate();
  // A failed download must not hold the splash forever: type falls back to
  // the platform face and the app opens.
  const [fontLoaded, fontError] = useFonts(haasFonts);
  if (!isLoading && ready && (fontLoaded || fontError)) SplashScreen.hide();
  return null;
}

/**
 * React Navigation paints the screen backgrounds and headers itself, so it needs
 * the same palette. Without this the gaps between screens flash white in dark
 * mode during a push.
 */
function Chrome() {
  const theme = useTheme();

  useEffect(() => {
    applySystemChrome(theme);
  }, [theme]);

  // A signed-in full page load of /drops returns to Buy. The notification tap
  // uses router.push while the app is already open, and the local tour does too.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const target = window as Window & { __grahamNavigate?: (href: string) => void };
    target.__grahamNavigate = (href) => {
      router.push(href as '/drops');
    };
    return () => {
      delete target.__grahamNavigate;
    };
  }, []);

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
 * Web guests land on the deck. On iOS the app layout is the sign-in wall
 * until there is a session. Signed-in users who still need onboarding go
 * there first. While the profile is loading no guard passes, the stack
 * renders nothing, and the splash screen stays up to cover it.
 */
function RootNavigator() {
  const { isSignedIn } = useSession();
  const { ready, needsOnboarding } = useOnboardingGate();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isSignedIn || (ready && !needsOnboarding)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={isSignedIn && ready && needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
