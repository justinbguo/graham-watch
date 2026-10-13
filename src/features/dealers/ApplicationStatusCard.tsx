import { Text, View } from 'react-native';

import { Button, Message } from '@/components/ui';
import { VOLUME_LABELS, type DealerApplication } from '@/data/applications';
import { inset, radius, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * Where an application stands, on the tab a dealer already opens.
 *
 * Three states and no invented progress bar. An operator reads applications by
 * hand, so there is no percentage to show and inventing one would be the same
 * mistake as the seeded star rating.
 */
export function ApplicationStatusCard({
  application,
  onFinishVerifying,
}: {
  application: DealerApplication;
  onFinishVerifying: () => void;
}) {
  const styles = useThemedStyles(cardStyles);
  const verified = Boolean(application.verified_at);

  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <Text style={styles.name}>{application.shop_name}</Text>
        <Text style={styles.website}>{application.website}</Text>
      </View>

      <View style={styles.rule} />

      {application.status === 'declined' ? (
        <>
          <Message
            text={
              application.note ??
              'We are not able to list this shop. Write to us if you think that is wrong.'
            }
            tone="error"
          />
          <Message text="You can apply again with a different site." />
          <Button label="Apply again" onPress={onFinishVerifying} />
        </>
      ) : verified ? (
        <>
          <Message text="Your application is with us and the mailbox is proved. Someone here reads every one by hand and will write to you either way." />
          <Text style={styles.detail}>
            {[
              application.brands.length
                ? `${application.brands.slice(0, 4).join(' · ')}`
                : null,
              VOLUME_LABELS[application.volume].toLowerCase() + ' at a time',
            ]
              .filter(Boolean)
              .join(' — ')}
          </Text>
        </>
      ) : (
        <>
          {/* Unverified is the state that needs an action, so it gets the one
              button. An operator cannot act on it until the mailbox is proved. */}
          <Message text="One step left: prove a mailbox on your own domain so we know this application came from the shop." />
          <Button label="Send me a code" variant="solid" onPress={onFinishVerifying} />
        </>
      )}
    </View>
  );
}

const cardStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.color.surface,
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
  website: {
    ...type.caption,
    color: theme.color.brass,
  },
  detail: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
