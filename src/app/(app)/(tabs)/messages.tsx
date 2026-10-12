import { View } from 'react-native';

import { Message, Screen } from '@/components/ui';
import { ConversationList } from '@/features/messages/ConversationList';
import { inset, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Messages() {
  const { userId } = useSession();
  const styles = useThemedStyles(screenStyles);

  if (!userId) {
    return (
      <Screen title="Messages" inTabs>
        <View style={styles.note}>
          <Message text="Sign in to read your messages." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Messages" inTabs>
      <ConversationList userId={userId} />
    </Screen>
  );
}

const screenStyles = (_theme: Theme) => ({
  note: {
    paddingHorizontal: inset.screen,
  },
});
