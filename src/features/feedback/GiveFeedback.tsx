import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable } from 'react-native';

import { DeckRailButton } from '@/components/DeckRailButton';
import { Button } from '@/components/ui';
import { FEEDBACK_LABEL, FEEDBACK_URL } from '@/features/feedback/contact';
import { openExternal } from '@/lib/openExternal';
import { HIT_TARGET, size, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

function openFeedback(): void {
  openExternal(FEEDBACK_URL);
}

export function GiveFeedback({ placement }: { placement: 'rail' | 'header' | 'plain' }) {
  const styles = useThemedStyles(headerStyles);
  const theme = useTheme();

  if (placement === 'rail') {
    return (
      <DeckRailButton
        label={FEEDBACK_LABEL}
        icon="message-text-outline"
        onPress={openFeedback}
        accessibilityRole="link"
      />
    );
  }
  if (placement === 'header') {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={FEEDBACK_LABEL}
        onPress={openFeedback}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <MaterialCommunityIcons
          name="message-text-outline"
          size={size.icon}
          color={theme.color.text}
        />
      </Pressable>
    );
  }
  return (
    <Button
      label={FEEDBACK_LABEL}
      variant="ghost"
      compact
      onPress={openFeedback}
      accessibilityRole="link"
    />
  );
}

const headerStyles = (_theme: Theme) => ({
  header: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
  },
  pressed: {
    opacity: 0.72,
  },
});
