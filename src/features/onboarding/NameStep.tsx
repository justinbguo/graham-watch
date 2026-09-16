import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Eyebrow, Field, Message, Screen } from '@/components/ui';
import { useThemedStyles } from '@/providers/theme';

import { onboardingStyles } from './styles';

/**
 * Both flows open with a name, so both read it from here. What the name is
 * *for* differs — a buyer's signs the inquiry a dealer answers, a dealer's
 * tells an operator who they are talking to — so the caller supplies the copy.
 */
export function NameStep({
  step,
  detail,
  firstName,
  lastName,
  onChangeFirst,
  onChangeLast,
  onContinue,
}: {
  step: string;
  detail: string;
  firstName: string;
  lastName: string;
  onChangeFirst: (value: string) => void;
  onChangeLast: (value: string) => void;
  onContinue: () => void;
}) {
  const styles = useThemedStyles(onboardingStyles);
  const named = Boolean(firstName.trim() && lastName.trim());

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Eyebrow>{step}</Eyebrow>
          <Text style={styles.heading}>What should we call you?</Text>
          <Message text={detail} />
        </View>

        <View style={styles.form}>
          <Field
            value={firstName}
            onChangeText={onChangeFirst}
            placeholder="First name"
            autoComplete="given-name"
            textContentType="givenName"
            autoCapitalize="words"
          />
          <Field
            value={lastName}
            onChangeText={onChangeLast}
            placeholder="Last name"
            autoComplete="family-name"
            textContentType="familyName"
            autoCapitalize="words"
          />
        </View>

        <View style={styles.actions}>
          <Button label="Continue" disabled={!named} onPress={onContinue} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
