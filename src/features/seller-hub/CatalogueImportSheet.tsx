import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Message } from '@/components/ui';
import { useUpdateDealerShop } from '@/data/dealers';
import { useOpenStack } from '@/lib/openStack';
import { inset, layout, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Compact sheet: catalogue URL then refresh from the dealer's site. */
export function CatalogueImportSheet({
  visible,
  dealerId,
  website,
  onClose,
}: {
  visible: boolean;
  dealerId: string;
  website: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(sheetStyles);
  const open = useOpenStack();
  const save = useUpdateDealerShop(dealerId);
  const [sourceUrl, setSourceUrl] = useState(website ?? '');

  useEffect(() => {
    if (visible) setSourceUrl(website ?? '');
  }, [visible, website]);

  const refresh = async () => {
    const url = sourceUrl.trim();
    if (!url) return;
    if (url !== (website ?? '').trim()) {
      await save.mutateAsync({ website: url });
    }
    onClose();
    open(
      'import-inventory',
      { dealerId, sourceUrl: url },
      { pathname: '/import-inventory', params: { dealerId, sourceUrl: url } },
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + inset.screen }]}>
        <Text style={styles.title}>Refresh from your site</Text>
        <Message
          text="We compare your catalogue page to what is here. New watches are yours to approve; prices and sold status follow your site."
          tone="muted"
        />
        <Field
          accessibilityLabel="Catalogue URL"
          keyboardType="url"
          placeholder="https://your-shop.com/watches"
          value={sourceUrl}
          onChangeText={setSourceUrl}
          autoCapitalize="none"
        />
        {save.error ? <Message text={save.error.message} tone="error" /> : null}
        <View style={styles.actions}>
          <Button
            label="Refresh from site"
            loading={save.isPending}
            disabled={!sourceUrl.trim()}
            onPress={() => void refresh().catch(() => {})}
          />
          <Button label="Cancel" variant="ghost" disabled={save.isPending} onPress={onClose} />
        </View>
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  scrim: {
    backgroundColor: theme.color.overlay,
  },
  sheet: {
    marginTop: 'auto' as const,
    width: '100%' as const,
    maxWidth: layout.dealSheet,
    alignSelf: 'center' as const,
    backgroundColor: theme.color.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: inset.screen,
    paddingTop: space.lg,
    gap: stack.related,
  },
  title: {
    ...type.title,
    color: theme.color.text,
  },
  actions: {
    gap: space.sm,
    paddingTop: space.xs,
  },
});
