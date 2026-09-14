import { Platform } from 'react-native';

import { radius, size, type Theme } from '@/lib/design';

const STYLE_ID = 'graham-scrollbars';

/**
 * React Native Web hands every scroll view the browser's default scrollbar. On
 * Windows and Linux that is a permanent grey trough wide enough to read as a
 * column of chrome beside the photographs, and there is no style prop for it —
 * real CSS is the only lever.
 *
 * Thin, no track, and a thumb in `borderStrong` so it registers as an edge
 * rather than a control. It stays `size.scrollbar` wide instead of shrinking to
 * a hairline, because a mouse has to be able to grab it and `hitSlop` is a
 * native-only idea.
 */
export function applyScrollbarStyle(theme: Theme) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const css = `
    * {
      scrollbar-width: thin;
      scrollbar-color: ${theme.color.borderStrong} transparent;
    }
    ::-webkit-scrollbar {
      width: ${size.scrollbar}px;
      height: ${size.scrollbar}px;
    }
    ::-webkit-scrollbar-track,
    ::-webkit-scrollbar-corner {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background-color: ${theme.color.borderStrong};
      border-radius: ${radius.lg}px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background-color: ${theme.color.textFaint};
    }
  `;

  const existing = document.getElementById(STYLE_ID);
  const element = existing ?? document.createElement('style');
  element.id = STYLE_ID;
  element.textContent = css;
  if (!existing) document.head.appendChild(element);
}
