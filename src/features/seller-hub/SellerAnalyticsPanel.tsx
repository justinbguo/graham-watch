import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';

import { Heading, Message, Spinner } from '@/components/ui';
import { useDealerTopCustomers, type DealerTopCustomer } from '@/data/dealerAnalytics';
import type { DealerInventoryItem } from '@/data/dealers';
import { useDealerWorkspace } from '@/features/dealers/workspace';
import { formatPrice, formatRelativeTime, formatTitle } from '@/lib/format';
import { useOpenStack } from '@/lib/openStack';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

type ListingMetric = 'saved' | 'passed' | 'seen' | 'inquiries';

const LISTING_METRICS: { id: ListingMetric; label: string }[] = [
  { id: 'saved', label: 'Saved' },
  { id: 'passed', label: 'Passed' },
  { id: 'seen', label: 'Seen' },
  { id: 'inquiries', label: 'Inquiries' },
];

function listingScore(item: DealerInventoryItem, metric: ListingMetric): number {
  switch (metric) {
    case 'saved':
      return item.saves;
    case 'passed':
      return item.passes;
    case 'seen':
      return item.saves + item.passes;
    case 'inquiries':
      return item.inquiries;
  }
}

function sortListings(items: DealerInventoryItem[], metric: ListingMetric): DealerInventoryItem[] {
  return [...items].sort((a, b) => listingScore(b, metric) - listingScore(a, metric));
}

