import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Field, Message, Screen } from '@/components/ui';
import { Wordmark } from '@/components/Wordmark';
import { useSignIn, type SignInMode } from '@/features/auth/email';
import { GoogleButton } from '@/features/auth/GoogleButton';
import { SignInOption } from '@/features/auth/SignInOption';
import { WordmarkWatches } from '@/features/auth/WordmarkWatches';
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
 * One route, two modes. The doors say which — the providers do not know the
 * difference, and email only differs in whether an unknown address may join.
 */
export default function SignIn() {
  const signIn = useSignIn();
  const styles = useThemedStyles(signInStyles);
  const theme = useTheme();
  const [lockupHeight, setLockupHeight] = useState<number>(size.wordmarkWatch);

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.lockup}>
          <WordmarkWatches height={lockupHeight} />
          <View
            style={styles.copy}
            onLayout={(event) => {
              const next = event.nativeEvent.layout.height;
              setLockupHeight((current) => (Math.abs(current - next) < 1 ? current : next));
            }}>
            <Wordmark />
            <Text style={styles.tagline}>
              The best vintage dealers and{'\n'}the most passionate collectors.
            </Text>
          </View>
        </View>

        {signIn.stage === 'method' ? (
          <View style={styles.doors}>
            {signIn.appleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  signIn.mode === 'create'
                    ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                    : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                // Apple draws its own door. Black on a light page, white on a
                // dark one, so it contrasts the way `accent` does.
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
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * The link is named as well as the code. `config.toml` templates only reach the
 * local stack, so a hosted project whose dashboard templates are still stock
 * sends a link and no code — and the deep link in `session.tsx` signs them in.
 */
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

const signInStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: inset.screen,
    gap: stack.group,
  },
  lockup: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  copy: {
    flex: 1,
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
