import { Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { collectorLine, usernameIsValid } from '@/lib/username';
import { useThemedStyles } from '@/providers/theme';

import { useFocusOnShow } from './focus';
import { LineField } from './LineField';
import { StepShell } from './StepShell';
import { onboardingStyles } from './styles';

/**
 * Slide 2. The name above it is what a dealer reads on an inquiry. This one
 * is the account's own, unique, and checked by `claim_username` before
 * Continue leaves the slide — waiting until the last step would let two
 * people pass the same name and only one of them find out.
 */
export function UsernameStep({
  username,
  collectorNumber,
  onChange,
  busy,
  error,
  onContinue,
  onBack,
}: {
  username: string;
  /** Assigned at sign-up. Null until the profile row has loaded. */
  collectorNumber: number | null;
  onChange: (value: string) => void;
  busy: boolean;
  error?: string | null;
  onContinue: () => void;
  onBack: () => void;
}) {
  const styles = useThemedStyles(onboardingStyles);
  const fieldRef = useFocusOnShow();

  return (
    <StepShell
      heading="Create a username"
      detail="Letters, numbers, and underscores. Three to twenty characters, starting with a letter."
      error={error}
      onBack={onBack}
      backDisabled={busy}
      actions={
        <Button
          label="Continue"
          loading={busy}
          disabled={!usernameIsValid(username)}
          onPress={onContinue}
        />
      }>
      <View style={styles.usernameBlock}>
        <View style={styles.usernameRow}>
          <View style={styles.atWrap}>
            <Text style={styles.at} accessible={false}>
              @
            </Text>
          </View>
          <LineField
            ref={fieldRef}
            value={username}
            returnKeyType="done"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (usernameIsValid(username)) onContinue();
            }}
            onChangeText={(text) => onChange(text.replace(/^@+/, ''))}
            placeholder="yourname"
            accessibilityLabel="Username"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            maxLength={20}
            style={styles.usernameInput}
          />
        </View>
        {collectorNumber != null ? (
          <Text style={styles.collector}>{collectorLine(collectorNumber)}</Text>
        ) : null}
      </View>
    </StepShell>
  );
}
