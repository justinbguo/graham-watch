import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { FilterPanel } from '@/features/filters/FilterPanel';
import type { Surface } from '@/features/filters/provider';
import { inset, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

const TITLES: Record<Surface, string> = {
  deck: 'Filter the deck',
  search: 'Narrow search',
  shop: 'Filter this shop',
};

export default function FilterSheet() {
  const { surface, dealerId } = useLocalSearchParams<{ surface: Surface; dealerId?: string }>();
  const styles = useThemedStyles(sheetStyles);
  const target: Surface = surface === 'search' ? 'search' : surface === 'shop' ? 'shop' : 'deck';
  const shopId = Array.isArray(dealerId) ? dealerId[0] : dealerId;

  return (
    <Screen title={TITLES[target]} inSheet>
      <FilterPanel surface={target} dealerId={shopId} />
      <View style={styles.footer}>
        <Button
          label="Done"
          onPress={() => {
            if (router.canDismiss()) router.dismiss();
            else router.back();
          }}
        />
      </View>
    </Screen>
  );
}

const sheetStyles = (_theme: Theme) => ({
  footer: {
    paddingHorizontal: inset.screen,
    paddingTop: space.md,
    paddingBottom: inset.screen,
  },
});
