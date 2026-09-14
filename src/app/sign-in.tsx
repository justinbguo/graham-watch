import * as AppleAuthentication from 'expo-apple-authentication';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Field, Message, Screen } from '@/components/ui';
import { useSignIn } from '@/features/auth/email';
import { inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export default function SignIn() {
  const signIn = useSignIn();
  const styles = useThemedStyles(signInStyles);

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>Graham</Text>
          <View style={styles.wordmarkRule} />
          <Text style={styles.tagline}>Find the watch. Meet the dealer.</Text>
        </View>

        <View style={styles.form}>
          {signIn.stage === 'email' ? (
            <>
              <Field
                value={signIn.email}
                onChangeText={signIn.setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
              />
              <Button
                label="Email me a sign-in code"
                loading={signIn.busy}
                disabled={!signIn.email.includes('@')}
                onPress={signIn.sendCode}
              />
            </>
          ) : (
            <>
              <Button label="Back to email" variant="ghost" onPress={signIn.backToEmail} />
              <Message text={codeMessage(signIn)} />
              <Field
                accessibilityLabel="Sign-in code"
                value={signIn.code}
                onChangeText={signIn.setCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
              />
              <Button
                label="Sign in"
                loading={signIn.busy}
                disabled={signIn.code.trim().length !== 6}
                onPress={signIn.submitCode}
              />
            </>
          )}

          {signIn.error ? <Message text={signIn.error} tone="error" /> : null}
        </View>

        {signIn.stage === 'email' && (signIn.appleAvailable || signIn.googleEnabled) ? (
          <View style={styles.form}>
            <View style={styles.divider}>
              <View style={styles.rule} />
              <Text style={styles.dividerLabel}>or</Text>
              <View style={styles.rule} />
            </View>

            {signIn.appleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={radius.md}
                style={styles.appleButton}
                onPress={signIn.signInWithApple}
              />
            ) : null}

            {signIn.googleEnabled ? (
              <Button
                label="Continue with Google"
                variant="outline"
                onPress={signIn.signInWithGoogle}
              />
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function codeMessage(signIn: ReturnType<typeof useSignIn>): string {
  if (signIn.readingInbox) {
    return `Reading the local inbox for ${signIn.email}.`;
  }
  return `Enter the six digit code we sent to ${signIn.email}.`;
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
  wordmarkRule: {
    width: space.xxl,
    height: 1,
    backgroundColor: theme.color.brass,
  },
  tagline: {
    ...type.editorial,
    color: theme.color.textMuted,
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
  appleButton: {
    height: size.appleButton,
  },
});
