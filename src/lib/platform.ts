/**
 * Node cannot parse `react-native` (`import typeof` in its entry).
 * Metro still resolves this `require`. On web the Expo babel plugin rewrites
 * that call to `react-native-web`. A Node test has no `require`, so the
 * stand-in lets layout code load. The app never takes that branch.
 */
type Dims = { width: number; height: number; scale: number; fontScale: number };
type Insets = { top: number; right: number; bottom: number; left: number };

type Native = {
  Platform: { OS: string };
  useWindowDimensions: () => Dims;
  useSafeAreaInsets: () => Insets;
};

function load(): Native {
  try {
    const rn = require('react-native');
    const safe = require('react-native-safe-area-context');
    return {
      Platform: rn.Platform,
      useWindowDimensions: rn.useWindowDimensions,
      useSafeAreaInsets: safe.useSafeAreaInsets,
    };
  } catch (error) {
    if (typeof require === 'function') throw error;
    return {
      Platform: { OS: 'web' },
      useWindowDimensions: () => ({ width: 0, height: 0, scale: 1, fontScale: 1 }),
      useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    };
  }
}

const native = load();

export const Platform = native.Platform;
export const useWindowDimensions = native.useWindowDimensions;
export const useSafeAreaInsets = native.useSafeAreaInsets;
