import { HIT_TARGET, inset, space, stack, type, type Theme } from '@/lib/theme';

export const buyerPaywallStyles = (theme: Theme) => ({
  page: {
    flex: 1,
    paddingHorizontal: inset.screen,
    paddingTop: space.sm,
    gap: space.md,
  },
  back: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'flex-start' as const,
    justifyContent: 'center' as const,
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.4 },
  title: {
    ...type.title,
    color: theme.color.text,
  },
  detail: {
    ...type.body,
    color: theme.color.textMuted,
  },
  planRow: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  actions: {
    marginTop: 'auto' as const,
    gap: space.sm,
  },
  note: {
    ...type.caption,
    color: theme.color.textMuted,
    textAlign: 'center' as const,
  },
  footerPad: {
    paddingBottom: inset.screen,
  },
});
