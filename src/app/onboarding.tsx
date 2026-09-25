import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { Button, Eyebrow, Field, Message, Screen } from '@/components/ui';
import { useCompleteOnboarding, useProfile } from '@/data/profile';
import { useFacets } from '@/data/search';
import { BrandChip } from '@/features/profile/BrandChip';
import { inset, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

type Step = 'name' | 'brands';

export default function Onboarding() {
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);
  const { data: facets = [] } = useFacets();
  const complete = useCompleteOnboarding(userId);
  const styles = useThemedStyles(onboardingStyles);

  const [step, setStep] = useState<Step>('name');
  // Apple and Google give us a name on first sign-in. Prefilling it means most
  // people confirm rather than type.
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [brands, setBrands] = useState<string[]>([]);

  const brandFacets = facets.filter((facet) => facet.kind === 'brand');
  const named = Boolean(firstName.trim() && lastName.trim());

  const toggle = (value: string) =>
    setBrands((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    );

  const finish = () =>
    complete.mutate({ firstName, lastName, favoriteBrands: brands });

  if (step === 'name') {
    return (
      <Screen>
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <Eyebrow>Step 1 of 2</Eyebrow>
            <Text style={styles.heading}>What should we call you?</Text>
            <Message text="Dealers see this name when you ask about a watch." />
          </View>

          <View style={styles.form}>
            <Field
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              autoComplete="given-name"
              textContentType="givenName"
              autoCapitalize="words"
            />
            <Field
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              autoComplete="family-name"
              textContentType="familyName"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.actions}>
            <Button label="Continue" disabled={!named} onPress={() => setStep('brands')} />
          </View>
        </KeyboardAvoidingView>
      </Screen>
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

        <ScrollView contentContainerStyle={styles.chips}>
          {brandFacets.map((facet) => (
            <BrandChip
              key={facet.value}
              label={facet.label}
              count={facet.count}
              selected={brands.includes(facet.value)}
              onPress={() => toggle(facet.value)}
            />
          ))}
        </ScrollView>

        {complete.error ? <Message text={complete.error.message} tone="error" /> : null}

        <View style={styles.actions}>
          {/* No minimum. Someone who wants to see everything in the order we
              found it should not have to invent a preference to get past here. */}
          <Button
            label={brands.length ? 'Start swiping' : 'Skip for now'}
            loading={complete.isPending}
            onPress={finish}
          />
          <Button label="Back" variant="ghost" onPress={() => setStep('name')} />
        </View>
      </View>
    </Screen>
  );
}

const onboardingStyles = (theme: Theme) => ({
  body: {
    flex: 1,
    paddingHorizontal: inset.screen,
    paddingBottom: inset.screen,
    gap: stack.section,
  },
  header: {
    gap: stack.tight,
  },
  heading: {
    ...type.display,
    color: theme.color.text,
  },
  form: {
    gap: stack.related,
  },
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    paddingBottom: space.md,
  },
  actions: {
    marginTop: 'auto' as const,
    gap: stack.related,
  },
});
