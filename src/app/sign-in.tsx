import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';

import { Button, Field, Message, Screen } from '@/components/ui';
import { useSignIn } from '@/features/auth/email';
import { rememberRole, type AccountRole } from '@/features/auth/role';
import { HIT_TARGET, inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const TAGLINE: Record<AccountRole, string> = {
  buyer: 'Find the watch. Meet the dealer.',
  dealer: 'Put your window in front of people who collect.',
};

export default function SignIn() {
  const signIn = useSignIn();
  const styles = useThemedStyles(signInStyles);
  const [role, setRole] = useState<AccountRole | null>(null);

  /**
   * Stashed before the session exists, because the account it belongs on does
   * not exist yet. Onboarding picks it up; if the stash is gone it asks.
   */
  const choose = (next: AccountRole) => {
    setRole(next);
    void rememberRole(next);
  };

  if (!role) return <RoleChoice onChoose={choose} />;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>Graham</Text>
          <View style={styles.wordmarkRule} />
          <Text style={styles.tagline}>{TAGLINE[role]}</Text>
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

          {signIn.stage === 'email' ? (
            <Button
              label={role === 'dealer' ? "I'm buying, not selling" : 'I sell watches'}
              variant="ghost"
              onPress={() => choose(role === 'dealer' ? 'buyer' : 'dealer')}
            />
          ) : null}
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

/**
 * The fork. One sign-in behind it, not two: Auth links identities by verified
 * email and the shop claim turns on `email_confirmed_at`, so a second auth
 * surface would be a second place for the redirect allow-list and the code flow
 * to drift out of step.
 *
 * What the choice buys is the next screen, not a different account.
 */
function RoleChoice({ onChoose }: { onChoose: (role: AccountRole) => void }) {
  const styles = useThemedStyles(signInStyles);

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>Graham</Text>
          <View style={styles.wordmarkRule} />
          <Text style={styles.tagline}>Vintage watches, and the people who sell them.</Text>
        </View>

        <View style={styles.form}>
          <RoleCard
            title="I'm looking for a watch"
            detail="Swipe a deck of vintage watches and write to the dealer when one is right."
            onPress={() => onChoose('buyer')}
          />
          <RoleCard
            title="I sell watches"
            detail="List your shop's stock and answer buyers directly. No fee and no commission."
            onPress={() => onChoose('dealer')}
          />
        </View>
      </View>
    </Screen>
  );
}

function RoleCard({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(signInStyles);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.roleCard, pressed && styles.pressed]}>
      <Text style={styles.roleTitle}>{title}</Text>
      <Text style={styles.roleDetail}>{detail}</Text>
    </Pressable>
  );
}

/**
 * The link is named as well as the code. `config.toml` templates only reach the
 * local stack, so a hosted project whose dashboard templates are still stock
 * sends a link and no code — and the deep link in `session.tsx` signs them in.
 */
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
  roleCard: {
    borderRadius: radius.md,
    padding: inset.card,
    minHeight: HIT_TARGET,
    gap: stack.tight,
    backgroundColor: theme.color.surface,
  },
  roleTitle: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  roleDetail: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  pressed: {
    opacity: 0.72,
  },
});
