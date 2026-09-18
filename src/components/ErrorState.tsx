import { router, type ErrorBoundaryProps } from 'expo-router';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { Button, Centered, Message, Screen } from '@/components/ui';

/**
 * What a screen shows instead of vanishing.
 *
 * `retry` remounts the route, which is the only recovery a render error has:
 * the component tree is gone, but the query cache and the session survive, so
 * a second attempt usually draws. Reloading the app would cost both.
 *
 * The error text is development-only. "Cannot read property 'brand' of null"
 * tells a buyer nothing, and tells them Graham is broken rather than one watch.
 */
function Fallback({ error, retry, inTabs }: ErrorBoundaryProps & { inTabs: boolean }) {
  return (
    <Screen title="Something broke" inTabs={inTabs}>
      <Centered>
        <Message text={__DEV__ ? error.message : 'This screen could not be drawn.'} tone="error" />
        <Button label="Try again" onPress={retry} variant="solid" />
        {/* A modal that crashed has replaced its own close button with this
            screen, so without a way out the error is a dead end. At a tab root
            there is nowhere to go back to and the tab bar is still there. */}
        {router.canGoBack() ? <Button label="Go back" onPress={router.back} /> : null}
      </Centered>
    </Screen>
  );
}

export function ScreenErrorBoundary(props: ErrorBoundaryProps) {
  return <Fallback {...props} inTabs={false} />;
}

/**
 * Inside `(tabs)` the tab bar already stands in the home-indicator strip, so
 * the screen must not pay that inset twice. See the note on `Screen`.
 */
export function TabErrorBoundary(props: ErrorBoundaryProps) {
  return <Fallback {...props} inTabs />;
}

/**
 * The last resort, and deliberately plain.
 *
 * This one sits outside the providers it guards, so if the theme or the
 * session is what failed, reaching for `useTheme` here would throw a second
 * error while reporting the first. Hence no themed components and no design
 * tokens — `useColorScheme` is a React Native hook and needs no provider, so
 * dark mode still lands.
 */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const dark = useColorScheme() === 'dark';
  const ink = dark ? '#f5f5f5' : '#111111';

  return (
    <View style={[bare.screen, { backgroundColor: dark ? '#111111' : '#ffffff' }]}>
      <Text style={[bare.title, { color: ink }]}>Graham could not start</Text>
      <Text style={[bare.body, { color: ink }]}>
        {__DEV__ ? error.message : 'Something went wrong while opening the app.'}
      </Text>
      <Text accessibilityRole="button" onPress={retry} style={[bare.retry, { color: ink, borderColor: ink }]}>
        Try again
      </Text>
    </View>
  );
}

const bare = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 14, textAlign: 'center', opacity: 0.7 },
  retry: {
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
    fontSize: 15,
  },
});
