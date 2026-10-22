import { View } from 'react-native';

import { Heading, Message } from '@/components/ui';
import { space, stack, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Right pane when no thread is selected. Desktop split layout only. */
export function MessagesPanePlaceholder() {
  const styles = useThemedStyles(placeholderStyles);
  return (
    <View style={styles.root}>
      <Heading>Select a conversation</Heading>
      <Message
        text="Pick someone from the list, search for a username, or start a new message."
      />
    </View>
  );
}

const placeholderStyles = (_theme: Theme) => ({
  root: {
    flex: 1,
    alignItems: 'flex-start' as const,
    padding: space.xxl,
    gap: stack.related,
  },
});
