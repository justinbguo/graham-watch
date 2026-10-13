import { face } from '@/lib/design';

/**
 * The six cuts `type` actually sets, the wordmark included. Loaded once, in
 * the root layout. Italics and the thinner and blacker files stay out of the
 * bundle: nothing in the scale asks for them.
 *
 * Keys are the family names in `face`. SDK 57 treats each file as its own
 * family, so the key has to be the string a style's `fontFamily` uses.
 */
export const haasFonts = {
  [face.text.regular]: require('../../assets/fonts/NHaasGroteskTXPro-55Rg.otf'),
  [face.text.medium]: require('../../assets/fonts/NHaasGroteskTXPro-65Md.otf'),
  [face.text.bold]: require('../../assets/fonts/NHaasGroteskTXPro-75Bd.otf'),
  [face.display.regular]: require('../../assets/fonts/NHaasGroteskDSPro-55Rg.otf'),
  [face.display.medium]: require('../../assets/fonts/NHaasGroteskDSPro-65Md.otf'),
  [face.display.bold]: require('../../assets/fonts/NHaasGroteskDSPro-75Bd.otf'),
};
