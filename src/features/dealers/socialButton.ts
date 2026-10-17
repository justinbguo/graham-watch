import { HIT_TARGET, dealerSocial, size, space, type, type Theme } from '@/lib/theme';

/** Shared chrome for Follow and Message on a shop. */
export function dealerSocialButtonStyles(theme: Theme) {
  return {
    button: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      alignSelf: 'flex-start' as const,
      justifyContent: 'center' as const,
      gap: space.xs,
      minHeight: dealerSocial.minHeight,
      paddingHorizontal: dealerSocial.paddingX,
      borderRadius: dealerSocial.radius,
      borderWidth: 1,
      borderColor: theme.color.text,
      backgroundColor: theme.color.background,
    },
    /** Two-up in a row: each half of the content width, label centred. */
    block: {
      flex: 1,
      alignSelf: 'stretch' as const,
      minWidth: 0,
    },
    solid: {
      backgroundColor: theme.color.text,
    },
    pressed: {
      opacity: 0.72,
    },
    label: {
      ...type.labelStrong,
      color: theme.color.text,
    },
    solidLabel: {
      color: theme.color.background,
    },
    mark: {
      width: size.icon,
      height: size.icon,
    },
  };
}

export function dealerSocialHitSlop() {
  return (HIT_TARGET - dealerSocial.minHeight) / 2;
}
