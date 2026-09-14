import { Text, View } from 'react-native';

import { useDealerReputation } from '@/data/dealers';
import type { Dealer } from '@/lib/models';
import { space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * How long the shop has been here, in the smallest unit that is not a lie. A
 * marketplace weeks old cannot print "0 yrs" beside a dealer who joined on day
 * one, so under a year it names the month instead.
 */
function tenure(joinedAt: string): string {
  const joined = new Date(joinedAt);
  const months =
    (new Date().getFullYear() - joined.getFullYear()) * 12 +
    (new Date().getMonth() - joined.getMonth());

  if (months >= 24) return `${Math.floor(months / 12)} yrs`;
  if (months >= 12) return '1 yr';
  return joined.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** "3 days ago" is what a buyer wants from a stock date, not a timestamp. */
function since(checkedAt: string): string {
  const days = Math.floor((Date.now() - new Date(checkedAt).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(checkedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function Stat({ value, label }: { value: string; label: string }) {
  const styles = useThemedStyles(panelStyles);

  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Who you would be writing to, so the decision to send is not taken blind.
 *
 * Every figure here is counted from this shop's own rows. There was a star
 * rating and a review count, both invented — nothing in the app is a review
 * yet, and an invented number sitting beside true ones makes the true ones
 * unreadable too.
 */
export function DealerPanel({ dealer }: { dealer: Pick<Dealer, 'id' | 'name' | 'website'> }) {
  const styles = useThemedStyles(panelStyles);
  const { data } = useDealerReputation(dealer.id);

  return (
    <View style={styles.panel}>
      <Text style={styles.name}>{dealer.name}</Text>

      {data ? (
        <View style={styles.stats}>
          <Stat value={tenure(data.joined_at)} label="On Graham" />
          <Stat value={data.listings_live.toLocaleString()} label="Watches for sale" />
          <Stat
            value={data.watches_sold ? data.watches_sold.toLocaleString() : '—'}
            label="Sold here"
          />
        </View>
      ) : null}

      {dealer.website ? <Text style={styles.website}>{dealer.website}</Text> : null}

      <Text style={styles.note}>
        {data?.last_refreshed_at
          ? `Stock checked against this shop's own site ${since(
              data.last_refreshed_at
            ).toLowerCase()}. Inquiries reach them by email.`
          : 'Inquiries reach this shop by email.'}
      </Text>
    </View>
  );
}

const panelStyles = (theme: Theme) => ({
  // A section, not a panel. It now sits under a rule inside a card that is
  // already a surface, and a bordered box on a bordered box reads as a control.
  panel: {
    gap: stack.related,
  },
  name: {
    ...type.title,
    color: theme.color.text,
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
  note: {
    ...type.caption,
    color: theme.color.textFaint,
  },
});
