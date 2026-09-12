import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Field, Message, Screen } from '@/components/ui';
import {
  GOOGLE_SIGN_IN_ENABLED,
  isAppleSignInAvailable,
  sendEmailCode,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
} from '@/lib/auth';
import { inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

type Stage = 'email' | 'code';

export default function SignIn() {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const styles = useThemedStyles(signInStyles);

  useEffect(() => {
    isAppleSignInAvailable()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      // A cancelled Apple sheet is a normal outcome, not an error worth showing.
      if (e instanceof Error && 'code' in e && e.code === 'ERR_REQUEST_CANCELED') return;
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>Graham</Text>
          <Text style={styles.tagline}>Vintage watches, one swipe at a time.</Text>
        </View>

        <View style={styles.form}>
          {stage === 'email' ? (
            <>
              <Field
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
              />
              <Button
                label="Email me a code"
                loading={busy}
                disabled={!email.includes('@')}
                onPress={() =>
                  run(async () => {
                    await sendEmailCode(email);
                    setStage('code');
                  })
                }
              />
            </>
          ) : (
            <>
              <Message text={`We sent a 6-digit code to ${email}.`} />
              <Field
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                style={styles.codeField}
              />
              <Button
                label="Sign in"
                loading={busy}
                disabled={code.length < 6}
                onPress={() => run(() => verifyEmailCode(email, code))}
              />
              <Button
                label="Use a different email"
                variant="ghost"
                onPress={() => {
                  setStage('email');
                  setCode('');
                  setError(null);
                }}
              />
            </>
          )}

          {error ? <Message text={error} tone="error" /> : null}
        </View>

        {/* An "or" rule with nothing under it reads as a broken screen, so the
            whole block waits until at least one provider can actually run. */}
        {stage === 'email' && (appleAvailable || GOOGLE_SIGN_IN_ENABLED) ? (
          <View style={styles.form}>
            <View style={styles.divider}>
              <View style={styles.rule} />
              <Text style={styles.dividerLabel}>or</Text>
              <View style={styles.rule} />
            </View>

            {appleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={radius.md}
                style={styles.appleButton}
                onPress={() => run(signInWithApple)}
              />
            ) : null}

            {GOOGLE_SIGN_IN_ENABLED ? (
              <Button
                label="Continue with Google"
                variant="secondary"
                onPress={() => run(signInWithGoogle)}
              />
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const signInStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: inset.screen,
    gap: stack.section,
  },
  header: {
    gap: stack.tight,
  },
  wordmark: {
    ...type.wordmark,
    color: theme.color.text,
  },
  tagline: {
    ...type.body,
    color: theme.color.textMuted,
  },
  form: {
    gap: stack.related,
  },
  codeField: {
    // A code is read back digit by digit, so give it room to breathe.
    letterSpacing: 8,
    textAlign: 'center' as const,
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
  appleButton: {
    height: size.appleButton,
  },
});
