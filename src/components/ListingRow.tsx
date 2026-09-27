import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { ListingSummary } from '@/components/ListingSummary';
import { useSwipeGuard } from '@/components/SwipeToRemove';
import { formatTitle } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * One watch in a list: the photograph at a size worth looking at, the name,
 * its specs, the price, and the dealer beside it. The deck's grid, Saved,
 * search, and a dealer's shop all use this, so a watch in a list is the same
 * object wherever the list is.
 */
export function ListingRow({
  card,
  actionIcon,
  actionLabel,
  actionPending = false,
  onAction,
  onPress,
  selected = false,
}: {
  card: DeckCard;
  /** A glyph, not a word. The label is what a screen reader says instead. */
  actionIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  actionLabel?: string;
  actionPending?: boolean;
  onAction?: () => void;
  onPress?: () => void;
  /** The grid's keyboard cursor on the web. A phone has no such thing. */
  selected?: boolean;
}) {
  const styles = useThemedStyles(rowStyles);
  const theme = useTheme();
  const photo = card.photos[0]?.url;
  const action = Boolean(actionIcon && actionLabel && onAction);
  // In a list where a row can be swiped, the end of that swipe is not a tap.
  const guard = useSwipeGuard();

  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      {/* Gesture Handler's pressable. Saved rows sit under a pan, and React
          Native's Pressable never hears that tap. The photograph and the type
          open the watch separately so the action beside them can be a button
          of its own: a button inside a button is invalid on the web, and one
          tap would both write to the dealer and open the watch. */}
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        onPress={guard(onPress)}>
        {photo ? (
          // `contain`, unlike the card's `cover`. A row is for recognising a
          // watch, and a crop at this size magnifies the dial past the case
          // shape — which is most of what tells one vintage watch from another.
          <Image source={{ uri: photo }} style={styles.photo} contentFit="contain" />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Text style={styles.photoEmptyLabel}>No photograph</Text>
          </View>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={formatTitle(card)}
        onPress={guard(onPress)}
        style={styles.details}>
        <ListingSummary card={card} titleInset={action ? size.icon + space.md : 0} />
      </Pressable>

      {action && actionIcon && actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ busy: actionPending, disabled: actionPending }}
          disabled={actionPending}
          onPress={guard(onAction)}
          hitSlop={space.sm}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          {actionPending ? (
            <ActivityIndicator color={theme.color.textMuted} />
          ) : (
            <MaterialCommunityIcons name={actionIcon} size={size.icon} color={theme.color.textMuted} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const rowStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    // Stretch, not centre: a row taller than the photograph would otherwise
    // leave a band of empty surface above and below it.
    alignItems: 'stretch' as const,
    backgroundColor: theme.color.surface,
    borderRadius: radius.md,
    // Transparent rather than absent: a border that appears only once selected
    // would move the row by a pixel as the cursor lands on it.
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden' as const,
  },
  rowSelected: {
    borderColor: theme.color.brass,
  },
  // A fixed shape, close to what dealers shoot: a watch photographed upright,
  // about five by seven. The height used to come from the type beside it, so a
  // name that wrapped made the frame taller, and the same photograph was
  // magnified and cut differently in one row than in the next.
  photo: {
    width: size.gridPhoto,
    aspectRatio: 5 / 7,
    // Centred rather than stretched: at a large accessibility text size the
    // type outgrows the frame, and the frame must not change shape with it.
    alignSelf: 'center' as const,
    backgroundColor: theme.color.surfaceSunken,
  },
  photoEmpty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  photoEmptyLabel: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  details: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center' as const,
  },
  // A glyph in the row's corner, not a labelled button under the summary. The
  // word cost a line of its own, which made a saved watch half again as tall
  // as the same watch in search.
  //
  // Out of the flow, with the title keeping its room instead: as a flex child
  // it took its width off every line of the summary, and the dealer's name
  // came back truncated by five pixels.
  action: {
    position: 'absolute' as const,
    top: space.md,
    right: space.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pressed: {
    opacity: 0.72,
  },
});
