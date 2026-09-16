import { Image } from 'expo-image';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Button, Centered, Heading, Message } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { HIT_TARGET, inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import type { CatalogImport, CatalogItem } from './import';

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function summarise(picker: CatalogImport): string {
  const { summary, rows } = picker;
  if (!summary) return 'Reading your shop…';

  const parts = [`Read ${plural(summary.found, 'watch', 'watches')} from your shop`];
  if (summary.adopted) parts.push(`matched ${summary.adopted} to listings you already had`);
  if (summary.retired) parts.push(`retired ${plural(summary.retired, 'watch', 'watches')} you have sold`);
  if (!summary.complete) parts.push('and stopped at the read limit — refresh again to go deeper');

  const unavailable = rows.filter((row) => !row.available).length;
  if (unavailable) parts.push(`${unavailable} are marked sold on your site`);

  return `${parts.join(', ')}.`;
}

export function ImportPreview({
  picker,
  onDone,
}: {
  picker: CatalogImport;
  onDone: () => void;
}) {
  const styles = useThemedStyles(previewStyles);
  const { rows, chosen, refreshing, error, stage, progress } = picker;

  if (stage === 'done') {
    return (
      <Centered>
        <Heading>Inventory updated</Heading>
        <Message
          text={`${plural(progress?.done ?? 0, 'watch is', 'watches are')} now in your listings. Watches you had already are kept, with any corrections you made left alone.`}
        />
        <Button label="Done" onPress={onDone} />
      </Centered>
    );
  }

  if (stage === 'publishing') {
    return (
      <Centered>
        <Heading>Adding watches</Heading>
        <Message
          text={`${progress?.done ?? 0} of ${progress?.total ?? 0} read. Each one is looked up on your site and typed, so this takes a moment for a large shop.`}
        />
        <Message text="You can leave this open. Nothing is lost if it stops early — refreshing picks up where it left off." />
      </Centered>
    );
  }

  const pending = chosen.length + refreshing.length;

  return (
    <View style={styles.body}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.intro}>
            <Message text={summarise(picker)} />
            {refreshing.length ? (
              <Message
                text={`${plural(refreshing.length, 'watch has', 'watches have')} changed on your site and will be updated.`}
              />
            ) : null}
            {rows.some((row) => !row.listed && row.available) ? (
              <View style={styles.bulk}>
                <Pressable
                  accessibilityRole="button"
                  onPress={picker.selectAllNew}
                  style={({ pressed }) => [styles.bulkAction, pressed && styles.pressed]}>
                  <Text style={styles.bulkLabel}>Select new</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={picker.selectNone}
                  style={({ pressed }) => [styles.bulkAction, pressed && styles.pressed]}>
                  <Text style={styles.bulkLabel}>Select none</Text>
                </Pressable>
              </View>
            ) : null}
            {error ? (
              <Message
                text={error instanceof Error ? error.message : 'Could not read that page.'}
                tone="error"
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          picker.isLoading ? (
            <Message text="Reading your shop…" />
          ) : (
            <Message text="Nothing on that page looked like a watch with a photograph." />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <CandidateRow
            item={item}
            selected={picker.selected.has(item.id)}
            onToggle={() => picker.toggle(item)}
          />
        )}
      />

      <View style={styles.footer}>
        <Button
          label={
            refreshing.length && !chosen.length
              ? `Update ${plural(refreshing.length, 'watch', 'watches')}`
              : `Add ${plural(chosen.length, 'watch', 'watches')}`
          }
          disabled={!pending || picker.isLoading}
          onPress={picker.start}
        />
        <Button label="Cancel" variant="ghost" onPress={onDone} />
      </View>
    </View>
  );
}

/** What the row says about itself, in the order that matters to the dealer. */
function detail(item: CatalogItem, price: string): string {
  if (item.error) return item.error;
  if (!item.available) return 'Marked sold on your site';
  if (item.changed) return 'Changed on your site · will be updated';
  if (item.listed) return 'Already in your listings';
  return `${price} · ${plural(item.photoCount, 'photo', 'photos')}`;
}

function CandidateRow({
  item,
  selected,
  onToggle,
}: {
  item: CatalogItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const styles = useThemedStyles(previewStyles);
  // A watch already in the deck is not a choice, and neither is one the shop
  // says it has sold.
  const locked = item.listed || !item.available;
  const checked = selected && !locked;
  const price = formatPrice({ price_cents: item.priceCents, currency: item.currency ?? 'USD' });

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: locked }}
      accessibilityLabel={item.title}
      disabled={locked}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.row,
        checked && styles.rowSelected,
        pressed && !locked && styles.pressed,
        locked && styles.disabled,
      ]}>
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <View style={styles.copy}>
        <Text style={[styles.title, checked && styles.titleSelected]} numberOfLines={2}>
          {item.title || 'Untitled'}
        </Text>
        <Text style={[styles.detail, item.error && styles.detailError]} numberOfLines={2}>
          {detail(item, price)}
        </Text>
      </View>
    </Pressable>
  );
}

const previewStyles = (theme: Theme) => ({
  body: {
    flex: 1,
  },
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.md,
    flexGrow: 1,
  },
  intro: {
    gap: stack.related,
    paddingBottom: space.md,
  },
  bulk: {
    flexDirection: 'row' as const,
    gap: space.md,
  },
  bulkAction: {
    minHeight: HIT_TARGET,
    justifyContent: 'center' as const,
  },
  bulkLabel: {
    ...type.control,
    color: theme.color.text,
  },
  separator: {
    height: 1,
    backgroundColor: theme.color.border,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: HIT_TARGET,
    paddingVertical: space.md,
    paddingHorizontal: inset.compactX,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
    backgroundColor: theme.color.surface,
  },
  rowSelected: {
    backgroundColor: theme.color.surfaceSunken,
    borderLeftColor: theme.color.brass,
  },
  thumb: {
    width: size.thumb,
    height: size.thumb,
    borderRadius: radius.sm,
    backgroundColor: theme.color.surfaceSunken,
  },
  thumbEmpty: {
  },
  copy: {
    flex: 1,
    gap: stack.tight,
  },
  title: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  titleSelected: {
    color: theme.color.brass,
  },
  detail: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  detailError: {
    color: theme.color.danger,
  },
  footer: {
    paddingHorizontal: inset.screen,
    paddingTop: space.md,
    paddingBottom: inset.screen,
    gap: stack.related,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.4,
  },
});
