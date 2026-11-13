import { router } from 'expo-router';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';

import { SegmentedChoice } from '@/components/SegmentedChoice';
import { Button, CloseButton, Divider, Eyebrow, Message, Screen } from '@/components/ui';
import { useDeleteAccount, useProfile } from '@/data/profile';
import { useFacets } from '@/data/search';
import { AccountName } from '@/features/profile/AccountName';
import { SubscriptionSettings } from '@/features/subscriptions/SubscriptionSettings';
import { signOut } from '@/lib/auth';
import { inset, stack, type, type Theme } from '@/lib/theme';
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
  const remove = useDeleteAccount(userId);
  const styles = useThemedStyles(settingsStyles);

  const favorites = (profile?.favorite_brands ?? []).map(
    (key) => facets.find((facet) => facet.kind === 'brand' && facet.value === key)?.label ?? key
  );

  return (
    <Screen title="Settings" action={<CloseButton onPress={() => router.back()} />} inSheet>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.section}>
          <Eyebrow>Account</Eyebrow>
          <AccountName />
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

        <SubscriptionSettings />

        <Divider />
        <View style={styles.section}>
          <Eyebrow>Appearance</Eyebrow>
          <SegmentedChoice
            label="Appearance"
            value={preference}
            options={APPEARANCE}
            onChange={setPreference}
          />
        </View>

        <Divider />
        <Button label="Sign out" variant="outline" onPress={() => signOut()} />
        {remove.error ? <Message text={remove.error.message} /> : null}
        <Button
          label="Delete account"
          variant="ghost"
          loading={remove.isPending}
          onPress={() => {
            const title = 'Delete account?';
            const message =
              'This removes your profile, wishlist, and inquiries. A shop you claimed stays listed and becomes unclaimed.';
            const confirm = () => remove.mutate();
            // Alert.alert on web is a single OK box; a mouse has no system sheet.
            if (Platform.OS === 'web') {
              if (globalThis.confirm(`${title} ${message}`)) confirm();
              return;
            }
            Alert.alert(title, message, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete account', style: 'destructive', onPress: confirm },
            ]);
          }}
        />
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
});
