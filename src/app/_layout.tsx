import { useFonts } from 'expo-font';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationLightTheme,
  SplashScreen,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { type ComponentType, type PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useIsDesktopWeb } from '@/lib/layout';
import { useOnboardingGate } from '@/data/profile';
import { GuestProvider } from '@/features/auth/GuestProvider';
import { FilterProvider } from '@/features/filters/provider';
import { Telemetry } from '@/features/telemetry/Telemetry';
import { haasFonts } from '@/lib/fonts';
import { installErrorReporter } from '@/lib/report';
import { applySystemChrome } from '@/lib/systemChrome';
import { bindVisibleViewport } from '@/lib/visibleViewport';

installErrorReporter();
if (Platform.OS === 'web') bindVisibleViewport();
import { QueryProvider } from '@/providers/query';
import { SessionProvider, useSession } from '@/providers/session';
import { ThemeProvider, useTheme } from '@/providers/theme';

SplashScreen.preventAutoHideAsync();

function NativeBridges({ children }: PropsWithChildren) {
  const [Bridge, setBridge] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (process.env.EXPO_OS === 'web') return;
    let alive = true;
    void import('@/providers/nativeBridges').then((mod) => {
      if (alive) setBridge(() => mod.NativeBridges);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (process.env.EXPO_OS === 'web' || !Bridge) return children;
  return (
    <>
      {children}
      <Bridge />
    </>
  );
}

// Catches what the per-screen boundaries cannot: a provider failing before any
// screen exists. Without it that case is a white screen with no way out.
export { RootErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

// Neue Haas Grotesk, including the wordmark. One load, before the splash
// drops, so the first screen is not set in the system face.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Web tab title. Expo otherwise uses app.json `name`, which is also the
          home-screen name on iOS and Android, so it stays "Graham" there. */}
      <Head>
        <title>Graham.Watch</title>
      </Head>
      <ThemeProvider>
        <QueryProvider>
          <SessionProvider>
            <NativeBridges>
              <GuestProvider>
                <FilterProvider>
                  <SplashScreenController />
                  <Telemetry />
                  <Chrome />
                </FilterProvider>
              </GuestProvider>
            </NativeBridges>
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
 * until there is a session. A phone still walks the question flow. Desktop
 * web stays in the app while the profile loads, then finishes on the
 * first-run sheet. On a phone, no guard passes until the profile is loaded,
 * the stack renders nothing, and the splash screen stays up to cover it.
 */
function RootNavigator() {
  const { isSignedIn } = useSession();
  const { ready, needsOnboarding } = useOnboardingGate();
  const desktopWeb = useIsDesktopWeb();
  const questions = isSignedIn && ready && needsOnboarding && !desktopWeb;
  const app = !isSignedIn || desktopWeb || (ready && !needsOnboarding);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={app}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={questions}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
