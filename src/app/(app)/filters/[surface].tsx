import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { FilterPanel } from '@/features/filters/FilterPanel';
import type { Surface } from '@/features/filters/provider';
import { inset, stack, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const TITLES: Record<Surface, string> = {
  deck: 'Filter the deck',
  search: 'Narrow the search',
};

export default function FilterSheet() {
  const { surface } = useLocalSearchParams<{ surface: Surface }>();
  const styles = useThemedStyles(sheetStyles);
  const target: Surface = surface === 'search' ? 'search' : 'deck';

  return (
    <Screen title={TITLES[target]}>
      <FilterPanel surface={target} />
      <View style={styles.footer}>
        <Button label="Done" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const sheetStyles = (_theme: Theme) => ({
  footer: {
    paddingHorizontal: inset.screen,
    paddingBottom: inset.screen,
    gap: stack.related,
  },
});
