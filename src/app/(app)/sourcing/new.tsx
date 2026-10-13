import { router } from 'expo-router';

import { CloseButton, Screen } from '@/components/ui';
import { fullName, useProfile } from '@/data/profile';
import { useCreateSourcingRequest } from '@/data/sourcing';
import { RequestComposer } from '@/features/sourcing/RequestComposer';
import { useSession } from '@/providers/session';

export default function NewSourcingRequest() {
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);
  const create = useCreateSourcingRequest();
  const authorName = fullName(profile) ?? 'You';

  return (
    <Screen title="New request" action={<CloseButton onPress={() => router.back()} />}>
      <RequestComposer
        authorId={userId ?? 'anonymous'}
        authorName={authorName}
        submitting={create.isPending}
        error={create.error?.message}
        onSubmit={(input) => {
          create.mutate(input, {
            onSuccess: (request) => router.replace(`/sourcing/${request.id}`),
          });
        }}
      />
    </Screen>
  );
}
