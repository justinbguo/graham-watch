import { inset, space, stack, type, type Theme } from '@/lib/theme';

/**
 * Shared by every onboarding step so the two flows cannot drift apart
 * visually. A buyer and a dealer answer different questions on the same page.
 */
export const onboardingStyles = (theme: Theme) => ({
  body: {
    flex: 1,
    paddingHorizontal: inset.screen,
    paddingBottom: inset.screen,
    gap: stack.section,
  },
  header: {
    gap: stack.tight,
  },
  heading: {
    ...type.display,
    color: theme.color.text,
  },
  form: {
    gap: stack.related,
  },
  brands: {
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
