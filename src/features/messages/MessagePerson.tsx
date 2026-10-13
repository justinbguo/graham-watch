import { ActionPill } from '@/components/ActionBar';
import { useMessagePerson } from '@/data/messages';
import { useOpenStack } from '@/lib/openStack';

/**
 * Write to whoever wrote this. There is no directory of people in Graham and
 * no way to look someone up by handle: a conversation starts from something
 * they put on the board, which is also the only thing you know about them.
 *
 * The thread is found, not created, when one already exists — so this button
 * is "open the conversation with this person", pressed twice or twenty times.
 */
export function MessagePerson({ userId, name }: { userId: string; name: string }) {
  const open = useOpenStack();
  const start = useMessagePerson();

  return (
    <ActionPill
      mark={require('../../../assets/message.svg')}
      label={`Message ${name}`}
      busy={start.isPending}
      onPress={() =>
        start.mutate(userId, {
          onSuccess: (conversationId) =>
            open(
              'conversation/[conversationId]',
              { conversationId },
              `/conversation/${conversationId}`
            ),
        })
      }
    />
  );
}
