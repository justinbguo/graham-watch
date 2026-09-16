import { Platform, Text, View, type ViewStyle } from 'react-native';

import { inset, scrim, space, type, weight, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * The watch's name over its own photograph: maker and model, then the year in
 * the lighter cut, the way a dating app puts an age after a name. It is the
 * first thing a card says, so it belongs on the thing the eye is already on
 * rather than in a block underneath it.
 *
 * Nothing here is tappable. The carousel's paging zones sit behind it and keep
 * the whole photo, caption included.
 */
export function PhotoCaption({ name, year }: { name: string; year: number | null }) {
  const styles = useThemedStyles(captionStyles);

  return (
    <View pointerEvents="none" style={[styles.caption, gradient]}>
      <Text style={styles.name} numberOfLines={2}>
        {name}
        {year ? <Text style={styles.year}>, {year}</Text> : null}
      </Text>
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
    ...type.title,
    color: theme.color.onOverlay,
    // Belt and braces over a photograph shot on white: the fade is thinnest at
    // the top of the line, which is exactly where the capitals are.
    textShadowColor: theme.color.overlay,
    textShadowRadius: 12,
  },
  // The same size in the regular cut: a year is not a second title, and a
  // lighter weight after the comma is how the eye knows it is an aside.
  year: {
    fontWeight: weight.regular,
  },
});
