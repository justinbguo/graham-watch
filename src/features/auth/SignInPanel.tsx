import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Field, Message } from '@/components/ui';
import { Wordmark } from '@/components/Wordmark';
import { useSignIn, type SignInMode } from '@/features/auth/email';
import { GoogleButton } from '@/features/auth/GoogleButton';
import { SignInOption } from '@/features/auth/SignInOption';
import { BackendEnvironment } from '@/features/dev/BackendEnvironment';
import { isDemo } from '@/lib/demo';
import { inset, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const DOOR: Record<SignInMode, string> = {
  create: 'Create account with',
  login: 'Log in with',
};

const SWITCH: Record<SignInMode, string> = {
  create: 'Already have an account? Log in',
  login: 'New to Graham? Create an account',
};

/**
 * The doors themselves. Used as a sheet over the deck (guest browsing) and as
 * the full sign-in surface when the stack still needs one.
 */
export function SignInPanel({
  reason,
  footer,
}: {
  /** Why the sheet opened — budget is the ten-swipe gate. */
  reason?: 'budget' | 'action';
  footer?: ReactNode;
}) {
  const signIn = useSignIn();
  const styles = useThemedStyles(panelStyles);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.copy}>
        <Wordmark />
        <Text style={styles.tagline}>
          {reason === 'budget'
            ? 'Sign in to keep swiping, save watches, and message dealers.'
            : 'The best vintage dealers and the most passionate collectors.'}
        </Text>
        {!isDemo ? <BackendEnvironment compact /> : null}
      </View>

      <SignInDoors signIn={signIn} />
      {footer}
    </KeyboardAvoidingView>
  );
}

function SignInDoors({ signIn }: { signIn: ReturnType<typeof useSignIn> }) {
  const styles = useThemedStyles(panelStyles);
  const theme = useTheme();

  return (
    <>
      {signIn.stage === 'method' ? (
        <View style={styles.doors}>
          {signIn.appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                signIn.mode === 'create'
                  ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                  : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                theme.scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={size.controlMin / 2}
              style={styles.apple}
              onPress={signIn.signInWithApple}
            />
          ) : (
            <SignInOption
              label={`${DOOR[signIn.mode]} Apple`}
              disabled={signIn.busy}
              onPress={signIn.signInWithAppleWeb}
              mark={<DoorMark name="apple" color={theme.color.onAccent} />}
            />
          )}

          {signIn.googleEnabled ? (
            <GoogleButton
              label={`${DOOR[signIn.mode]} Google`}
              disabled={signIn.busy}
              onPress={signIn.signInWithGoogle}
            />
          ) : null}

          <View style={styles.divider}>
            <View style={styles.rule} />
            <Text style={styles.dividerLabel}>or</Text>
            <View style={styles.rule} />
          </View>

          <SignInOption
            label={`${DOOR[signIn.mode]} email`}
            disabled={signIn.busy}
            onPress={signIn.chooseEmail}
            mark={<DoorMark name="email-outline" color={theme.color.onAccent} />}
          />
        </View>
      ) : null}

      {signIn.stage === 'email' ? (
        <View style={styles.form}>
          <Field
            autoFocus
            value={signIn.email}
            onChangeText={signIn.setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            onSubmitEditing={signIn.sendCode}
          />
          <Button
            label="Send me a code"
            loading={signIn.busy}
            disabled={!signIn.email.includes('@')}
            onPress={signIn.sendCode}
          />
          <Button label="Back" variant="ghost" onPress={signIn.back} />
        </View>
      ) : null}

      {signIn.stage === 'code' ? (
        <View style={styles.form}>
          <Message text={codeMessage(signIn)} />
          <Field
            autoFocus
            accessibilityLabel="Sign-in code"
            value={signIn.code}
            onChangeText={signIn.setCode}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            onSubmitEditing={signIn.submitCode}
          />
          <Button
            label="Continue"
            loading={signIn.busy}
            disabled={signIn.code.trim().length !== 6}
            onPress={signIn.submitCode}
          />
          <Button label="Back" variant="ghost" onPress={signIn.back} />
        </View>
      ) : null}

      {signIn.error ? <Message text={signIn.error} tone="error" /> : null}

      {signIn.stage !== 'code' ? (
        <Button label={SWITCH[signIn.mode]} variant="ghost" onPress={signIn.switchMode} />
      ) : null}
    </>
  );
}

function DoorMark({ name, color }: { name: 'apple' | 'email-outline'; color: string }) {
  return (
    <MaterialCommunityIcons name={name} size={size.providerMark} color={color} accessible={false} />
  );
}

function codeMessage(signIn: ReturnType<typeof useSignIn>): string {
  if (signIn.readingInbox) {
    return `Reading the local inbox for ${signIn.email}.`;
  }
  return `Enter the six digit code we sent to ${signIn.email}, or open the link in that email.`;
}

const panelStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    justifyContent: 'center' as const,
    gap: stack.group,
    // Screen pads a header, not its body. Without this the wordmark and the
    // capsule ends run off the glass.
    paddingHorizontal: inset.screen,
  },
  copy: {
    alignItems: 'flex-start' as const,
    gap: stack.tight,
  },
  tagline: {
    ...type.body,
    alignSelf: 'stretch' as const,
    color: theme.color.textMuted,
  },
  doors: {
    gap: stack.related,
  },
  form: {
    gap: stack.related,
  },
  divider: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: theme.color.border,
  },
  dividerLabel: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  apple: {
    width: '100%' as const,
    height: size.controlMin,
  },
});
