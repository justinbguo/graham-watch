import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Field, Message } from '@/components/ui';
import { Wordmark } from '@/components/Wordmark';
import { useSignIn, type SignInMode } from '@/features/auth/email';
import { GoogleButton } from '@/features/auth/GoogleButton';
import { SignInOption } from '@/features/auth/SignInOption';
import { GiveFeedback } from '@/features/feedback/GiveFeedback';
import { inset, layout, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const DOOR: Record<SignInMode, string> = {
  create: 'Create account with',
  login: 'Log in with',
};

const SWITCH: Record<SignInMode, string> = {
  create: 'Already have an account? Log in',
  login: 'New to Graham? Create an account',
};

const TAGLINE =
  'The best vintage watch dealers for a very passionate collector.';

/**
 * The doors themselves. Used as a sheet over the deck (guest browsing) and as
 * the full sign-in surface when the stack still needs one.
 */
export function SignInPanel({
  reason,
  footer,
  presentation = 'default',
}: {
  /** Why the sheet opened — budget is the ten-swipe gate. */
  reason?: 'budget' | 'action';
  footer?: ReactNode;
  /** Web modal: centered lockup and larger tagline; shell owns the close control. */
  presentation?: 'default' | 'modal';
}) {
  const signIn = useSignIn();
  const styles = useThemedStyles(panelStyles);
  const modal = presentation === 'modal';
  const tagline =
    reason === 'budget'
      ? 'Sign in to keep swiping, save watches, and message dealers.'
      : TAGLINE;

  const body = (
    <>
      <View style={[styles.copy, modal && styles.copyModal]}>
        <Wordmark variant={modal ? 'headerText' : 'signIn'} />
        <Text style={[styles.tagline, modal && styles.taglineModal]}>{tagline}</Text>
      </View>

      <SignInDoors signIn={signIn} modal={modal} />
      {modal ? null : <GiveFeedback placement="plain" />}
      {footer}
    </>
  );

  if (modal) {
    return <View style={styles.modalBody}>{body}</View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}
    </KeyboardAvoidingView>
  );
}

function SignInDoors({
  signIn,
  modal,
}: {
  signIn: ReturnType<typeof useSignIn>;
  modal: boolean;
}) {
  const styles = useThemedStyles(panelStyles);
  const theme = useTheme();
  const web = Platform.OS === 'web';
  const doorPrefix = web ? 'Continue with' : DOOR[signIn.mode];

  return (
    <>
      {signIn.stage === 'method' ? (
        <View style={styles.doors}>
          {!web && signIn.appleAvailable ? (
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
          ) : null}

          {!web && !signIn.appleAvailable ? (
            <SignInOption
              label={`${DOOR[signIn.mode]} Apple`}
              disabled={signIn.busy}
              onPress={signIn.signInWithAppleWeb}
              mark={<DoorMark name="apple" color={theme.color.text} />}
            />
          ) : null}

          {signIn.googleEnabled ? (
            <GoogleButton
              label={`${doorPrefix} Google`}
              disabled={signIn.busy}
              onPress={signIn.signInWithGoogle}
            />
          ) : null}

          <SignInOption
            label={`${doorPrefix} email`}
            disabled={signIn.busy}
            onPress={signIn.chooseEmail}
            mark={<DoorMark name="email-outline" color={theme.color.text} />}
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
          <Button
            label={signIn.resendIn > 0 ? `Resend code in ${formatWait(signIn.resendIn)}` : 'Resend code'}
            variant="ghost"
            disabled={signIn.busy || signIn.resendIn > 0}
            onPress={signIn.sendCode}
          />
          <Button label="Use a different email" variant="ghost" onPress={signIn.back} />
        </View>
      ) : null}

      {signIn.error ? <Message text={signIn.error} tone="error" /> : null}

      {!web && signIn.stage !== 'code' ? (
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
  return `Enter the six digit code we sent to ${signIn.email}. The link in that email signs you in.`;
}

function formatWait(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

const panelStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    justifyContent: 'center' as const,
    gap: stack.group,
    paddingHorizontal: inset.screen,
  },
  modalBody: {
    gap: space.lg,
  },
  copy: {
    alignItems: 'flex-start' as const,
    gap: stack.tight,
  },
  copyModal: {
    alignItems: 'center' as const,
    alignSelf: 'stretch' as const,
    gap: space.sm,
  },
  tagline: {
    ...type.body,
    alignSelf: 'stretch' as const,
    color: theme.color.textMuted,
  },
  taglineModal: {
    ...type.editorial,
    alignSelf: 'center' as const,
    maxWidth: layout.signInLede,
    color: theme.color.text,
    textAlign: 'center' as const,
  },
  doors: {
    gap: stack.related,
  },
  form: {
    gap: stack.related,
  },
  apple: {
    width: '100%' as const,
    height: size.controlMin,
  },
});
