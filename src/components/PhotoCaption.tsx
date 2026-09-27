import { useState } from 'react';
import { Platform, Text, View, type ViewStyle } from 'react-native';

import { formatName, formatPrice, formatTitle } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, scrim, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * The whole plate, on the photograph: the maker, the model, and the year, then
 * what it costs and who from. It is what a card is for, so it belongs on the
 * thing the eye is already on rather than in a block underneath — a card that
 * puts its photograph first and its facts second makes you look twice to learn
 * one watch.
 *
 * Two lines, and only two. `formatTitle` puts the year after the name, the way
 * a tile and a search row do. When that fits, the price and the dealer are the
 * second line. When the year would wrap, it leaves the name and joins them, so
 * a long name does not grow a third line over the watch.
 *
 * One weight throughout, and one colour with one exception: the dealer's name
 * is `onOverlayAccent`, the same tan as the roll's current bar. On a
 * photograph a change of tone is a change the eye must attribute either to the
 * type or to the picture behind it, so there is exactly one, and it falls on
 * the one word here that names a party rather than the watch. Not `brass`,
 * which is mixed for paper and goes to mud over a dark scrim.
 *
 * The year keeps `titleSmall` on whichever line it lands on. The price stays
 * `bodyStrong`. Moving the year down does not shrink it, and it does not
 * enlarge the price.
 *
 * Nothing here is tappable. The carousel's paging zones sit behind it and keep
 * the whole photo, caption included.
 */
export function PhotoCaption({ card }: { card: DeckCard }) {
  const styles = useThemedStyles(captionStyles);
  const title = formatTitle(card);
  const name = formatName(card) || 'Unknown watch';
  const dealer = card.dealer?.name;
  const [width, setWidth] = useState(0);
  const [measured, setMeasured] = useState({ key: '', wrapped: false });
  // The width is part of the key: a rotation can fit a title that just wrapped.
  const key = `${card.id}:${width}:${title}`;
  // Ignore a measurement for the previous watch. Until the new one lands, the
  // title stays on one line rather than flashing a third.
  const split = measured.key === key && measured.wrapped && card.year != null;

  return (
    <View pointerEvents="none" style={[styles.caption, gradient]}>
      <View
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setWidth((current) => (current === next ? current : next));
        }}>
        {width > 0 ? (
          <Text
            accessible={false}
            style={[styles.name, styles.measure, { width }]}
            onTextLayout={(event) => {
              const lines = event.nativeEvent.lines.filter((line) => line.text.trim().length > 0);
              const wrapped = lines.length > 1;
              setMeasured((current) =>
                current.key === key && current.wrapped === wrapped ? current : { key, wrapped }
              );
            }}>
            {title}
          </Text>
        ) : null}
        <Text style={styles.name} numberOfLines={1}>
          {split ? name : title}
        </Text>
        <Text style={styles.terms} numberOfLines={1}>
          {split ? (
            <>
              <Text style={styles.year}>{card.year}</Text>
              {'  ·  '}
            </>
          ) : null}
          {formatPrice(card)}
          {dealer ? (
            <>
              {'  ·  '}
              <Text style={styles.dealer}>{dealer}</Text>
            </>
          ) : null}
        </Text>
      </View>
    </View>
  );
}

/**
 * One gradient, two style keys. React Native draws it from
 * `experimental_backgroundImage` (Fabric only, which this app is on); React
 * Native Web has never heard of that prop and takes the CSS name instead. The
 * cast is the price of a prop the web renderer does not type.
 */
const gradient = Platform.select<ViewStyle>({
  web: { backgroundImage: scrim } as ViewStyle,
  default: { experimental_backgroundImage: scrim },
});

const captionStyles = (theme: Theme) => ({
  caption: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    // The fade needs room above the type, or it reads as a band with a lid.
    paddingTop: space.xxl,
    paddingHorizontal: inset.card,
    paddingBottom: space.md,
    zIndex: 2,
  },
  name: {
    ...type.titleSmall,
    // Set solid. The lines stacked on a photograph want to read as one block;
    // the token's leading is for type with paper around it.
    lineHeight: type.titleSmall.fontSize + 3,
    color: theme.color.onOverlay,
    // Belt and braces over a photograph shot on white: the fade is thinnest at
    // the top of the line, which is exactly where the capitals are.
    textShadowColor: theme.color.overlay,
    textShadowRadius: 12,
  },
  // Same face and width as the name, off the layout. `onTextLayout` is how we
  // learn whether the year wrapped: a character count lies, because the face
  // is proportional and the card is not one width.
  measure: {
    position: 'absolute' as const,
    opacity: 0,
    left: 0,
    top: 0,
  },
  terms: {
    // The price keeps the size it had on its own line; the dealer joins it
    // there rather than the price coming down to a label.
    ...type.bodyStrong,
    lineHeight: type.bodyStrong.fontSize + 3,
    color: theme.color.onOverlay,
    // The price and the dealer share a line, so the gap between them is the
    // only thing dividing them. A middot with air is a divider; a comma is a
    // list.
    paddingTop: space.xs,
    textShadowColor: theme.color.overlay,
    textShadowRadius: 12,
  },
  // The year, once it has left the name. Same size as the line it came from,
  // locked to this line's leading so the plate does not grow by a point.
  year: {
    ...type.titleSmall,
    lineHeight: type.bodyStrong.fontSize + 3,
    color: theme.color.onOverlay,
    textShadowColor: theme.color.overlay,
    textShadowRadius: 12,
  },
  dealer: {
    color: theme.color.onOverlayAccent,
  },
});
