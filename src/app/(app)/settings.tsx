import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, CloseButton, Divider, Eyebrow, Message, Screen } from '@/components/ui';
import { useProfile } from '@/data/profile';
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

export default function SettingsScreen() {
  const { session, userId } = useSession();
  const { data: profile } = useProfile(userId);
  const { data: facets = [] } = useFacets();
  const { preference, setPreference } = useThemeContext();
  const styles = useThemedStyles(settingsStyles);

  const favorites = (profile?.favorite_brands ?? []).map(
    (key) => facets.find((facet) => facet.kind === 'brand' && facet.value === key)?.label ?? key
  );

  return (
    <Screen title="Settings" action={<CloseButton onPress={() => router.back()} />} inSheet>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.section}>
          <Eyebrow>Account</Eyebrow>
          <Message text={session?.user.email ?? 'No email available'} />
        </View>

        {favorites.length ? (
          <>
            <Divider />
            <View style={styles.section}>
              <Eyebrow>Brands you follow</Eyebrow>
              <Text style={styles.favorites}>{favorites.join(' · ')}</Text>
            </View>
          </>
        ) : null}

        <Divider />
        <View style={styles.section}>
          <Eyebrow>Appearance</Eyebrow>
          <View style={styles.segmented}>
            {APPEARANCE.map((option) => {
              const selected = preference === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setPreference(option.value)}
                  style={[styles.segment, selected && styles.segmentActive]}>
                  <Text style={[styles.segmentLabel, selected && styles.segmentLabelActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Divider />
        <Button label="Sign out" variant="outline" onPress={() => signOut()} />
      </ScrollView>
    </Screen>
  );
}

const settingsStyles = (theme: Theme) => ({
  body: {
    paddingHorizontal: inset.screen,
    paddingBottom: inset.screen,
    gap: stack.group,
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
    backgroundColor: theme.color.fill,
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
  },
  segmentLabel: {
    ...type.label,
    color: theme.color.textMuted,
  },
  segmentLabelActive: {
    color: theme.color.text,
  },
});
