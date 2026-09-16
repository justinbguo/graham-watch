import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, ChoiceRow, Eyebrow, Message, Screen, Spinner } from '@/components/ui';
import { useCompleteOnboarding, useProfile } from '@/data/profile';
import { useFacets } from '@/data/search';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { NameStep } from './NameStep';
import { onboardingStyles } from './styles';

type Step = 'name' | 'brands';

export function BuyerFlow() {
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);
  const { data: facets = [], isPending: loadingBrands, error: brandsError } = useFacets();
  const complete = useCompleteOnboarding(userId);
  const styles = useThemedStyles(onboardingStyles);

  const [step, setStep] = useState<Step>('name');
  // Apple and Google give us a name on first sign-in. Prefilling it means most
  // people confirm rather than type.
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [brands, setBrands] = useState<string[]>([]);

  const brandFacets = facets.filter((facet) => facet.kind === 'brand');

  const toggle = (value: string) =>
    setBrands((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    );

  if (step === 'name') {
    return (
      <NameStep
        step="Step 1 of 2"
        detail="Dealers see this name when you ask about a watch."
        firstName={firstName}
        lastName={lastName}
        onChangeFirst={setFirstName}
        onChangeLast={setLastName}
        onContinue={() => setStep('brands')}
      />
    );
  }

  return (
    <Screen>
      <View style={styles.body}>
        <View style={styles.header}>
          <Eyebrow>Step 2 of 2</Eyebrow>
          <Text style={styles.heading}>Which brands do you love?</Text>
          <Message text="Watches from these come up first. Everything else still shows." />
        </View>

        {/* The brands on offer are the ones some approved dealer actually
            stocks, so an empty list is a real state on a new deployment. Left
            blank it reads as a screen that failed to load. */}
        {loadingBrands ? (
          <View style={styles.insteadOfList}>
            <Spinner />
          </View>
        ) : brandsError ? (
          <View style={styles.insteadOfList}>
            <Message text={brandsError.message} tone="error" />
          </View>
        ) : brandFacets.length ? (
          <ScrollView contentContainerStyle={styles.brands}>
            {brandFacets.map((facet) => (
              <ChoiceRow
                key={facet.value}
                label={facet.label}
                count={facet.count}
                selected={brands.includes(facet.value)}
                onPress={() => toggle(facet.value)}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.insteadOfList}>
            <Message text="No brands to pick from yet — no dealer's watches have been approved. This only sets the order of your deck, so nothing is lost." />
          </View>
        )}

        {complete.error ? <Message text={complete.error.message} tone="error" /> : null}

        <View style={styles.actions}>
          {/* No minimum. Someone who wants to see everything in the order we
              found it should not have to invent a preference to get past here. */}
          <Button
            label={brands.length ? 'Start swiping' : 'Skip for now'}
            loading={complete.isPending}
            onPress={() =>
              complete.mutate({
                firstName,
                lastName,
                favoriteBrands: brands,
                accountType: 'buyer',
              })
            }
          />
          <Button label="Back" variant="ghost" onPress={() => setStep('name')} />
        </View>
      </View>
    </Screen>
  );
}
