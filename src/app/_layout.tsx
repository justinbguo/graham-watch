// Imported per weight, not from the package root: the root re-exports every
// cut and Metro then bundles unused TTFs.
import { EBGaramond_600SemiBold } from '@expo-google-fonts/eb-garamond/600SemiBold';
import { EBGaramond_700Bold } from '@expo-google-fonts/eb-garamond/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { useFonts } from 'expo-font';
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

import { FilterProvider } from '@/features/filters/provider';
import { QueryProvider } from '@/providers/query';
import { SessionProvider, useSession } from '@/providers/session';
import { ThemeProvider, useTheme } from '@/providers/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    EBGaramond_600SemiBold,
    EBGaramond_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // A failed font load must not block the app — fall through to system faces.
  if (!fontsLoaded && !fontError) return null;

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
  if (!isLoading) SplashScreen.hide();
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

function RootNavigator() {
  const { isSignedIn } = useSession();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
