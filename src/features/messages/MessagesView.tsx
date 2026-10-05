import { View } from 'react-native';

import { HeaderIcon } from '@/components/HeaderIcon';
import { Message, Screen } from '@/components/ui';
import { inset, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { ConversationList } from './ConversationList';

/**
 * The message list, laid over whichever tab opened it. Close is an X because
 * this is a layer on that tab, not a step back through it: an arrow would say
 * the list was the previous screen.
 */
export function MessagesView({ onClose }: { onClose: () => void }) {
  const { userId } = useSession();
  const styles = useThemedStyles(viewStyles);
  const close = <HeaderIcon label="Close" name="close" onPress={onClose} />;

  if (!userId) {
    return (
      <Screen title="Messages" inTabs action={close}>
        <View style={styles.note}>
          <Message text="Sign in to read your messages." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Messages" inTabs action={close}>
      <ConversationList userId={userId} />
    </Screen>
  );
}

const viewStyles = (_theme: Theme) => ({
  note: {
    paddingHorizontal: inset.screen,
  },
});
