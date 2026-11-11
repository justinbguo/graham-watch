import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { CheckRow } from '@/components/CheckRow';
import { SegmentedChoice } from '@/components/SegmentedChoice';
import { Button, Heading } from '@/components/ui';
import { TASTE_BRANDS, TASTE_STYLES, type GuestTaste } from '@/data/guestTaste';
import type { PriceBand } from '@/data/rank';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const PRICE: { value: PriceBand | 'any'; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'low', label: 'Under 5k' },
  { value: 'mid', label: '5 to 15k' },
  { value: 'high', label: 'Over 15k' },
];

/**
 * A few picks before a guest's first deck. Skip leaves the cold-start order.
 * The choices stay on the device and seed the same score a signed-in buyer gets
 * from events.
 */
export function GuestTasteSheet({
  onSettle,
}: {
  onSettle: (taste: Omit<GuestTaste, 'settled'>) => void;
}) {
  const styles = useThemedStyles(sheetStyles);
  const [brands, setBrands] = useState<string[]>([]);
  const [pickedStyles, setPickedStyles] = useState<string[]>([]);
  const [price, setPrice] = useState<PriceBand | 'any'>('any');

  const taste = {
    brands,
    styles: pickedStyles,
    priceBand: price === 'any' ? null : price,
  };

  return (
    <View style={styles.scrim} accessibilityViewIsModal>
      <View style={styles.card}>
        <Heading>What should we show you first?</Heading>
        <Text style={styles.detail}>A few picks. Skip if you would rather just look.</Text>
        <ScrollView style={styles.list} contentContainerStyle={styles.choices}>
          {TASTE_BRANDS.map((brand) => (
            <CheckRow
              key={brand}
              label={brand}
              selected={brands.includes(brand)}
              onPress={() =>
                setBrands((current) =>
                  current.includes(brand) ? current.filter((item) => item !== brand) : [...current, brand],
                )
              }
            />
          ))}
          {TASTE_STYLES.map((style) => (
            <CheckRow
              key={style.value}
              label={style.label}
              selected={pickedStyles.includes(style.value)}
              onPress={() =>
                setPickedStyles((current) =>
                  current.includes(style.value)
                    ? current.filter((item) => item !== style.value)
                    : [...current, style.value],
                )
              }
            />
          ))}
        </ScrollView>
        <Text style={styles.priceLabel}>Price</Text>
        <SegmentedChoice label="Price" value={price} options={PRICE} onChange={setPrice} />
        <View style={styles.actions}>
          <Button
            label="Skip"
            variant="ghost"
            onPress={() => onSettle({ brands: [], styles: [], priceBand: null })}
          />
          <Button label="See watches" variant="solid" onPress={() => onSettle(taste)} />
        </View>
      </View>
    </View>
  );
}

const sheetStyles = (theme: Theme) => ({
  scrim: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    justifyContent: 'flex-end' as const,
    backgroundColor: theme.color.overlay,
    padding: inset.screen,
  },
  card: {
    maxHeight: '100%' as const,
    backgroundColor: theme.color.surface,
    borderRadius: radius.lg,
    padding: inset.card,
    gap: stack.related,
  },
  detail: {
    ...type.body,
    color: theme.color.inkMuted,
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
  },
  choices: {
    gap: space.xs,
  },
  priceLabel: {
    ...type.label,
    color: theme.color.inkMuted,
  },
  actions: {
    gap: space.sm,
  },
});
