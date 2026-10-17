import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { Spinner } from '@/components/ui';
import type { WatchCatalogHit } from '@/data/watchCatalog';
import { useSuggestWatches } from '@/data/watchCatalog';
import { radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * Tappable hits under a model or reference field. Choosing one fills brand,
 * family, and reference on the listing draft.
 */
export function WatchModelSuggest({
  query,
  brand,
  onPick,
}: {
  query: string;
  brand?: string;
  onPick: (hit: WatchCatalogHit) => void;
}) {
  const styles = useThemedStyles(suggestStyles);
  const suggest = useSuggestWatches(query, brand);
  const term = query.trim();

  if (term.length < 2) return null;
  if (suggest.isPending) {
    return (
      <View style={styles.pending}>
        <Spinner />
      </View>
    );
  }
  if (suggest.isError || !suggest.data?.length) return null;

  return (
    <View style={styles.list}>
      {suggest.data.map((hit) => (
        <Pressable
          key={hit.id}
          accessibilityRole="button"
          accessibilityLabel={`${hit.brand_name} ${hit.series_name} ${hit.reference_number ?? ''}`}
          onPress={() => onPick(hit)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          {hit.thumbnail_url ? (
            <Image source={{ uri: hit.thumbnail_url }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={styles.thumbPlaceholder} />
          )}
          <View style={styles.copy}>
            <Text style={styles.line} numberOfLines={1}>
              {hit.brand_name} · {hit.series_name}
            </Text>
            <Text style={styles.detail} numberOfLines={2}>
              {hit.reference_number ? `${hit.reference_number} — ` : ''}
              {hit.name}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const suggestStyles = (theme: Theme) => ({
  pending: {
    paddingVertical: space.sm,
  },
  list: {
    gap: stack.tight,
    marginTop: space.sm,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: theme.color.surface,
  },
  pressed: {
    opacity: 0.72,
  },
  thumb: {
    width: size.gridScan,
    height: size.gridScan,
    borderRadius: radius.sm,
    backgroundColor: theme.color.surfaceSunken,
  },
  thumbPlaceholder: {
    width: size.gridScan,
    height: size.gridScan,
    borderRadius: radius.sm,
    backgroundColor: theme.color.surfaceSunken,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: stack.tight,
  },
  line: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  detail: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
