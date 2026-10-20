import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { secureStorage } from '@/lib/secureStorage';
import { themes, type ColorScheme, type Theme } from '@/lib/theme';
import { hideScrollbars } from '@/lib/webScrollbars';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'graham.theme';

type ThemeState = {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  // Light until someone chooses otherwise. A stored choice still wins, so
  // Settings is not reset on the next launch.
  const [preference, setPreferenceState] = useState<ThemePreference>('light');

  useEffect(() => {
    // secureStorage rather than a separate key-value dependency: it already
    // exists, already handles web, and a theme choice is not worth another
    // native module.
    secureStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void secureStorage.setItem(STORAGE_KEY, next);
  }, []);

  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  // Browser chrome lives outside the React tree, so the rule that hides it is
  // written to the document. It has no colour, so the scheme never touches it.
  useEffect(hideScrollbars, []);

  const value = useMemo(
    () => ({ theme: themes[scheme], preference, setPreference }),
    [scheme, preference, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useThemeContext must be used inside ThemeProvider.');
  return context;
}

export function useTheme() {
  return useThemeContext().theme;
}

/**
 * Styles have to be rebuilt when the scheme flips, so they cannot be created at
 * module scope any more. Pass a factory defined outside the component and this
 * memoizes the result per theme.
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T
): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [theme, factory]);
}
