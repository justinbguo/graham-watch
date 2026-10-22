import type { PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { inset, layout, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Bottom sheet every deal step uses: offer, checkout, shipping, review. */
export function DealSheetShell({
  visible,
  title,
  closeLabel,
  onClose,
  children,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
}>) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(shellStyles);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + inset.screen }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}>
            <Text style={styles.heading}>{title}</Text>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const shellStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  scrim: {
    backgroundColor: theme.color.overlay,
  },
  sheet: {
    width: '100%' as const,
    maxWidth: layout.dealSheet,
    alignSelf: 'center' as const,
    backgroundColor: theme.color.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: inset.screen,
    paddingTop: space.lg,
    maxHeight: '92%' as const,
  },
  scroll: {
    gap: stack.related,
  },
  heading: {
    ...type.title,
    color: theme.color.text,
  },
});

/** Shared action-stack spacing under a sheet's content. */
export const dealSheetActionStyles = {
  actions: {
    gap: space.sm,
    paddingTop: space.xs,
  },
  row: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
};
