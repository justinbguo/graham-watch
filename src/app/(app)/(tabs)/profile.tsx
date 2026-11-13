import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { Eyebrow, Message, Screen } from '@/components/ui';
import { GuestGate } from '@/features/auth/GuestGate';
import { ApplicationStatusCard } from '@/features/dealers/ApplicationStatusCard';
import { ClaimDealerCard } from '@/features/dealers/DealerShopCard';
import { DealerShopEditor } from '@/features/dealers/DealerShopEditor';
import { useDealerWorkspace } from '@/features/dealers/workspace';
import { ProfileHeader } from '@/features/profile/ProfileHeader';
import { SavedStrip } from '@/features/profile/SavedStrip';
import { FollowingList } from '@/features/profile/FollowingList';
import { Posts } from '@/features/profile/Posts';
import { useOpenStack } from '@/lib/openStack';
import { HIT_TARGET, inset, size, space, stack, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useTheme, useThemedStyles } from '@/providers/theme';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Profile() {
  const { isSignedIn } = useSession();
  const shop = useDealerWorkspace();
  const open = useOpenStack();
  const styles = useThemedStyles(profileStyles);

  if (!isSignedIn) {
    return (
      <GuestGate
        title="Profile"
        message="Sign in to set up your collector profile."
      />
    );
  }
  const claimed = shop.shop;

  return (
    <Screen
      title="Profile"
      action={<SettingsButton onPress={() => open('settings', undefined, '/settings')} />}
      width="dealSheet"
      inTabs>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <ProfileHeader />
        {claimed ? (
          <View style={styles.section}>
            <DealerShopEditor dealerId={claimed.id} totals={shop.totals} />
            {shop.error ? <Message text={shop.error.message} tone="error" /> : null}
          </View>
        ) : shop.claimable ? (
          <View style={styles.section}>
            <Eyebrow>Your shop</Eyebrow>
            <ClaimDealerCard dealer={shop.claimable} />
          </View>
        ) : shop.application ? (
          <View style={styles.section}>
            <Eyebrow>Your application</Eyebrow>
            <ApplicationStatusCard
              application={shop.application}
              onFinishVerifying={() => open('apply', undefined, '/apply')}
            />
          </View>
        ) : null}
        <Posts
          onOpen={(id) => router.navigate({ pathname: '/community', params: { post: id } })}
          onCreate={() => router.navigate({ pathname: '/community', params: { compose: '1' } })}
        />
        <SavedStrip />
        <FollowingList />
      </ScrollView>
    </Screen>
  );
}

function SettingsButton({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(profileStyles);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open settings"
      onPress={onPress}
      style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}>
      <MaterialCommunityIcons name="cog-outline" size={size.icon} color={theme.color.text} />
    </Pressable>
  );
}

const profileStyles = (theme: Theme) => ({
  scroll: {
    flex: 1,
    marginTop: space.md - space.lg,
  },
  content: {
    paddingHorizontal: inset.screen,
    paddingBottom: inset.screen,
    gap: stack.group,
  },
  section: {
    gap: stack.related,
  },
  settingsButton: {
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pressed: {
    opacity: 0.72,
  },
});
