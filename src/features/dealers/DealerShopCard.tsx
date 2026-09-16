import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Field, Message } from '@/components/ui';
import { useClaimDealer } from '@/data/dealers';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { DealerPanel } from './DealerPanel';
import type { DealerAccount, DealerTotals } from './workspace';

/**
 * The fast lane: this login is signed in as the very address the shop publishes,
 * and proved that mailbox to get here, so there is nothing further to check.
 * Every other dealer goes through /apply and receives a code.
 */
export function ClaimDealerCard({ dealer }: { dealer: DealerAccount }) {
  const styles = useThemedStyles(cardStyles);
  const claim = useClaimDealer();

  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <Text style={styles.name}>{dealer.name}</Text>
        <Message text="We hold this shop's inquiries at the address you signed in with. Claim it to manage its listings." />
      </View>
      {claim.error ? <Message text={claim.error.message} tone="error" /> : null}
      <Button
        label="Claim this shop"
        loading={claim.isPending}
        onPress={() => claim.mutate(dealer.id)}
      />
    </View>
  );
}

/** For a dealer whose login is not the address their site prints. */
export function ClaimByCodeCard({ onStart }: { onStart: () => void }) {
  const styles = useThemedStyles(cardStyles);

  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <Text style={styles.heading}>Do you run a shop listed here?</Text>
        <Message text="Tell us your website and we will send a code to a mailbox on it. You can keep signing in with whichever address you already use." />
      </View>
      <Button label="Claim your shop" onPress={onStart} />
    </View>
  );
}

export function DealerShopCard({
  shop,
  totals,
  onFindWatches,
}: {
  shop: DealerAccount;
  totals: DealerTotals;
  onFindWatches: (sourceUrl: string) => void;
}) {
  const styles = useThemedStyles(cardStyles);
  const [sourceUrl, setSourceUrl] = useState(shop.website ?? '');

  return (
    <View style={styles.group}>
      <View style={styles.card}>
        <DealerPanel dealer={shop} />

        <View style={styles.rule} />
        <View style={styles.stats}>
          <Stat value={totals.live} label="Live listings" />
          <Stat value={totals.saves} label="Saves" />
          <Stat value={totals.inquiries} label="Inquiries" />
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.copy}>
          <Text style={styles.heading}>Add or refresh inventory</Text>
          <Message text="We read your own catalogue page and compare it to what is here. New watches are yours to tick; prices and sold watches follow your site on their own." />
        </View>
        <Field
          accessibilityLabel="Catalogue URL"
          keyboardType="url"
          placeholder="https://your-shop.com/watches"
          value={sourceUrl}
          onChangeText={setSourceUrl}
        />
        <Button
          label="Refresh from my site"
          disabled={!sourceUrl.trim()}
          onPress={() => onFindWatches(sourceUrl.trim())}
        />
        <Text style={styles.hint}>
          Anything you correct by hand here is kept. A refresh never writes over your own edits.
        </Text>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const styles = useThemedStyles(cardStyles);

  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const cardStyles = (theme: Theme) => ({
  group: {
    gap: stack.related,
  },
  card: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: radius.md,
    padding: inset.card,
    gap: stack.related,
  },
  copy: {
    gap: stack.tight,
  },
  rule: {
    height: 1,
    backgroundColor: theme.color.border,
  },
  name: {
    ...type.title,
    color: theme.color.text,
  },
  heading: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  hint: {
    ...type.caption,
    color: theme.color.textFaint,
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
    ...type.price,
    color: theme.color.text,
  },
  statLabel: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
