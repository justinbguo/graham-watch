import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Eyebrow, Field, Message, Screen } from '@/components/ui';
import { useSaved } from '@/data/listings';
import {
  brandsEqual,
  fullName,
  useProfile,
  useUpdateProfile,
} from '@/data/profile';
import { useFacets } from '@/data/search';
import { BrandChip } from '@/features/profile/BrandChip';
import { signOut } from '@/lib/auth';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemeContext, useThemedStyles, type ThemePreference } from '@/providers/theme';

const APPEARANCE: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function Profile() {
  const { session, userId } = useSession();
  const { data: saved = [] } = useSaved(userId);
  const { data: profile } = useProfile(userId);
  const { data: facets = [] } = useFacets();
  const update = useUpdateProfile(userId);
  const { preference, setPreference } = useThemeContext();
  const styles = useThemedStyles(profileStyles);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [brands, setBrands] = useState<string[]>([]);

  // Seed from the profile once it arrives, and again after a successful save
  // so the form matches what dealers and the deck will see.
  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name ?? '');
    setLastName(profile.last_name ?? '');
    setBrands(profile.favorite_brands ?? []);
  }, [profile]);

  const brandFacets = facets.filter((facet) => facet.kind === 'brand');
  const named = Boolean(firstName.trim() && lastName.trim());
  const dirty =
    firstName.trim() !== (profile?.first_name ?? '').trim() ||
    lastName.trim() !== (profile?.last_name ?? '').trim() ||
    !brandsEqual(brands, profile?.favorite_brands ?? []);

  const toggle = (value: string) =>
    setBrands((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    );

  return (
    <Screen title="Profile">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.identity}>
          <Eyebrow>Signed in as</Eyebrow>
          <Text style={styles.email}>
            {fullName(profile) ?? session?.user.email ?? 'Signed in'}
          </Text>
          {session?.user.email ? <Message text={session.user.email} /> : null}
          <Message text={`${saved.length} watch${saved.length === 1 ? '' : 'es'} saved`} />
        </View>

        <View style={styles.section}>
          <Eyebrow>Your name</Eyebrow>
          <Message text="Dealers see this when you ask about a watch." />
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

        <View style={styles.section}>
          <Eyebrow>Brands you follow</Eyebrow>
          <Message text="Watches from these come up first on the deck. Everything else still shows." />
          <View style={styles.chips}>
            {brandFacets.map((facet) => (
              <BrandChip
                key={facet.value}
                label={facet.label}
                count={facet.count}
                selected={brands.includes(facet.value)}
                onPress={() => toggle(facet.value)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Eyebrow>Appearance</Eyebrow>
          <View style={styles.segmented}>
            {APPEARANCE.map((option) => {
              const isActive = preference === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setPreference(option.value)}
                  style={[styles.segment, isActive && styles.segmentActive]}>
                  <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {update.error ? <Message text={update.error.message} tone="error" /> : null}

        <View style={styles.footer}>
          <Button
            label="Save changes"
            disabled={!dirty || !named}
            loading={update.isPending}
            onPress={() =>
              update.mutate({ firstName, lastName, favoriteBrands: brands })
            }
          />
          <Button label="Sign out" variant="secondary" onPress={() => signOut()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const profileStyles = (theme: Theme) => ({
  body: {
    paddingHorizontal: inset.screen,
    paddingBottom: inset.screen,
    gap: stack.section,
  },
  identity: {
    gap: stack.tight,
  },
  email: {
    ...type.title,
    color: theme.color.text,
  },
  section: {
    gap: stack.related,
  },
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  segmented: {
    flexDirection: 'row' as const,
    backgroundColor: theme.color.surfaceSunken,
    borderRadius: radius.md,
    padding: space.xs,
    gap: space.xs,
  },
  segment: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: space.md,
    borderRadius: radius.sm,
  },
  segmentActive: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  segmentLabel: {
    ...type.label,
    color: theme.color.textMuted,
  },
  segmentLabelActive: {
    color: theme.color.text,
  },
  footer: {
    gap: stack.related,
  },
});
