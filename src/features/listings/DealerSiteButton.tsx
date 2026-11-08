import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { Button } from '@/components/ui';
import { listingSourceUrl } from '@/lib/listingSource';

export function openListingSource(url: string): void {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(url);
}

export function DealerSiteButton({ url }: { url: string | null | undefined }) {
  const href = listingSourceUrl(url);
  if (!href) return null;
  return (
    <Button label="View on dealer site" variant="solid" onPress={() => openListingSource(href)} />
  );
}
