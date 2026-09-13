import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { Stars } from '@/components/Stars';
import type { Dealer } from '@/lib/models';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { placeholderReputation } from './reputation';

function Stat({ value, label }: { value: string; label: string }) {
  const styles = useThemedStyles(panelStyles);

  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Who you would be writing to, so the decision to send is not taken blind. */
export function DealerPanel({ dealer }: { dealer: Pick<Dealer, 'id' | 'name' | 'website'> }) {
  const styles = useThemedStyles(panelStyles);
  const reputation = useMemo(() => placeholderReputation(dealer.id), [dealer.id]);

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Text style={styles.name}>{dealer.name}</Text>
        <Text style={styles.sample}>Sample</Text>
      </View>

      <View style={styles.ratingRow}>
        <Stars rating={reputation.rating} />
        <Text style={styles.rating}>
          {reputation.rating.toFixed(1)} · {reputation.reviews} reviews
        </Text>
      </View>

      <View style={styles.stats}>
        <Stat value={`${reputation.yearsTrading} yrs`} label="Trading" />
        <Stat value={reputation.sales.toLocaleString()} label="Watches sold" />
        <Stat value={reputation.respondsIn} label="Replies in" />
      </View>

      {dealer.website ? <Text style={styles.website}>{dealer.website}</Text> : null}

      <Text style={styles.disclaimer}>
        Dealer ratings are not live yet. These figures are placeholders.
      </Text>
    </View>
  );
}

const panelStyles = (theme: Theme) => ({
  panel: {
    backgroundColor: theme.color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: inset.card,
    gap: stack.related,
  },
  heading: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  name: {
    ...type.title,
    color: theme.color.text,
    flexShrink: 1,
  },
  // A badge rather than a footnote alone: the numbers beside it are invented,
  // and nobody reads the small print under a five-star row.
  sample: {
    ...type.control,
    color: theme.color.textMuted,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    overflow: 'hidden' as const,
  },
  ratingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  rating: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  stats: {
    flexDirection: 'row' as const,
    gap: space.md,
  },
  stat: {
    flex: 1,
    gap: stack.tight,
  },
  statValue: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  statLabel: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  website: {
    ...type.caption,
    color: theme.color.brass,
  },
  disclaimer: {
    ...type.caption,
    color: theme.color.textFaint,
  },
});
