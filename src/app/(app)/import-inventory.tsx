import { router, useLocalSearchParams } from 'expo-router';

import { Button, Centered, CloseButton, Message, Screen } from '@/components/ui';
import { ImportPreview } from '@/features/dealers/ImportPreview';
import { useCatalogImport } from '@/features/dealers/import';

function param(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function ImportInventoryScreen() {
  const params = useLocalSearchParams<{ dealerId?: string; sourceUrl?: string }>();
  const dealerId = param(params.dealerId);
  const sourceUrl = param(params.sourceUrl);
  const picker = useCatalogImport(dealerId, sourceUrl);

  if (!dealerId || !sourceUrl) {
    return (
      <Screen title="Choose watches" inSheet>
        <Centered>
          <Message text="That import link is missing the shop or the URL." tone="error" />
          <Button label="Close" variant="outline" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen
      title="Choose watches"
      action={<CloseButton onPress={() => router.back()} />}
      inSheet>
      <ImportPreview picker={picker} onDone={() => router.back()} />
    </Screen>
  );
}
