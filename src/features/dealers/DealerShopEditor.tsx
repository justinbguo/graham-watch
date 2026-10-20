import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Message } from '@/components/ui';
import { useDealerShop } from '@/data/dealers';
import { dealerSocialButtonStyles, dealerSocialHitSlop } from '@/features/dealers/socialButton';
import { fieldChrome, inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { dealerPicture } from './picture';
import { DealerShopProfileSheet } from './DealerShopProfileSheet';
import type { DealerTotals } from './workspace';

/** Claimed shop on Profile: identity, stats, and a sheet to edit public details. */
export function DealerShopEditor({
  dealerId,
  totals,
}: {
  dealerId: string;
  totals: DealerTotals;
}) {
  const styles = useThemedStyles(editorStyles);
  const { data, isPending, error } = useDealerShop(dealerId);
  const [editOpen, setEditOpen] = useState(false);

  if (isPending || !data?.dealer) {
    return error ? <Message text="Your shop did not load." tone="error" /> : null;
  }

  const dealer = data.dealer;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Your shop</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          hitSlop={dealerSocialHitSlop()}
          onPress={() => setEditOpen(true)}
          style={({ pressed }) => [styles.edit, pressed && styles.pressed]}>
          <Text style={styles.editLabel} numberOfLines={1}>Edit profile</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.identity}>
          <Avatar
            url={dealer.logo_url}
            px={size.avatar}
            fit="contain"
            fallback={dealerPicture}
          />
          <Text style={styles.name} numberOfLines={2}>{dealer.name}</Text>
        </View>

        {dealer.description ? (
          <Text style={styles.about}>{dealer.description}</Text>
        ) : null}

        <View style={styles.rule} />
        <View style={styles.stats}>
          <Stat value={totals.live} label="Live listings" />
          <Stat value={totals.saves} label="Wishlists" />
          <Stat value={totals.inquiries} label="Inquiries" />
        </View>
      </View>

      <DealerShopProfileSheet
        visible={editOpen}
        dealerId={dealerId}
        dealer={dealer}
        onClose={() => setEditOpen(false)}
      />
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const styles = useThemedStyles(editorStyles);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const editorStyles = (theme: Theme) => {
  const social = dealerSocialButtonStyles(theme);
  return {
    section: {
      gap: stack.related,
    },
    headerRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.sm,
    },
    heading: {
      ...type.title,
      color: theme.color.text,
      flex: 1,
      minWidth: 0,
    },
    edit: {
      ...social.button,
      ...social.solid,
    },
    editLabel: {
      ...social.label,
      ...social.solidLabel,
    },
    pressed: social.pressed,
    card: {
      ...fieldChrome(theme),
      borderRadius: radius.md,
      padding: inset.card,
      gap: stack.related,
    },
    identity: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.md,
    },
    name: {
      ...type.bodyStrong,
      color: theme.color.text,
      flex: 1,
      minWidth: 0,
    },
    about: {
      ...type.label,
      color: theme.color.text,
    },
    rule: {
      height: 1,
      backgroundColor: theme.color.border,
    },
    stats: {
      flexDirection: 'row' as const,
      gap: space.md,
    },
    stat: {
      flex: 1,
      gap: stack.tight,
    },
    statValue: {
      ...type.panelLead,
      color: theme.color.text,
    },
    statLabel: {
      ...type.panelNote,
      color: theme.color.textMuted,
    },
  };
};
