import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { HIT_TARGET, inset, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * The author's own controls on their post. Edit and Delete are rare and one of
 * them is irreversible, so they wait behind the dots instead of sitting under
 * every post as two full-width buttons.
 */
export function PostMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const styles = useThemedStyles(menuStyles);
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.anchor}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Your post"
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        onPress={() => setOpen((was) => !was)}
        style={({ pressed }) => [styles.dots, pressed && styles.pressed]}>
        <MaterialCommunityIcons
          name="dots-horizontal"
          size={size.icon}
          color={open ? theme.color.text : theme.color.textMuted}
        />
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          <Item
            label="Edit"
            icon="pencil-outline"
            onPress={() => {
              setOpen(false);
              onEdit();
            }}
          />
          <Item
            label="Delete"
            icon="delete-outline"
            tone="danger"
            onPress={() => {
              setOpen(false);
              onDelete();
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function Item({
  label,
  icon,
  tone,
  onPress,
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tone?: 'danger';
  onPress: () => void;
}) {
  const styles = useThemedStyles(menuStyles);
  const theme = useTheme();
  const color = tone === 'danger' ? theme.color.danger : theme.color.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <MaterialCommunityIcons name={icon} size={size.iconSmall} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

// Smaller than HIT_TARGET so the author's line does not grow to hold it; the
// hitSlop makes up the difference.
const DOTS = size.icon + space.sm;

const menuStyles = (theme: Theme) => ({
  anchor: {
    // The menu is absolute inside this, so the whole group has to paint above
    // the rows that come after it in the post.
    zIndex: 1,
  },
  dots: {
    width: DOTS,
    height: DOTS,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pressed: {
    opacity: 0.72,
  },
  menu: {
    position: 'absolute' as const,
    top: DOTS + space.xs,
    right: 0,
    minWidth: 160,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    overflow: 'hidden' as const,
  },
  item: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: inset.controlX,
    minHeight: HIT_TARGET,
  },
  label: {
    ...type.labelStrong,
  },
});
