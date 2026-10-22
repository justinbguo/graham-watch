import { Platform } from 'react-native';

const STYLE_ID = 'graham-web-chrome';

const CSS = `
  * {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  ::-webkit-scrollbar {
    display: none;
  }
  *:focus {
    outline: none;
  }
`;

/**
 * React Native Web hands every scroll view the browser's default scrollbar,
 * and there is no style prop for it — real CSS is the only lever.
 *
 * It is gone. A styled thin thumb was still a grey column standing beside the
 * photographs on Windows and Linux, permanently, on every scroll view in the
 * app including the ones inside a card. Scrolling still works by wheel, drag,
 * keyboard, and trackpad; only the drawing is removed.
 *
 * What is lost: the bar was the one hint that a region had more below it, and
 * the one way to drag to a position with a mouse. The card carries its own
 * hint — content cut off at its bottom edge — and no surface here is long
 * enough to need dragging.
 *
 * No theme: hidden has no colour, so this runs once and never repaints.
 *
 * Browsers also paint a default blue focus ring on inputs and buttons. The app
 * uses fill and border for state instead (docs/DESIGN.md), so focus outlines
 * are suppressed on web the same way scrollbars are.
 */
export function hideScrollbars() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const element = document.createElement('style');
  element.id = STYLE_ID;
  element.textContent = CSS;
  document.head.appendChild(element);
}
