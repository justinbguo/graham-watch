import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { VerifiedMark } from '@/components/VerifiedMark';
import { Message } from '@/components/ui';
import { useDealerDirectory, type DirectoryDealer } from '@/data/dealers';
import { FollowDealer } from '@/features/dealers/FollowDealer';
import { dealerPicture } from '@/features/dealers/picture';
import { HIT_TARGET, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * Every approved shop, under Filters on the desktop Buy rail.
 * The name scopes the deck to that shop. Follow is a sibling button: one
 * control inside the other is invalid on the web, and one tap would do both.
 */
export function DealerDirectory({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (dealerId: string) => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(directoryStyles);
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
          renderItem={({ item }) => (
            <DealerRow
              shop={item}
              selected={item.id === selectedId}
              onSelect={() => onSelect(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

function DealerRow({
  shop,
  selected,
  onSelect,
}: {
  shop: DirectoryDealer;
  selected: boolean;
  onSelect: () => void;
}) {
  const styles = useThemedStyles(directoryStyles);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${shop.name}, verified`}
        accessibilityState={{ selected }}
        onPress={onSelect}
        style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
        <Avatar url={shop.logo_url} px={size.iconSmall} fit="contain" fallback={dealerPicture} />
        <Text style={[styles.name, selected && styles.nameSelected]} numberOfLines={1}>
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
    alignSelf: 'stretch' as const,
    // Same inset as the rail's buttons, so names do not sit on the window edge.
    paddingHorizontal: space.md,
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
  nameSelected: {
    color: theme.color.brass,
  },
});
