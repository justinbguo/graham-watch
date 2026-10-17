import { Pressable, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { dealerSocialButtonStyles, dealerSocialHitSlop } from '@/features/dealers/socialButton';
import { BUYER_PLAN_FALLBACK } from '@/features/subscriptions/buyerPaywallCopy';
import { buyerPaywallStyles } from '@/features/subscriptions/buyerPaywallStyles';
import { planPrice } from '@/features/subscriptions/packages';
import { space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

type PlanId = 'monthly' | 'yearly';

function planCaption(id: PlanId, pkg: PurchasesPackage | null): string {
  if (pkg) return planPrice(pkg);
  const fallback = id === 'yearly' ? BUYER_PLAN_FALLBACK.yearly : BUYER_PLAN_FALLBACK.monthly;
  return `${fallback.price}/${fallback.period}`;
}

export function BuyerPaywallPlans({
  monthly,
  yearly,
  selected,
  onSelect,
}: {
  monthly: PurchasesPackage | null;
  yearly: PurchasesPackage | null;
  selected: PlanId;
  onSelect: (id: PlanId) => void;
}) {
  const styles = useThemedStyles(buyerPaywallStyles);
  const chip = useThemedStyles(planChipStyles);

  const rows: { id: PlanId; pkg: PurchasesPackage | null; label: string }[] = [
    { id: 'yearly', pkg: yearly, label: 'Yearly' },
    { id: 'monthly', pkg: monthly, label: 'Monthly' },
  ];

  return (
    <View style={styles.planRow}>
      {rows.map(({ id, pkg, label }) => {
        const active = selected === id;
        return (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            hitSlop={dealerSocialHitSlop()}
            onPress={() => onSelect(id)}
            style={({ pressed }) => [
              chip.button,
              chip.block,
              active && chip.solid,
              pressed && chip.pressed,
            ]}>
            <Text style={[chip.name, active && chip.solidLabel]}>{label}</Text>
            <Text style={[chip.price, active && chip.solidLabel]}>{planCaption(id, pkg)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const planChipStyles = (theme: Theme) => {
  const base = dealerSocialButtonStyles(theme);
  return {
    button: {
      ...base.button,
      flexDirection: 'column' as const,
      paddingVertical: space.sm,
      gap: 2,
    },
    block: base.block,
    solid: base.solid,
    pressed: base.pressed,
    name: base.label,
    price: {
      ...type.caption,
      color: theme.color.text,
      opacity: 0.9,
    },
    solidLabel: base.solidLabel,
  };
};
