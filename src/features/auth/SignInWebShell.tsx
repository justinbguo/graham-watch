import { useEffect, type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { CloseButton } from '@/components/ui';
import { inset, layout, motion, radius, shadow, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Centered card over a dimmed deck. Web sign-in route only. */
export function SignInWebShell({
  onClose,
  children,
}: PropsWithChildren<{ onClose: () => void }>) {
  const styles = useThemedStyles(shellStyles);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: motion.smooth });
  }, [progress]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: 0.96 + progress.value * 0.04 },
      { translateY: (1 - progress.value) * 16 },
    ],
  }));

  return (
    <View style={styles.root}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Not now">
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
      </Pressable>
      <KeyboardAvoidingView
        style={styles.center}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.cardBar}>
            <CloseButton onPress={onClose} />
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const shellStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: inset.screen,
  },
  scrim: {
    backgroundColor: theme.color.overlay,
  },
  center: {
    width: '100%' as const,
    maxWidth: layout.reading,
    alignSelf: 'center' as const,
  },
  card: {
    width: '100%' as const,
    backgroundColor: theme.color.background,
    borderRadius: radius.lg,
    paddingHorizontal: inset.screen,
    paddingBottom: space.xl,
    boxShadow: shadow.card,
  },
  cardBar: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
});
