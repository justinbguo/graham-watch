import { Text, useWindowDimensions, View } from 'react-native';

import { Button, Heading, Message } from '@/components/ui';
import { useCompleteOnboarding } from '@/data/profile';
import { FilterPanel } from '@/features/filters/FilterPanel';
import { useFilters } from '@/features/filters/provider';
import { useIsDesktopWeb } from '@/lib/layout';
import { inset, layout, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

/**
 * The only desktop question after sign-in, and the same panel as Filter with
 * shops left out. Choices write the deck filter as they are checked.
 */
export function FirstRunSheet() {
  const desktop = useIsDesktopWeb();
  const { height } = useWindowDimensions();
  const styles = useThemedStyles(sheetStyles);
  const { filters, clear } = useFilters('deck');
  const { userId } = useSession();
  const complete = useCompleteOnboarding(userId);

  const finish = (brands: string[]) => {
    complete.mutate({
      firstName: '',
      lastName: '',
      username: '',
      dateOfBirth: null,
      accountType: 'buyer',
      collectionSize: null,
      favoriteBrands: brands,
      searchPainPoints: [],
      notificationsEnabled: false,
    });
  };

  return (
    <View style={[styles.scrim, desktop ? styles.scrimDesktop : styles.scrimPhone]} accessibilityViewIsModal>
      <View
        style={[
          styles.card,
          desktop ? { maxWidth: layout.reading, height: Math.round(height * 0.8) } : styles.cardPhone,
        ]}>
        <View style={styles.copy}>
          <Heading>What should we show you first?</Heading>
          <Text style={styles.detail}>Pick a few. Skip if you would rather just look.</Text>
        </View>
        <FilterPanel surface="deck" showDealers={false} />
        {complete.error ? <Message text={complete.error.message} tone="error" /> : null}
        <View style={styles.actions}>
          <Button
            label="Skip"
            variant="ghost"
            disabled={complete.isPending}
            onPress={() => {
              clear();
              finish([]);
            }}
          />
          <Button
            label="See watches"
            loading={complete.isPending}
            onPress={() => finish(filters.brands)}
          />
        </View>
      </View>
    </View>
  );
}

const sheetStyles = (theme: Theme) => ({
  scrim: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    backgroundColor: theme.color.overlay,
    padding: inset.screen,
  },
  scrimDesktop: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  scrimPhone: {
    justifyContent: 'flex-end' as const,
  },
  card: {
    width: '100%' as const,
    flexDirection: 'column' as const,
    backgroundColor: theme.color.surface,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
  },
  cardPhone: {
    flex: 1,
    maxHeight: '100%' as const,
  },
  copy: {
    paddingHorizontal: inset.screen,
    paddingTop: space.lg,
    gap: stack.tight,
  },
  detail: {
    ...type.body,
    color: theme.color.inkMuted,
  },
  actions: {
    paddingHorizontal: inset.screen,
    paddingTop: space.md,
    paddingBottom: inset.screen,
    gap: space.sm,
  },
});
