import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { Button, Heading, Message } from '@/components/ui';
import { fullName, useCompleteOnboarding, useProfile } from '@/data/profile';
import { FilterPanel } from '@/features/filters/FilterPanel';
import { useFilters } from '@/features/filters/provider';
import { useFocusOnShow } from '@/features/onboarding/focus';
import { LineField } from '@/features/onboarding/LineField';
import { onboardingStyles } from '@/features/onboarding/styles';
import { useIsDesktopWeb } from '@/lib/layout';
import { NAME_MAX_LENGTH, parseName, type PersonName } from '@/lib/personName';
import { inset, layout, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useTheme, useThemedStyles } from '@/providers/theme';

type Step = { at: 'name' } | { at: 'filters'; name: PersonName };

export function FirstRunSheet() {
  const desktop = useIsDesktopWeb();
  const { height } = useWindowDimensions();
  const styles = useThemedStyles(sheetStyles);
  const slide = useThemedStyles(onboardingStyles);
  const theme = useTheme();
  const { filters, clear } = useFilters('deck');
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);
  const complete = useCompleteOnboarding(userId);
  const [typed, setTyped] = useState(() => fullName(profile) ?? '');
  const [step, setStep] = useState<Step>({ at: 'name' });
  const check = parseName(typed, profile?.first_name);

  const toFilters = () => {
    if (check.ok) setStep({ at: 'filters', name: check.name });
  };

  const finish = (name: PersonName, brands: string[]) => {
    complete.mutate({
      name,
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
        {step.at === 'name' ? (
          <>
            <View style={styles.copy}>
              <Heading>What should we call you?</Heading>
              <Text style={styles.detail}>Dealers see this name when you ask about a watch.</Text>
            </View>
            <NameLine
              value={typed}
              onChangeText={setTyped}
              onSubmit={toFilters}
              tooLong={!check.ok && check.reason === 'too_long'}
            />
            <View style={styles.actions}>
              <Button label="Continue" disabled={!check.ok} onPress={toFilters} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.copy}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                accessibilityState={{ disabled: complete.isPending }}
                hitSlop={space.sm}
                disabled={complete.isPending}
                onPress={() => setStep({ at: 'name' })}
                style={[slide.back, complete.isPending && slide.disabled]}>
                <MaterialCommunityIcons name="arrow-left" size={size.icon} color={theme.color.ink} />
              </Pressable>
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
                  finish(step.name, []);
                }}
              />
              <Button
                label="See watches"
                loading={complete.isPending}
                onPress={() => finish(step.name, filters.brands)}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// Focus runs on mount. Back refocuses only because this child unmounts.
function NameLine({
  value,
  onChangeText,
  onSubmit,
  tooLong,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  tooLong: boolean;
}) {
  const ref = useFocusOnShow();
  const theme = useTheme();
  const styles = useThemedStyles(sheetStyles);
  return (
    <View style={styles.nameBody}>
      <LineField
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder="Your name"
        accessibilityLabel="Your name"
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        placeholderTextColor={theme.color.inkMuted}
        style={styles.nameLine}
      />
      {tooLong ? <Message text={`Use ${NAME_MAX_LENGTH} characters or fewer.`} tone="error" /> : null}
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
  nameBody: {
    flex: 1,
    paddingHorizontal: inset.screen,
    paddingTop: space.lg,
    gap: stack.related,
  },
  nameLine: {
    color: theme.color.ink,
  },
  actions: {
    paddingHorizontal: inset.screen,
    paddingTop: space.md,
    paddingBottom: inset.screen,
    gap: space.sm,
  },
});