/** Deal hub: who engages most, and which watches get the most deck attention. */
export function SellerAnalyticsPanel({ active = true }: { active?: boolean }) {
  const styles = useThemedStyles(panelStyles);
  const open = useOpenStack();
  const shop = useDealerWorkspace();
  const customers = useDealerTopCustomers(shop.shop?.id ?? null);
  const [listingMetric, setListingMetric] = useState<ListingMetric>('saved');

  const rankedListings = useMemo(
    () =>
      sortListings(shop.inventory, listingMetric).filter(
        (item) => listingScore(item, listingMetric) > 0,
      ),
    [shop.inventory, listingMetric],
  );

  const totals = useMemo(() => {
    const views = shop.inventory.reduce((sum, item) => sum + item.saves + item.passes, 0);
    return {
      saves: shop.totals.saves,
      views,
      inquiries: shop.totals.inquiries,
    };
  }, [shop.inventory, shop.totals]);

  useEffect(() => {
    if (active && shop.shop) void shop.reload();
  }, [active, shop.shop, shop.reload]);

  if (shop.isLoading || customers.isLoading) return <Spinner />;
  if (!shop.shop) {
    return <Message text="Claim a shop on Profile to see analytics here." />;
  }

  const topCustomers = customers.data ?? [];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled">
      <View style={styles.summary}>
        <SummaryStat label="Saves" value={totals.saves} />
        <SummaryStat label="Deck views" value={totals.views} />
        <SummaryStat label="Inquiries" value={totals.inquiries} />
      </View>
      <Text style={styles.hint}>
        Seen counts every save and pass in the buyer deck. We do not track anonymous browsing.
      </Text>

      <Section title="Top customers">
        {customers.error ? (
          <Message text="Customer rankings did not load." tone="error" />
        ) : topCustomers.length === 0 ? (
          <Message text="No saves or inquiries yet. When buyers engage, they will rank here." />
        ) : (
          <FlatList
            data={topCustomers}
            scrollEnabled={false}
            keyExtractor={(row) => row.buyer_id}
            ItemSeparatorComponent={() => <View style={styles.rule} />}
            renderItem={({ item }) => <CustomerRow customer={item} />}
          />
        )}
      </Section>

      <Section title="Top listings">
        <View style={styles.chips}>
          {LISTING_METRICS.map((chip) => {
            const selected = listingMetric === chip.id;
            return (
              <Pressable
                key={chip.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setListingMetric(chip.id)}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipSelected,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {rankedListings.length === 0 ? (
          <Message text="No activity for this metric yet." />
        ) : (
          <FlatList
            data={rankedListings.slice(0, 25)}
            scrollEnabled={false}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={styles.rule} />}
            renderItem={({ item }) => (
              <ListingRankRow
                item={item}
                metric={listingMetric}
                onPress={() =>
                  open(
                    'edit-listing/[listingId]',
                    { listingId: item.id },
                    `/edit-listing/${item.id}`,
                  )
                }
              />
            )}
          />
        )}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useThemedStyles(panelStyles);
  return (
    <View style={styles.section}>
      <Heading>{title}</Heading>
      {children}
    </View>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  const styles = useThemedStyles(panelStyles);
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function CustomerRow({ customer }: { customer: DealerTopCustomer }) {
  const styles = useThemedStyles(panelStyles);
  const handle = customer.handle ? `@${customer.handle}` : 'Collector';
  const name = customer.display_name?.trim();
  const last = customer.last_active ? formatRelativeTime(customer.last_active) : null;

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>{name || handle}</Text>
        {name ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>{handle}</Text>
        ) : null}
      </View>
      <View style={styles.rowMetrics}>
        <Text style={styles.metricLine}>{customer.saves} saved</Text>
        <Text style={styles.metricLine}>{customer.inquiries} inquir{customer.inquiries === 1 ? 'y' : 'ies'}</Text>
        {customer.passes > 0 ? (
          <Text style={styles.metricMuted}>{customer.passes} passed</Text>
        ) : null}
        {last ? <Text style={styles.metricMuted}>Active {last}</Text> : null}
      </View>
    </View>
  );
}

function ListingRankRow({
  item,
  metric,
  onPress,
}: {
  item: DealerInventoryItem;
  metric: ListingMetric;
  onPress: () => void;
}) {
  const styles = useThemedStyles(panelStyles);
  const photo = item.photos[0]?.url;
  const score = listingScore(item, metric);
  const metricLabel =
    metric === 'saved'
      ? `${score} save${score === 1 ? '' : 's'}`
      : metric === 'passed'
        ? `${score} pass${score === 1 ? '' : 'es'}`
        : metric === 'seen'
          ? `${score} seen`
          : `${score} inquir${score === 1 ? 'y' : 'ies'}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatTitle(item)}, ${metricLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.listingRow, pressed && styles.pressed]}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <View style={styles.listingBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>{formatTitle(item)}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {[item.reference, formatPrice(item)].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.metricLine}>{metricLabel}</Text>
        <Text style={styles.metricMuted}>
          {item.saves} saved · {item.passes} passed · {item.inquiries} inquir
          {item.inquiries === 1 ? 'y' : 'ies'}
        </Text>
      </View>
    </Pressable>
  );
}

const panelStyles = (theme: Theme) => ({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: inset.card,
    paddingVertical: space.md,
    gap: stack.section,
    paddingBottom: space.xxxl,
  },
  summary: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: theme.color.raised,
    gap: space.xs,
  },
  summaryValue: {
    ...type.title,
    color: theme.color.text,
  },
  summaryLabel: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  hint: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  section: {
    gap: stack.related,
  },
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.xs,
  },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.field,
  },
  chipSelected: {
    borderColor: theme.color.text,
    backgroundColor: theme.color.raised,
  },
  chipLabel: {
    ...type.label,
    color: theme.color.textMuted,
  },
  chipLabelSelected: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  rule: {
    height: 1,
    backgroundColor: theme.color.border,
    marginVertical: space.sm,
  },
  row: {
    gap: space.xs,
  },
  rowMain: {
    gap: 2,
  },
  rowTitle: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  rowSubtitle: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  rowMetrics: {
    gap: 2,
  },
  metricLine: {
    ...type.caption,
    color: theme.color.text,
  },
  metricMuted: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  listingRow: {
    flexDirection: 'row' as const,
    gap: space.sm,
    alignItems: 'flex-start' as const,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: theme.color.fill,
  },
  thumbEmpty: {
    opacity: 0.4,
  },
  listingBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pressed: {
    opacity: 0.88,
  },
});
