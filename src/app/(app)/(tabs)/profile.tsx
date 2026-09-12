import { Pressable, Text, View } from 'react-native';

import { Button, Eyebrow, Message, Screen } from '@/components/ui';
import { useSaved } from '@/data/listings';
import { fullName, useProfile } from '@/data/profile';
import { useFacets } from '@/data/search';
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
  const { preference, setPreference } = useThemeContext();
  const styles = useThemedStyles(profileStyles);

  const name = fullName(profile);
  // favorite_brands stores brand_key; the facets carry the name a human wrote.
  const favorites = (profile?.favorite_brands ?? []).map(
    (key) => facets.find((facet) => facet.kind === 'brand' && facet.value === key)?.label ?? key
  );

  return (
    <Screen title="Profile">
      <View style={styles.body}>
        <View style={styles.identity}>
          <Eyebrow>Signed in as</Eyebrow>
          <Text style={styles.email}>{name ?? session?.user.email ?? 'Signed in'}</Text>
          {name ? <Message text={session?.user.email ?? ''} /> : null}
          <Message text={`${saved.length} watch${saved.length === 1 ? '' : 'es'} saved`} />
        </View>

        {favorites.length ? (
          <View style={styles.section}>
            <Eyebrow>Brands you follow</Eyebrow>
            <Text style={styles.favorites}>{favorites.join(' · ')}</Text>
          </View>
        ) : null}

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

        <View style={styles.footer}>
          <Button label="Sign out" variant="secondary" onPress={() => signOut()} />
        </View>
      </View>
    </Screen>
  );
}

const profileStyles = (theme: Theme) => ({
  body: {
    flex: 1,
    paddingHorizontal: inset.screen,
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
  favorites: {
    ...type.body,
    color: theme.color.textMuted,
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
    marginTop: 'auto' as const,
    paddingBottom: inset.screen,
  },
});
