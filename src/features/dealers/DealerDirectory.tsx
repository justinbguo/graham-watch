import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { VerifiedMark } from '@/components/VerifiedMark';
import { Message } from '@/components/ui';
import { useDealerDirectory, type DirectoryDealer } from '@/data/dealers';
import { FollowDealer } from '@/features/dealers/FollowDealer';
import { dealerPicture } from '@/features/dealers/picture';
import { useOpenStack } from '@/lib/openStack';
import { HIT_TARGET, layout, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * Every approved shop, under Community's "How deals work" on desktop web.
 * The name opens the shop. Follow is a sibling button: one control inside
 * the other is invalid on the web, and one tap would do both.
 */
export function DealerDirectory() {
  const theme = useTheme();
  const styles = useThemedStyles(directoryStyles);
  const open = useOpenStack();
  const { data: dealers = [], isPending, error } = useDealerDirectory();

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Dealers</Text>
      {isPending ? (
        <ActivityIndicator color={theme.color.textMuted} />
      ) : error ? (
        <Message text="Shops did not load." />
      ) : (
        <FlatList
          data={dealers}
          keyExtractor={(shop) => shop.id}
          style={styles.list}
          contentContainerStyle={dealers.length === 0 ? styles.empty : undefined}
          ListEmptyComponent={<Message text="No shops yet." />}
          renderItem={({ item }) => <DealerRow shop={item} onOpen={openShop(open, item)} />}
        />
      )}
    </View>
  );
}

function openShop(
  open: ReturnType<typeof useOpenStack>,
  shop: DirectoryDealer,
) {
  return () => open('dealer/[dealerId]', { dealerId: shop.id }, `/dealer/${shop.id}`);
}

function DealerRow({ shop, onOpen }: { shop: DirectoryDealer; onOpen: () => void }) {
  const styles = useThemedStyles(directoryStyles);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${shop.name}, verified`}
        onPress={onOpen}
        style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
        <Avatar url={shop.logo_url} px={size.iconSmall} fit="contain" fallback={dealerPicture} />
        <Text style={styles.name} numberOfLines={1}>
          {shop.name}
        </Text>
        <VerifiedMark px={size.iconSmall} />
      </Pressable>
      <View>
        <FollowDealer dealer={shop} compact />
      </View>
    </View>
  );
}

const directoryStyles = (theme: Theme) => ({
  section: {
    flex: 1,
    minHeight: 0,
    width: layout.communityRail,
    marginTop: space.sm,
    paddingTop: space.md,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  heading: {
    ...type.label,
    color: theme.color.textMuted,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  empty: {
    paddingTop: space.sm,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: HIT_TARGET,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  open: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.72,
  },
  name: {
    ...type.labelStrong,
    color: theme.color.text,
    flexShrink: 1,
  },
});
