import { Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useDealerIdentity } from '@/data/dealers';
import { DealerMark, Instagram, Website } from '@/features/dealers/DealerLinks';
import { FollowDealer } from '@/features/dealers/FollowDealer';
import { HIT_TARGET, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export function DeckDealerHeader({
  dealerId,
  onShowAll,
}: {
  dealerId: string;
  onShowAll: () => void;
}) {
  const styles = useThemedStyles(headerStyles);
  const { data, isPending, isError } = useDealerIdentity(dealerId);
  const missing = !isPending && (isError || data == null);

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        {data ? (
          <View style={styles.identity}>
            <DealerMark logoUrl={data.logo_url} />
            <Text style={styles.name} numberOfLines={1}>
              {data.name}
            </Text>
          </View>
        ) : (
          <View style={styles.fill} />
        )}
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
  fill: {
    flex: 1,
  },
  name: {
    ...type.title,
    color: theme.color.text,
    flexShrink: 1,
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
