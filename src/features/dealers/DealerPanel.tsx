import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { useDealerReputation } from '@/data/dealers';
import type { Dealer } from '@/lib/models';
import { HIT_TARGET, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { DealerPreview } from './DealerPreview';
import { FollowDealer } from './FollowDealer';
import { MessageDealer } from './MessageDealer';
import { dealerPicture } from './picture';

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
 * declare one; the rest get `dealerPicture`, the same face every shop without
 * an icon shares.
 *
 * `contain`, not `cover`: a logo cropped to a square is a different logo, and
 * letterboxing one is only a margin.
 *
 * Silent to a screen reader — most of what it could say is the name already
 * read out next to it. A failed load shows the same default picture as no
 * icon at all.
 */
function DealerMark({ logoUrl }: { logoUrl: string | null | undefined }) {
  return (
    <Avatar url={logoUrl ?? null} px={size.icon} fit="contain" fallback={dealerPicture} />
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
  const { data } = useDealerReputation(dealer.id);
  const showFollow = follow || browse;
  // Follow shares the name's line while it fits. A long name pushes it to a
  // row of its own, where a short capsule at the left reads as an orphan, so
  // there it takes the row. Measured, not guessed: whether it wraps depends
  // on the name and the card's width. A new width re-asks the question.
  const [headingWidth, setHeadingWidth] = useState(0);
  const [followRow, setFollowRow] = useState(false);

  return (
    <View style={styles.panel}>
      {named ? (
        <View
          style={styles.heading}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            if (width === headingWidth) return;
            setHeadingWidth(width);
            setFollowRow(false);
          }}>
          <DealerMark logoUrl={dealer.logo_url} />
          <Text style={styles.name}>{dealer.name}</Text>
          {showFollow ? (
            <View
              style={[styles.actions, followRow && styles.followRow]}
              onLayout={(event) => {
                if (!followRow && event.nativeEvent.layout.y > size.avatarSmall / 2) {
                  setFollowRow(true);
                }
              }}>
              <FollowDealer dealer={dealer} />
              <MessageDealer dealer={dealer} listingId={except} />
            </View>
          ) : null}
        </View>
      ) : null}

      {dealer.description ? <Text style={styles.about}>{dealer.description}</Text> : null}

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
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  name: {
    ...type.title,
    color: theme.color.text,
    flexShrink: 1,
    maxWidth: '100%' as const,
  },
  followRow: {
    width: '100%' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
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
