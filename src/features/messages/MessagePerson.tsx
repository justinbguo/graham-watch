import { ActionPill } from '@/components/ActionBar';
import { useMessagePerson } from '@/data/messages';
import { useOpenStack } from '@/lib/openStack';

/**
 * Write to whoever wrote this. The thread is found, not created, when one
 * already exists — so this button is "open the conversation with this person",
 * pressed twice or twenty times. A username typed on the Messages tab opens
 * the same thread.
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
