import { useRef } from 'react';
import { View, type TextInput } from 'react-native';

import { Button } from '@/components/ui';
import { useThemedStyles } from '@/providers/theme';

import { useFocusOnShow } from './focus';
import { LineField } from './LineField';
import { StepShell } from './StepShell';
import { onboardingStyles } from './styles';

/**
 * Both doors open with a name. A buyer's signs the inquiry a dealer answers;
 * a dealer's tells an operator who they are talking to. The role is not known
 * yet, so the copy covers both.
 */
export function NameStep({
  firstName,
  lastName,
  onChangeFirst,
  onChangeLast,
  onContinue,
}: {
  firstName: string;
  lastName: string;
  onChangeFirst: (value: string) => void;
  onChangeLast: (value: string) => void;
  onContinue: () => void;
}) {
  const styles = useThemedStyles(onboardingStyles);
  const firstNameRef = useFocusOnShow();
  const lastNameRef = useRef<TextInput>(null);
  const named = Boolean(firstName.trim() && lastName.trim());

  return (
    <StepShell
      heading="What should we call you?"
      detail="Dealers see this name when you ask about a watch."
      actions={<Button label="Continue" disabled={!named} onPress={onContinue} />}>
      <View style={styles.lines}>
        <LineField
          ref={firstNameRef}
          value={firstName}
          onChangeText={onChangeFirst}
          placeholder="First name"
          autoComplete="given-name"
          textContentType="givenName"
          autoCapitalize="words"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => lastNameRef.current?.focus()}
        />
        <LineField
          ref={lastNameRef}
          value={lastName}
          onChangeText={onChangeLast}
          placeholder="Last name"
          autoComplete="family-name"
          textContentType="familyName"
          autoCapitalize="words"
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            if (named) onContinue();
          }}
        />
      </View>
    </StepShell>
  );
}
