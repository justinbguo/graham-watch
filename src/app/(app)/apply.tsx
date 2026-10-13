import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { CloseButton, Screen } from '@/components/ui';
import { ShopIntake } from '@/features/dealers/ShopIntake';
import { inset, stack } from '@/lib/theme';

/** For a dealer who skipped the shop step at sign-up, or applied and came back. */
export default function ApplyScreen() {
  return (
    <Screen
      title="Your shop"
      action={<CloseButton onPress={() => router.back()} />}
      width="reading"
      inSheet>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: inset.screen, paddingBottom: inset.screen, gap: stack.group }}
        keyboardShouldPersistTaps="handled">
        <ShopIntake onDone={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
