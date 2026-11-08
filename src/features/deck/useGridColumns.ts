import { useEffect, useState } from 'react';

import { isGridColumnOption, type GridColumnOption } from '@/lib/gridColumns';
import { secureStorage } from '@/lib/secureStorage';

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
