import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Message, Screen } from '@/components/ui';
import {
  isAppleSignInAvailable,
  sendEmailCode,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
} from '@/lib/auth';
import { theme } from '@/lib/theme';

type Stage = 'email' | 'code';

export default function SignIn() {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              />
              <Button
                label="Sign in"
                loading={busy}
                disabled={code.length < 6}
                onPress={() => run(() => verifyEmailCode(email, code))}
              />
              <Button
                label="Use a different email"
                variant="secondary"
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

        {stage === 'email' ? (
          <View style={styles.form}>
            <View style={styles.divider}>
              <View style={styles.rule} />
              <Text style={styles.dividerLabel}>or</Text>
              <View style={styles.rule} />
            </View>

            {isAppleSignInAvailable() ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={theme.radius}
                style={styles.appleButton}
                onPress={() => run(signInWithApple)}
              />
            ) : null}

            <Button
              label="Continue with Google"
              variant="secondary"
              onPress={() => run(signInWithGoogle)}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.space(3),
    gap: theme.space(4),
  },
  header: {
    gap: theme.space(1),
  },
  wordmark: {
    fontSize: 40,
    fontWeight: '700',
    color: theme.color.text,
  },
  tagline: {
    fontSize: 16,
    color: theme.color.muted,
  },
  form: {
    gap: theme.space(1.5),
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: theme.color.border,
  },
  dividerLabel: {
    color: theme.color.muted,
    fontSize: 13,
  },
  appleButton: {
    height: 52,
  },
});
