import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Platform, Pressable, Text, View, type ViewStyle } from 'react-native';

import { Tag } from '@/features/exchange/Tag';
import { formatName, formatPrice } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { HIT_TARGET, inset, scrim, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * Watch name, price, and year on the photograph's bottom edge, left-aligned on
 * `scrim`. White type never sits on the photo alone.
 */
export function PhotoCaption({
  card,
  onExpand,
}: {
  card: DeckCard;
  onExpand?: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(captionStyles);
  const name = formatName(card) || 'Unknown watch';

  return (
    <View pointerEvents="box-none" style={[styles.caption, gradient]}>
      <View pointerEvents="none" style={styles.namePlate}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
      </View>
      <View pointerEvents="box-none" style={styles.meta}>
        <View pointerEvents="none" style={styles.metaStart}>
          <Tag label={formatPrice(card)} tone="money" size="plate" />
          {card.year != null ? (
            <>
              <Text style={styles.sep}> · </Text>
              <Text style={styles.year}>{card.year}</Text>
            </>
          ) : null}
        </View>
        <View style={styles.expandSlot}>
          {onExpand ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View photos full screen"
              hitSlop={space.sm}
              onPress={onExpand}
              style={({ pressed }) => [styles.expand, pressed && styles.expandPressed]}>
              <MaterialCommunityIcons
                name="fullscreen"
                size={size.icon}
                color={theme.color.onOverlay}
              />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const caps = {
  textTransform: 'uppercase' as const,
};

/** One line on the plate. Fixed multiples keep the block from jumping between watches. */
const titleLine = type.plateTitle.lineHeight;
const metaLine = type.titleSmall.lineHeight;

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
    paddingTop: space.xxxl,
    paddingHorizontal: inset.card,
    paddingBottom: space.md,
    zIndex: 2,
    alignItems: 'flex-start' as const,
    gap: stack.tight,
  },
  /** Two lines tall; single-line names sit on the bottom line above the price. */
  namePlate: {
    alignSelf: 'stretch' as const,
    minHeight: titleLine * 2,
    justifyContent: 'flex-end' as const,
  },
  meta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'stretch' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
    minHeight: metaLine,
  },
  metaStart: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    flex: 1,
    minWidth: 0,
  },
  expandSlot: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    flexShrink: 0,
  },
  expand: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: -space.xs,
    marginBottom: -space.xs,
  },
  expandPressed: {
    opacity: 0.72,
  },
  name: {
    ...type.plateTitle,
    ...caps,
    color: theme.color.onOverlay,
    textShadowColor: theme.color.overlay,
    textShadowRadius: 12,
  },
  sep: {
    ...type.titleSmall,
    lineHeight: metaLine,
    color: theme.color.onOverlayFaint,
    textShadowColor: theme.color.overlay,
    textShadowRadius: 12,
  },
  year: {
    ...type.titleSmall,
    ...caps,
    lineHeight: metaLine,
    color: theme.color.onOverlay,
    textShadowColor: theme.color.overlay,
    textShadowRadius: 12,
  },
});
