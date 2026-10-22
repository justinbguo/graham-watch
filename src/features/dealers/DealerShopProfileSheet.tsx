import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Message } from '@/components/ui';
import { useUpdateDealerShop } from '@/data/dealers';
import { inset, layout, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

type Draft = {
  name: string;
  description: string;
  instagram: string;
  website: string;
  logoUrl: string;
};

function draftFrom(dealer: {
  name: string;
  description: string | null;
  instagram: string | null;
  website: string | null;
  logo_url: string | null;
}): Draft {
  return {
    name: dealer.name,
    description: dealer.description ?? '',
    instagram: dealer.instagram ?? '',
    website: dealer.website ?? '',
    logoUrl: dealer.logo_url ?? '',
  };
}

/** Edit shop name, bio, and links without filling the profile scroll. */
export function DealerShopProfileSheet({
  visible,
  dealerId,
  dealer,
  onClose,
}: {
  visible: boolean;
  dealerId: string;
  dealer: {
    name: string;
    description: string | null;
    instagram: string | null;
    website: string | null;
    logo_url: string | null;
  };
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(sheetStyles);
  const save = useUpdateDealerShop(dealerId);
  const [draft, setDraft] = useState(() => draftFrom(dealer));

  useEffect(() => {
    if (!visible) return;
    setDraft(draftFrom(dealer));
  }, [
    visible,
    dealer.name,
    dealer.description,
    dealer.instagram,
    dealer.website,
    dealer.logo_url,
  ]);

  const dirty =
    draft.name !== dealer.name ||
    draft.description !== (dealer.description ?? '') ||
    draft.instagram !== (dealer.instagram ?? '') ||
    draft.website !== (dealer.website ?? '') ||
    draft.logoUrl !== (dealer.logo_url ?? '');

  const submit = () => {
    save.mutate(
      {
        name: draft.name,
        description: draft.description,
        instagram: draft.instagram,
        website: draft.website,
        logo_url: draft.logoUrl,
      },
      { onSuccess: () => onClose() },
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
          <Text style={styles.title}>Shop profile</Text>
          <Message
            text="What buyers see on your shop page. Listings and catalogue refresh live on the Deal tab."
            tone="muted"
          />

          <Field
            accessibilityLabel="Shop name"
            value={draft.name}
            onChangeText={(name) => setDraft((prev) => ({ ...prev, name }))}
            autoCapitalize="words"
          />
          <Field
            accessibilityLabel="Bio"
            placeholder="About your shop"
            value={draft.description}
            onChangeText={(description) => setDraft((prev) => ({ ...prev, description }))}
            multiline
            numberOfLines={4}
            style={styles.bio}
          />
          <Field
            accessibilityLabel="Website"
            placeholder="your-shop.com"
            keyboardType="url"
            autoCapitalize="none"
            value={draft.website}
            onChangeText={(website) => setDraft((prev) => ({ ...prev, website }))}
          />
          <Field
            accessibilityLabel="Instagram handle"
            placeholder="handle"
            autoCapitalize="none"
            value={draft.instagram}
            onChangeText={(instagram) => setDraft((prev) => ({ ...prev, instagram }))}
          />
          <Field
            accessibilityLabel="Logo URL"
            placeholder="https://…"
            keyboardType="url"
            autoCapitalize="none"
            value={draft.logoUrl}
            onChangeText={(logoUrl) => setDraft((prev) => ({ ...prev, logoUrl }))}
          />

          {save.error ? <Message text={save.error.message} tone="error" /> : null}
          <View style={styles.actions}>
            <Button
              label="Save shop profile"
              loading={save.isPending}
              disabled={!dirty}
              onPress={submit}
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
  bio: {
    minHeight: 96,
    textAlignVertical: 'top' as const,
    paddingTop: inset.controlY,
  },
  actions: {
    gap: space.sm,
    paddingTop: space.xs,
  },
});
