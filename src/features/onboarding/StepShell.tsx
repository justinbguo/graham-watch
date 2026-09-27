import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Message, Screen } from '@/components/ui';
import { useKeyboardOverlap } from '@/lib/keyboard';
import { inset, size, space } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { onboardingStyles } from './styles';

/**
 * The slide grammar lives in docs/DESIGN.md under "Onboarding is one slide
 * grammar". Keeping its hierarchy here prevents individual questions from
 * inventing their own safe-area, type, or footer treatment.
 */
export function StepShell({
  heading,
  detail,
  children,
  error,
  actions,
  onBack,
  backDisabled = false,
}: {
  heading: string;
  detail: string;
  children?: ReactNode;
  error?: string | null;
  actions: ReactNode;
  /** Absent on the first slide and the age-blocked slide, which have nowhere to return. */
  onBack?: () => void;
  backDisabled?: boolean;
}) {
  const styles = useThemedStyles(onboardingStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // `Screen` already padded the home indicator under the actions.
  const keyboardOverlap = useKeyboardOverlap(insets.bottom);

  return (
    <Screen>
      {/* Taps on Continue would otherwise blur the field and close the
          keyboard before the next slide can take it. */}
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.body,
          { flexGrow: 1, paddingBottom: inset.screen + keyboardOverlap },
        ]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        scrollEnabled={false}>
        <View style={styles.header}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              accessibilityState={{ disabled: backDisabled }}
              hitSlop={space.sm}
              disabled={backDisabled}
              onPress={onBack}
              style={({ pressed }) => [
                styles.back,
                pressed && styles.pressed,
                backDisabled && styles.disabled,
              ]}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={size.icon}
                color={theme.color.text}
              />
            </Pressable>
          ) : null}
          <Text style={styles.heading}>{heading}</Text>
          <Message text={detail} />
        </View>
        <View style={styles.content}>{children}</View>
        {error ? <Message text={error} tone="error" /> : null}
        <View style={styles.actions}>{actions}</View>
      </ScrollView>
    </Screen>
  );
}
