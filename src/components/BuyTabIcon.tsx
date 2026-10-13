import { Image } from 'expo-image';
import type { ColorValue } from 'react-native';

import { size } from '@/lib/theme';

const MARK = require('../../assets/watch.svg');

/**
 * The Buy tab. One drawing, `assets/watch.svg`, at `size.tabIcon`. The file's
 * stroke is black, so the bar's colour is what shows: dim when idle, white
 * when this tab is on. There is no solid cut. The drawing is the outline.
 */
export function BuyTabIcon({ color }: { color: ColorValue }) {
  return (
    <Image
      source={MARK}
      style={mark}
      contentFit="contain"
      // expo-image tints with a string only. The bar passes theme strings; a
      // platform colour object would draw the file's own black.
      tintColor={typeof color === 'string' ? color : undefined}
      accessible={false}
    />
  );
}

const mark = {
  width: size.tabIcon,
  height: size.tabIcon,
};
