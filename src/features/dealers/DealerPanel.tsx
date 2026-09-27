import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useDealerReputation } from '@/data/dealers';
import type { Dealer } from '@/lib/models';
import { useOpenStack } from '@/lib/openStack';
import { HIT_TARGET, motion, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { FollowDealer } from './FollowDealer';

const INSTAGRAM = require('../../../assets/instagram.png');

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

/**
 * The shop's own mark, resolved from their site when we imported them.
 *
 * This used to ask unavatar.io for it on every render, which put a third party
 * in the path of every card and told them which dealer a buyer was reading.
 * The importer now reads the icon the shop declares in its own HTML and stores
 * the URL, so the only host involved is the dealer's. Six dealer sites in eight
 * declare one; the rest show no mark, which is what `logo_url` being null means.
 *
 * `contain`, not `cover`: a logo cropped to a square is a different logo, and
 * letterboxing one is only a margin.
 *
 * Silent to a screen reader, and gone on a failed load rather than an empty
 * frame — most of what it could say is the name already read out next to it.
 */
function DealerMark({ logoUrl }: { logoUrl: string | null | undefined }) {
  const styles = useThemedStyles(panelStyles);
  const [failed, setFailed] = useState(false);

  if (!logoUrl || failed) return null;

  return (
    <Image
      source={{ uri: logoUrl }}
      style={styles.mark}
      contentFit="contain"
      transition={motion.fast}
      onError={() => setFailed(true)}
      accessible={false}
    />
  );
}

function siteHref(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function siteLabel(url: string) {
  try {
    return new URL(siteHref(url)).host.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
}

/**
 * Where the shop posts, which in this trade is how a buyer checks a stranger
 * is real before writing to them about a watch worth more than a car. Seven
 * dealer sites in eight publish a handle.
 */
function Instagram({ handle }: { handle: string }) {
  const styles = useThemedStyles(panelStyles);
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => Linking.openURL(`https://instagram.com/${handle}`)}
      accessibilityRole="link"
      accessibilityLabel={`${handle} on Instagram`}
      style={styles.linkRow}>
      {/* White glyph, tinted to the link colour. A fixed white mark vanishes
          on a light page. The handle already names the account, so the mark
          stays silent. */}
      <Image
        source={INSTAGRAM}
        style={styles.linkMark}
        contentFit="contain"
        tintColor={theme.color.text}
        accessible={false}
      />
      <Text style={styles.link}>@{handle}</Text>
    </Pressable>
  );
}

function Website({ url }: { url: string }) {
  const styles = useThemedStyles(panelStyles);
  const theme = useTheme();
  const label = siteLabel(url);

  return (
    <Pressable
      onPress={() => Linking.openURL(siteHref(url))}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={styles.linkRow}>
      <MaterialCommunityIcons name="web" size={size.icon} color={theme.color.text} accessible={false} />
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
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
}) {
  const styles = useThemedStyles(panelStyles);
  const { data } = useDealerReputation(dealer.id);
  const open = useOpenStack();

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <DealerMark logoUrl={dealer.logo_url} />
        <Text style={styles.name}>{dealer.name}</Text>
      </View>

      {dealer.description ? <Text style={styles.about}>{dealer.description}</Text> : null}

      {data ? (
        <View style={styles.stats}>
          <Stat value={tenure(data.joined_at)} label="On Graham" />
          <Stat value={data.listings_live.toLocaleString()} label="Watches for sale" />
        </View>
      ) : null}

      {follow || browse ? <FollowDealer dealer={dealer} /> : null}

      <View style={styles.links}>
        {dealer.website ? <Website url={dealer.website} /> : null}
        {dealer.instagram ? <Instagram handle={dealer.instagram} /> : null}
      </View>

      {/* Ghost, not filled. Leaving this shop for its whole catalogue is a
          detour from deciding on the watch above it, so it stays quieter than
          Save and Ask. */}
      {browse ? (
        <Button
          label="More watches"
          icon="watch"
          variant="ghost"
          onPress={() =>
            open('dealer/[dealerId]', { dealerId: dealer.id }, `/dealer/${dealer.id}`)
          }
        />
      ) : null}

      <Text style={styles.note}>Inquiries reach this shop by email.</Text>
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
  mark: {
    width: size.icon,
    height: size.icon,
    borderRadius: radius.sm,
  },
  name: {
    ...type.title,
    color: theme.color.text,
  },
  // The shop's own sentence about itself, so it reads as body text rather than
  // a field: full measure, muted against the name above it.
  about: {
    ...type.body,
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
  links: {
    gap: space.xs,
  },
  linkRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: HIT_TARGET,
  },
  linkMark: {
    width: size.icon,
    height: size.icon,
  },
  link: {
    ...type.body,
    color: theme.color.text,
    flexShrink: 1,
  },
  note: {
    ...type.caption,
    color: theme.color.textFaint,
  },
});
