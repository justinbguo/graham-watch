import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Eyebrow, Message, Screen } from '@/components/ui';
import { useCompleteOnboarding, useProfile } from '@/data/profile';
import { ShopIntake } from '@/features/dealers/ShopIntake';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { NameStep } from './NameStep';
import { onboardingStyles } from './styles';

type Step = 'name' | 'shop';

/**
 * A dealer's runway: who they are, then which shop is theirs.
 *
 * No favourite brands. Those rank a buyer's deck, and the brands a dealer cares
 * about here are the ones they stock — a different question, asked on the
 * application.
 *
 * The shop step renders the same ShopIntake the app uses later, so a dealer who
 * skips it finds the identical screen on Profile rather than a second version
 * of it.
 */
export function DealerFlow() {
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);
  const complete = useCompleteOnboarding(userId);
  const styles = useThemedStyles(onboardingStyles);

  const [step, setStep] = useState<Step>('name');
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');

  // Onboarding ends here either way. A dealer waiting on an operator still gets
  // the app as a buyer, so holding them on this screen would buy nothing.
  const finish = () =>
    complete.mutate({
      firstName,
      lastName,
      favoriteBrands: [],
      accountType: 'dealer',
    });

  if (step === 'name') {
    return (
      <NameStep
        step="Step 1 of 2"
        detail="We use this when we write to you about your shop."
        firstName={firstName}
        lastName={lastName}
        onChangeFirst={setFirstName}
        onChangeLast={setLastName}
        onContinue={() => setStep('shop')}
      />
    );
  }

  return (
    <Screen>
      <View style={styles.body}>
        <View style={styles.header}>
          <Eyebrow>Step 2 of 2</Eyebrow>
          <Text style={styles.heading}>Which shop is yours?</Text>
          <Message text="If we already list it you can claim it now. If we do not, tell us about it." />
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <ShopIntake onDone={finish} />
        </ScrollView>

        {complete.error ? <Message text={complete.error.message} tone="error" /> : null}

        <View style={styles.actions}>
          <Button
            label="I will do this later"
            variant="ghost"
            loading={complete.isPending}
            onPress={finish}
          />
          <Button label="Back" variant="ghost" onPress={() => setStep('name')} />
        </View>
      </View>
    </Screen>
  );
}
