import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { Linking, Pressable, Text } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { dealerPicture } from './picture';

const INSTAGRAM = require('../../../assets/instagram.png');

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
export function DealerMark({ logoUrl }: { logoUrl: string | null | undefined }) {
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
export function Instagram({ handle }: { handle: string }) {
  const styles = useThemedStyles(linkStyles);
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

export function Website({ url }: { url: string }) {
  const styles = useThemedStyles(linkStyles);
  const theme = useTheme();
  const label = siteLabel(url);

  return (
    <Pressable
      onPress={() => Linking.openURL(siteHref(url))}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={styles.linkRow}>
      <MaterialCommunityIcons
        name="web"
        size={size.icon + 2}
        color={theme.color.text}
        accessible={false}
      />
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const linkStyles = (theme: Theme) => ({
  linkRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingVertical: space.xs,
    minHeight: size.icon + space.xs * 2,
  },
  linkMark: {
    width: size.icon,
    height: size.icon,
  },
  link: {
    ...type.panelLink,
    color: theme.color.text,
    flexShrink: 1,
  },
});
