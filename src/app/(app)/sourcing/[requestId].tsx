import { router, useLocalSearchParams } from 'expo-router';

import { Button, Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { fullName, useProfile } from '@/data/profile';
import { useReplyToRequest, useSourcingRequest, useToggleLooking } from '@/data/sourcing';
import { RequestThread } from '@/features/sourcing/RequestThread';
import { useSession } from '@/providers/session';

export default function SourcingRequestScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);
  const { data: request, isPending } = useSourcingRequest(requestId);
  const toggleLooking = useToggleLooking();
  const reply = useReplyToRequest({
    id: userId ?? 'anonymous',
    name: fullName(profile) ?? 'You',
  });

  if (isPending) {
    return (
      <Screen action={<CloseButton onPress={() => router.back()} />}>
        <Spinner />
      </Screen>
    );
  }

  if (!request) {
    return (
      <Screen title="Source" action={<CloseButton onPress={() => router.back()} />}>
        <Centered>
          <Message text="That request is gone." tone="error" />
          <Button label="Close" variant="secondary" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen title="Source" action={<CloseButton onPress={() => router.back()} />}>
      <RequestThread
        request={request}
        lookingBusy={toggleLooking.isPending}
        replyBusy={reply.isPending}
        replyError={reply.error?.message}
        onToggleLooking={() => toggleLooking.mutate(request.id)}
        onReply={(body) => reply.mutate({ requestId: request.id, body })}
      />
    </Screen>
  );
}
