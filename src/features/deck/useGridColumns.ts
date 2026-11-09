import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gridColumnsFor, isGridColumnOption, type GridColumnOption } from '@/lib/gridColumns';
import { desktopGridColumns, useIsDesktopWeb, useIsWide } from '@/lib/layout';
import { secureStorage } from '@/lib/secureStorage';
import { layout } from '@/lib/theme';

const STORAGE_KEY = 'graham.grid-columns';

export function useGridColumnChoice() {
  const [chosen, setChosen] = useState<GridColumnOption | null>(null);

  useEffect(() => {
    void secureStorage.getItem(STORAGE_KEY).then((stored) => {
      const parsed = Number(stored);
      if (isGridColumnOption(parsed)) setChosen(parsed);
    });
  }, []);

  const choose = (next: GridColumnOption) => {
    setChosen(next);
    void secureStorage.setItem(STORAGE_KEY, String(next));
  };

  return { chosen, choose };
}

export function useDeckColumns() {
  const wide = useIsWide();
  const isDesktopWeb = useIsDesktopWeb();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { chosen, choose } = useGridColumnChoice();
  const automatic = isDesktopWeb
    ? desktopGridColumns(width, insets.left, insets.right)
    : layout.gridColumns;
  const columns = gridColumnsFor(wide, automatic, chosen);
  return { columns, choose };
}
