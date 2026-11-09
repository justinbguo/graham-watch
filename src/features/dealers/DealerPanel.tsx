import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text, View } from 'react-native';

import { useDealerReputation } from '@/data/dealers';
import type { Dealer } from '@/lib/models';
import { useOpenStack } from '@/lib/openStack';
import { HIT_TARGET, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { DealerMark, Instagram, Website } from './DealerLinks';
import { DealerPreview } from './DealerPreview';
import { FollowDealer } from './FollowDealer';
import { MessageDealer } from './MessageDealer';

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
 * Every figure here is counted from this shop's own rows, and every word is
 * the shop's own: the description is their site's, never ours. There was a
 * star rating and a review count, both invented — nothing in the app is a
 * review yet, and an invented number sitting beside true ones makes the true
 * ones unreadable too.
 */
export function DealerPanel({
  dealer,
  browse = false,
  follow = false,
  named = true,
  except,
}: {
  // The three scraped fields are optional because one caller genuinely lacks
  // them: a dealer's own shop card is built from `dealer_accounts`, which
  // returns what a dealer may administer rather than what a buyer is shown.
  dealer: Pick<Dealer, 'id' | 'name' | 'website'> &
    Partial<Pick<Dealer, 'description' | 'instagram' | 'logo_url'>>;
  /** A buyer can open the shop. The shop card cannot: that dealer is already there. */
  browse?: boolean;
  /** A buyer can follow the shop. The shop card cannot. */
  follow?: boolean;
  /** The screen title is already this name. Saying it again is a second header. */
  named?: boolean;
  /** The listing this panel sits under, so the strip does not repeat it. */
  except?: string;
}) {
  const styles = useThemedStyles(panelStyles);
  const theme = useTheme();
  const open = useOpenStack();
  const { data } = useDealerReputation(dealer.id);
  const showFollow = follow || browse;
  const openShop = () => open('dealer/[dealerId]', { dealerId: dealer.id }, `/dealer/${dealer.id}`);

  return (
    <View style={styles.panel}>
      {named && browse ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${dealer.name}`}
          onPress={openShop}
          style={({ pressed }) => [styles.headingOpen, pressed && styles.pressed]}>
          <DealerMark logoUrl={dealer.logo_url} />
          <Text style={styles.name}>{dealer.name}</Text>
          <View style={styles.chevronSlot}>
            <MaterialCommunityIcons
              name="chevron-right"
              size={size.icon}
              color={theme.color.text}
              accessible={false}
            />
          </View>
        </Pressable>
      ) : named ? (
        <View style={styles.heading}>
          <DealerMark logoUrl={dealer.logo_url} />
          <Text style={styles.name}>{dealer.name}</Text>
        </View>
      ) : null}

      {dealer.description ? <Text style={styles.about}>{dealer.description}</Text> : null}

      {showFollow ? (
        <View style={styles.actions}>
          <FollowDealer dealer={dealer} block />
          <MessageDealer dealer={dealer} listingId={except} block />
        </View>
      ) : null}

      {data ? (
        <View style={styles.stats}>
          <Stat value={tenure(data.joined_at)} label="On Graham" />
          <Stat value={data.listings_live.toLocaleString()} label="Watches for sale" />
        </View>
      ) : null}

      {/* What else the shop sells. The shop's own page lists everything, so it
          shows no strip. */}
      {browse ? <DealerPreview dealerId={dealer.id} except={except} /> : null}

      <View style={styles.links}>
        {dealer.website ? <Website url={dealer.website} /> : null}
        {dealer.instagram ? <Instagram handle={dealer.instagram} /> : null}
      </View>
    </View>
  );
}

const panelStyles = (theme: Theme) => ({
  // A section, not a panel. It now sits under a rule inside a card that is
  // already a surface, and a bordered box on a bordered box reads as a control.
  panel: {
    gap: stack.related,
  },
  heading: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  headingOpen: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    alignSelf: 'stretch' as const,
    width: '100%' as const,
  },
  chevronSlot: {
    width: HIT_TARGET,
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.72,
  },
  name: {
    ...type.title,
    color: theme.color.text,
    flexShrink: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row' as const,
    alignSelf: 'stretch' as const,
    alignItems: 'stretch' as const,
    gap: space.sm,
    width: '100%' as const,
  },
  // The same face, size, and ink as the watch's description above it. Both
  // are the dealer's own words, and in two styles they read as two authors.
  about: {
    ...type.label,
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
    ...type.panelLead,
    color: theme.color.text,
  },
  statLabel: {
    ...type.panelNote,
    color: theme.color.textMuted,
  },
  links: {
    gap: space.sm,
  },
});
