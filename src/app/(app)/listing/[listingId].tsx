import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { PhotoCarousel } from '@/components/PhotoCarousel';
import { Button, Centered, Divider, Message, Screen, Spinner } from '@/components/ui';
import { useListing, useSaved } from '@/data/listings';
import { useRecordSwipe, useUnsave } from '@/data/swipes';
import { DealerPanel } from '@/features/dealers/DealerPanel';
import { formatPrice, formatSpecs, humanize } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useTheme, useThemedStyles } from '@/providers/theme';

function yesNo(value: boolean | null) {
  if (value == null) return null;
  return value ? 'Yes' : 'No';
}

function specs(card: DeckCard): [string, string][] {
  const rows: [string, string | null][] = [
    ['Reference', card.reference],
    ['Year', card.year ? String(card.year) : null],
    ['Case', card.case_size_mm ? `${card.case_size_mm}mm` : null],
    ['Material', card.case_material ? humanize(card.case_material) : null],
    ['Dial', card.dial_color ? humanize(card.dial_color) : null],
    ['Winding', card.winding ? humanize(card.winding) : null],
    ['Caliber', card.caliber],
    ['Style', card.style ? humanize(card.style) : null],
    [
      'Complications',
      card.complications.length ? card.complications.map(humanize).join(', ') : null,
    ],
    ['Condition', card.condition],
    ['Box', yesNo(card.has_box)],
    ['Papers', yesNo(card.has_papers)],
  ];

  return rows.filter((row): row is [string, string] => Boolean(row[1]));
}

function Spec({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(detailStyles);

  return (
    <View style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

function CloseButton() {
  const styles = useThemedStyles(detailStyles);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={space.sm}
      onPress={() => router.back()}
      style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
      <MaterialCommunityIcons name="close" size={size.tabIcon} color={theme.color.text} />
    </Pressable>
  );
}

export default function ListingScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { userId } = useSession();
  const { data: card, isPending } = useListing(listingId);
  const { data: saved = [] } = useSaved(userId);
  const save = useRecordSwipe(userId);
  const unsave = useUnsave(userId);
  const styles = useThemedStyles(detailStyles);

  const isSaved = saved.some((entry) => entry.id === listingId);

  if (isPending) {
    return (
      <Screen action={<CloseButton />}>
        <Spinner />
      </Screen>
    );
  }

  if (!card) {
    return (
      <Screen action={<CloseButton />}>
        <Centered>
          <Message text="That watch is no longer available." tone="error" />
          <Button label="Close" variant="secondary" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen title={card.brand} action={<CloseButton />}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.photo}>
          <PhotoCarousel
            photos={card.photos}
            active
            onExpand={(index) => router.push(`/photos/${card.id}?index=${index}`)}
          />
        </View>

        <View style={styles.headline}>
          <Text style={styles.model}>{card.model ?? 'Unknown model'}</Text>
          <Text style={styles.meta}>{formatSpecs(card)}</Text>
          <Text style={styles.price}>{formatPrice(card)}</Text>
        </View>

        {card.description ? <Text style={styles.description}>{card.description}</Text> : null}

        <Divider />

        <View style={styles.specs}>
          {specs(card).map(([label, value]) => (
            <Spec key={label} label={label} value={value} />
          ))}
        </View>

        {card.dealer ? <DealerPanel dealer={card.dealer} /> : null}

        <View style={styles.actions}>
          {/* A toggle, not a button that greys out once used. Saving from here
              is the same right swipe, so undoing it has to be reachable too. */}
          <Button
            label={isSaved ? 'Saved' : 'Save watch'}
            variant="secondary"
            loading={save.isPending || unsave.isPending}
            onPress={() =>
              isSaved ? unsave.mutate(card.id) : save.mutate({ listingId: card.id, direction: 'right' })
            }
          />
          <Button
            label="Ask about this watch"
            onPress={() => router.push(`/inquiry/${card.id}`)}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const detailStyles = (theme: Theme) => ({
  body: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxl,
    gap: stack.related,
  },
  photo: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
  },
  headline: {
    gap: stack.tight,
  },
  model: {
    ...type.display,
    color: theme.color.text,
  },
  meta: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  price: {
    ...type.price,
    color: theme.color.text,
    paddingTop: space.sm,
  },
  description: {
    ...type.body,
    color: theme.color.textMuted,
  },
  specs: {
    gap: space.sm,
  },
  specRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
  },
  specLabel: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  specValue: {
    ...type.label,
    color: theme.color.text,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
  actions: {
    gap: stack.related,
  },
  close: {
    padding: space.xs,
  },
  pressed: {
    opacity: 0.72,
  },
});
