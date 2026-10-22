import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SearchBarShell } from '@/components/SearchBar';
import type { SearchBarRect } from '@/lib/searchLaunch';
import { controlText, motion, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const PLACEHOLDER = 'Search';

/**
 * One frame that flies from the door on Buy into the sheet's field. The sheet
 * still slides; this is the bar continuing the same object.
 */
export function SearchMorph({
  from,
  to,
  onDone,
}: {
  from: SearchBarRect;
  to: SearchBarRect;
  onDone: () => void;
}) {
  const styles = useThemedStyles(morphStyles);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: motion.base }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
  }, [onDone, progress]);

  const frame = useAnimatedStyle(() => ({
    left: from.x + (to.x - from.x) * progress.value,
    top: from.y + (to.y - from.y) * progress.value,
    width: from.width + (to.width - from.width) * progress.value,
    height: from.height + (to.height - from.height) * progress.value,
  }));

  const label = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.flyer, frame]}>
        <SearchBarShell>
          <Animated.Text style={[styles.label, label]} numberOfLines={1}>
            {PLACEHOLDER}
          </Animated.Text>
        </SearchBarShell>
      </Animated.View>
    </View>
  );
}

const morphStyles = (theme: Theme) => ({
  flyer: {
    position: 'absolute' as const,
  },
  label: {
    ...controlText.body,
    flex: 1,
    color: theme.color.inkMuted,
  },
});
