import { ConversationRow } from './ConversationRow';

/**
 * The offer under a finished username. It is not a thread yet: the row opens
 * one, or the one that already exists, when it is pressed.
 */
export function MessageHandle({
  handle,
  busy,
  onPress,
  desktop = false,
}: {
  handle: string;
  busy: boolean;
  onPress: () => void;
  desktop?: boolean;
}) {
  return (
    <ConversationRow
      desktop={desktop}
      conversation={{
        id: `compose:${handle}`,
        with: {
          kind: 'person',
          userId: null,
          name: null,
          handle,
          number: 0,
          avatar_url: null,
        },
        last: null,
        unread: 0,
        threadDealerId: null,
      }}
      detail="New message"
      label={`New message to @${handle}`}
      busy={busy}
      onPress={onPress}
    />
  );
}
