import { router } from 'expo-router';

import { PausedFrame } from '@/components/PausedBanner';
import { CloseButton, Screen } from '@/components/ui';
import { StartChat } from '@/features/messages/StartChat';

export default function NewMessageRoute() {
  return (
    <PausedFrame>
      <Screen title="New message" action={<CloseButton onPress={() => router.back()} />} inSheet>
        <StartChat />
      </Screen>
    </PausedFrame>
  );
}
