import { Platform, Text, View } from 'react-native';

import { Message } from '@/components/ui';
import { backendInfo } from '@/lib/backend';
import { radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Shows which Supabase the running app uses. Prevents logging into the wrong server. */
export function BackendEnvironment({ compact = false }: { compact?: boolean }) {
  const styles = useThemedStyles(cardStyles);
  const backend = backendInfo();

  if (compact) {
    return (
      <Text style={styles.compact} accessibilityLabel={`Backend: ${backend.title}, ${backend.host}`}>
        {backend.shortLabel}
      </Text>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{backend.title}</Text>
      <Text style={styles.host}>{backend.host}</Text>
      <Message text={backend.accountHint} />
    </View>
  );
}

const cardStyles = (theme: Theme) => ({
  card: {
    gap: stack.tight,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: theme.color.fill,
  },
  title: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  host: {
    ...type.caption,
    color: theme.color.textMuted,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  compact: {
    ...type.caption,
    color: theme.color.textMuted,
    textAlign: 'center' as const,
  },
});
