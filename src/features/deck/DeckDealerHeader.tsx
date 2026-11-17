import { Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useDealerIdentity } from '@/data/dealers';
import { DealerMark, Instagram, Website } from '@/features/dealers/DealerLinks';
import { FollowDealer } from '@/features/dealers/FollowDealer';
import { DEALER_NAME_PLACEHOLDER, dealerDisplayName } from '@/features/filters/dealers';
import { HIT_TARGET, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export function DeckDealerHeader({
  dealerId,
  name,
  onShowAll,
}: {
  dealerId: string;
  name?: string | null;
  onShowAll: () => void;
}) {
  const styles = useThemedStyles(headerStyles);
  const { data, isPending, isError } = useDealerIdentity(dealerId);
  // Identity wins once it has loaded a real name. The directory name covers
  // the wait. A blank, or a name that is the shop id, is not a name.
  const resolvedName = dealerDisplayName(dealerId, [
    { id: dealerId, name: data?.name },
    { id: dealerId, name },
  ]);
  const title = resolvedName ?? DEALER_NAME_PLACEHOLDER;
  const missing = !isPending && (isError || data == null);

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.identity}>
          {data ? <DealerMark logoUrl={data.logo_url} /> : null}
          <Text style={[styles.name, resolvedName == null && styles.nameMuted]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Button label="All watches" variant="ghost" compact onPress={onShowAll} />
      </View>
      {missing ? <Text style={styles.missing}>Shop details did not load.</Text> : null}
      {data?.description ? <Text style={styles.description}>{data.description}</Text> : null}
      {data ? <FollowDealer dealer={data} surface="buy" /> : null}
      {data?.website ? <Website url={data.website} /> : null}
      {data?.instagram ? <Instagram handle={data.instagram} /> : null}
    </View>
  );
}

const headerStyles = (theme: Theme) => ({
  header: {
    gap: stack.related,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: HIT_TARGET,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  name: {
    ...type.title,
    color: theme.color.text,
    flexShrink: 1,
  },
  nameMuted: {
    color: theme.color.textMuted,
  },
  description: {
    ...type.label,
    color: theme.color.text,
  },
  missing: {
    ...type.label,
    color: theme.color.textMuted,
  },
});
