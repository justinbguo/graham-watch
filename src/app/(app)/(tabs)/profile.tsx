import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Button, Eyebrow, Heading, Message, Screen } from '@/components/ui';
import { ApplicationStatusCard } from '@/features/dealers/ApplicationStatusCard';
import { DealerInventoryRow } from '@/features/dealers/DealerInventoryRow';
import {
  ClaimByCodeCard,
  ClaimDealerCard,
  DealerShopCard,
} from '@/features/dealers/DealerShopCard';
import { useDealerWorkspace } from '@/features/dealers/workspace';
import { ProfileHeader } from '@/features/profile/ProfileHeader';
import { SavedStrip } from '@/features/profile/SavedStrip';
import { FollowingList } from '@/features/profile/FollowingList';
import { useOpenStack } from '@/lib/openStack';
import { HIT_TARGET, inset, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Profile() {
  const shop = useDealerWorkspace();
  const claimed = shop.shop;
  const open = useOpenStack();
  const styles = useThemedStyles(profileStyles);

  const header = (
    <View style={styles.header}>
      <ProfileHeader />
      <SavedStrip />
      <FollowingList />
      {claimed ? (
        <View style={styles.section}>
          <Eyebrow>Your shop</Eyebrow>
          <DealerShopCard
            shop={claimed}
            totals={shop.totals}
            onFindWatches={(sourceUrl) =>
              open(
                'import-inventory',
                { dealerId: claimed.id, sourceUrl },
                { pathname: '/import-inventory', params: { dealerId: claimed.id, sourceUrl } }
              )
            }
          />
          {shop.error ? <Message text={shop.error.message} tone="error" /> : null}
          <View style={styles.listHeading}>
            <Text style={styles.listTitle}>Listings</Text>
            <Button label="Reload" variant="ghost" onPress={() => shop.reload()} />
          </View>
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
      ) : (
        <ClaimByCodeCard onStart={() => open('apply', undefined, '/apply')} />
      )}
    </View>
  );

  return (
    <Screen
      title="Profile"
      action={<SettingsButton onPress={() => open('settings', undefined, '/settings')} />}
      width={claimed ? 'grid' : 'reading'}
      inTabs>
      <FlatList
        data={shop.inventory}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <DealerInventoryRow
            item={item}
            busy={shop.isSaving}
            onEdit={() =>
              open('edit-listing/[listingId]', { listingId: item.id }, `/edit-listing/${item.id}`)
            }
            onTogglePublished={() => shop.togglePublished(item)}
            onToggleSold={() => shop.toggleSold(item)}
          />
        )}
        ListEmptyComponent={
          claimed && !shop.isLoading ? (
            <View style={styles.empty}>
              <Heading>No listings yet</Heading>
              <Message text="Add a product or catalogue URL above." />
            </View>
          ) : null
        }
      />
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
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: inset.screen,
    flexGrow: 1,
  },
  header: {
    gap: stack.section,
  },
  section: {
    gap: stack.related,
  },
  listHeading: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  listTitle: {
    ...type.title,
    color: theme.color.text,
  },
  separator: {
    height: 1,
    backgroundColor: theme.color.border,
  },
  empty: {
    paddingVertical: space.xxl,
    gap: stack.related,
  },
  settingsButton: {
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
  },
  pressed: {
    opacity: 0.72,
  },
});
