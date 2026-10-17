import * as Haptics from 'expo-haptics';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { space, tracking, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import type { ExchangeIntent } from '@/data/exchange';

export function priceDigitsToCents(digits: string): number | null {
  if (!digits) return null;
  const dollars = Number(digits);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return dollars * 100;
}

export function centsToPriceDigits(cents: number | null) {
  if (cents == null) return '';
  return String(cents / 100);
}

function bumpStep(dollars: number) {
  if (dollars >= 25_000) return 5_000;
  if (dollars >= 10_000) return 1_000;
  if (dollars >= 1_000) return 500;
  return 100;
}

function formatDigits(digits: string) {
  if (!digits) return '';
  return Number(digits).toLocaleString('en-US');
}

/**
 * Selling and buying posts: a `$` you tap to step the figure up, and digits you
 * can type. No field chrome — just type on the page.
 */
export function PostPriceField({
  intent,
  digits,
  onChangeDigits,
}: {
  intent: ExchangeIntent;
  digits: string;
  onChangeDigits: (next: string) => void;
}) {
  const styles = useThemedStyles(fieldStyles);
  const theme = useTheme();
  const display = formatDigits(digits);
  const kicker = intent === 'buy' ? 'Budget' : 'Price';

  const bump = () => {
    const current = Number(digits) || 0;
    const next = String(current + bumpStep(current));
    onChangeDigits(next);
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
  };

  const setDigits = (raw: string) => {
    onChangeDigits(raw.replace(/[^0-9]/g, '').slice(0, 9));
  };

  return (
    <View style={styles.block}>
      <Text style={styles.kicker}>{kicker}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${kicker.toLowerCase()}`}
          onPress={bump}
          hitSlop={8}
          style={({ pressed }) => [styles.signHit, pressed && styles.pressed]}>
          <Text style={styles.sign}>$</Text>
        </Pressable>
        <TextInput
          accessibilityLabel={`${kicker} in dollars`}
          value={display}
          onChangeText={(text) => setDigits(text.replace(/,/g, ''))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.color.textFaint}
          style={styles.amount}
          selectTextOnFocus
        />
      </View>
    </View>
  );
}

const fieldStyles = (theme: Theme) => ({
  block: {
    gap: space.xs,
  },
  kicker: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
  },
  signHit: {
    paddingRight: space.xs,
    paddingBottom: 2,
  },
  pressed: {
    opacity: 0.72,
  },
  sign: {
    ...type.price,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: tracking.title,
    color: theme.color.text,
  },
  amount: {
    ...type.price,
    flex: 1,
    minWidth: 0,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: tracking.title,
    padding: 0,
    margin: 0,
    color: theme.color.text,
    backgroundColor: 'transparent',
    includeFontPadding: false,
  },
});
