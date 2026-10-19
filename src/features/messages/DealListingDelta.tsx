import { Text, View } from 'react-native';

import { formatCents, listingOfferDelta } from '@/lib/money';
import { radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export function DealListingDelta({
  offerCents,
  listPriceCents,
  currency = 'USD',
  onAccent = false,
}: {
  offerCents: number;
  listPriceCents: number | null | undefined;
  currency?: string;
  onAccent?: boolean;
}) {
  const styles = useThemedStyles(deltaStyles);
  const delta = listingOfferDelta(offerCents, listPriceCents);
  if (!delta || listPriceCents == null || listPriceCents <= 0) return null;

  const listed = formatCents(listPriceCents, currency);

  if (delta.kind === 'at_list') {
    return (
      <View style={styles.block}>
        <Text style={[styles.listed, onAccent && styles.onAccentMuted]}>Listed {listed}</Text>
        <Text style={[styles.neutral, onAccent && styles.onAccentMuted]}>At listed price</Text>
      </View>
    );
  }

  const dollars = formatCents(delta.amountCents, currency);
  const isDiscount = delta.kind === 'discount';

  return (
    <View style={styles.block}>
      <Text style={[styles.listed, onAccent && styles.onAccentMuted]}>Listed {listed}</Text>
      <View
        style={[
          styles.pill,
          isDiscount ? styles.pillDiscount : styles.pillPremium,
          onAccent && (isDiscount ? styles.pillDiscountAccent : styles.pillPremiumAccent),
        ]}>
        <Text
          style={[
            styles.pillText,
            isDiscount ? styles.discountText : styles.premiumText,
            onAccent && styles.pillTextAccent,
          ]}>
          {isDiscount
            ? `${delta.percent}% off · ${dollars} below list`
            : `${delta.percent}% above · ${dollars} over list`}
        </Text>
      </View>
    </View>
  );
}

const deltaStyles = (theme: Theme) => ({
  block: {
    gap: space.xs,
    alignSelf: 'stretch' as const,
  },
  listed: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  onAccentMuted: {
    color: theme.color.onAccent,
    opacity: 0.72,
  },
  neutral: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  pill: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.md,
  },
  pillDiscount: {
    backgroundColor: theme.color.money + '1A',
  },
  pillDiscountAccent: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  pillPremium: {
    backgroundColor: theme.color.danger + '14',
  },
  pillPremiumAccent: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  pillText: {
    ...type.labelStrong,
  },
  discountText: {
    color: theme.color.money,
  },
  premiumText: {
    color: theme.color.danger,
  },
  pillTextAccent: {
    color: theme.color.onAccent,
  },
});
