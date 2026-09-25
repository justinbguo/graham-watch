import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { PhotoCarousel } from '@/components/PhotoCarousel';
import { Button, Centered, CloseButton, Divider, Message, Screen, Spinner } from '@/components/ui';
import { inquiryByListing, useInquiries } from '@/data/inquiries';
import { useListing, useSaved } from '@/data/listings';
import { useRecordSwipe, useUnsave } from '@/data/swipes';
import { DealerPanel } from '@/features/dealers/DealerPanel';
import { formatPrice, formatSpecs, humanize } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

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

export default function ListingScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { userId } = useSession();
  const { data: card, isPending } = useListing(listingId);
  const { data: saved = [] } = useSaved(userId);
  const { data: inquiries = [] } = useInquiries(userId);
  const save = useRecordSwipe(userId);
  const unsave = useUnsave(userId);
  const styles = useThemedStyles(detailStyles);

  const isSaved = saved.some((entry) => entry.id === listingId);
  const inquiry = inquiryByListing(inquiries).get(listingId);

  if (isPending) {
    return (
      <Screen action={<CloseButton onPress={() => router.back()} />}>
        <Spinner />
      </Screen>
    );
  }

  if (!card) {
    return (
      <Screen action={<CloseButton onPress={() => router.back()} />}>
        <Centered>
          <Message text="That watch is no longer available." tone="error" />
          <Button label="Close" variant="secondary" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen title={card.brand} action={<CloseButton onPress={() => router.back()} />}>
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

        {/* Only ever reached from Saved: the deck cannot serve a sold watch. It
            says what the dealer would have said, before an email gets written. */}
        {card.sold_at ? (
          <View style={styles.sold}>
            <Text style={styles.soldLabel}>Sold</Text>
            <Text style={styles.soldNote}>
              {card.dealer?.name ?? 'The dealer'} no longer has this watch.
            </Text>
          </View>
        ) : null}

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
          {/* The whole point of tracking sold stock: no one writes to a dealer
              about a watch that went months ago. Sent stays a label, not a
              second email; failed and pending keep a retry. */}
          {card.sold_at ? null : inquiry?.status === 'sent' ? (
            <Button label="Contacted" variant="secondary" disabled onPress={() => undefined} />
          ) : (
            <Button
              label={
                inquiry?.status === 'failed' || inquiry?.status === 'pending'
                  ? 'Retry inquiry'
                  : 'Ask about this watch'
              }
              onPress={() => router.push(`/inquiry/${card.id}`)}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const detailStyles = (theme: Theme) => ({
  sold: {
    gap: space.xs,
    padding: inset.card,
    borderRadius: radius.md,
    backgroundColor: theme.color.surfaceSunken,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  soldLabel: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  soldNote: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  body: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxl,
    gap: stack.group,
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
});
