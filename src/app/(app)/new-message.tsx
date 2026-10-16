import { router } from 'expo-router';

import { CloseButton, Screen } from '@/components/ui';
import { StartChat } from '@/features/messages/StartChat';

export default function NewMessageRoute() {
  return (
    <Screen title="New message" action={<CloseButton onPress={() => router.back()} />} inSheet>
      <StartChat />
    </Screen>
  );
}
