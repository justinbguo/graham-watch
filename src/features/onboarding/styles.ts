import { Platform } from 'react-native';

import { HIT_TARGET, inset, space, stack, type, type Theme } from '@/lib/theme';

// A single line must not carry `lineHeight`. iOS turns the extra into a
// baseline offset on the typed value and leaves the placeholder where it was.
const { lineHeight, ...lineFace } = type.title;
void lineHeight;

/**
 * Shared by every onboarding step so the two branches cannot drift apart
 * visually. A buyer and a dealer answer different questions on the same page.
 */
export const onboardingStyles = (theme: Theme) => ({
  body: {
    flex: 1,
    paddingHorizontal: inset.screen,
    // Below the notch inset `Screen` already paid, so the question sits
    // lower than a settings page. The footer stays at the bottom.
    paddingTop: space.xl,
    gap: stack.section,
  },
  header: {
    gap: stack.tight,
  },
  back: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'flex-start' as const,
    justifyContent: 'center' as const,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.4,
  },
  /** Takes the room between the heading and the footer, so the footer can stay put. */
  content: {
    flex: 1,
    minHeight: 0,
  },
  fill: {
    flex: 1,
  },
  heading: {
    ...type.display,
    color: theme.color.text,
  },
  form: {
    gap: stack.related,
  },
  lines: {
    gap: space.xl,
  },
  line: {
    ...lineFace,
    color: theme.color.text,
    minHeight: HIT_TARGET,
    paddingTop: 0,
    paddingBottom: space.sm,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    textAlignVertical: 'bottom' as const,
    includeFontPadding: false,
  },
  usernameBlock: {
    gap: space.sm,
  },
  // The @ is part of the name, drawn rather than typed, so the rule runs
  // under both and the field's own rule is turned off.
  usernameRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  // iOS centres a field's letters in the area above the padding. Android pins
  // them to the bottom. A Text in that same box draws from the top, so the @
  // sat above the name.
  atWrap: {
    height: HIT_TARGET,
    paddingBottom: space.sm,
    justifyContent: (Platform.OS === 'ios' ? 'center' : 'flex-end') as 'center' | 'flex-end',
  },
  at: {
    ...lineFace,
    color: theme.color.text,
    includeFontPadding: false,
  },
  usernameInput: {
    flex: 1,
    borderBottomWidth: 0,
  },
  collector: {
    ...type.body,
    color: theme.color.textMuted,
  },
  birthdayReadout: {
    ...type.title,
    color: theme.color.text,
  },
  choices: {
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
    paddingBottom: space.md,
  },
  /** Where the list would have been: a spinner, an error, or nothing to pick. */
  insteadOfList: {
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
    paddingTop: space.md,
  },
  actions: {
    marginTop: 'auto' as const,
    gap: stack.related,
  },
});
