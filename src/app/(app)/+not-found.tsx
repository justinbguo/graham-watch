import { router } from 'expo-router';

import { Button, Centered, Message, Screen } from '@/components/ui';

export default function NotFound() {
  return (
    <Screen title="Not found">
      <Centered>
        <Message text="This page is not on Graham." />
        <Button label="See the watches" onPress={() => router.replace('/')} />
      </Centered>
    </Screen>
  );
}
