import { Pressable, Text, View } from 'react-native';

import { CheckMark } from '@/components/CheckRow';
import { HIT_TARGET, inset, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import type { ConversationWith } from '@/data/messages';

import { PartyAvatar } from './PartyAvatar';
import { partyName } from './party';

/**
 * A person in a multi-select list: photograph, name, handle, and the same
 * trailing checkbox as filters and onboarding.
 */
export function PersonPickRow({
  who,
  selected,
  onPress,
  onOpenParty,
  busy = false,
  divider = true,
  label,
}: {
  who: ConversationWith;
  selected: boolean;
  onPress: () => void;
  onOpenParty?: () => void;
  busy?: boolean;
  divider?: boolean;
  label?: string;
}) {
  const styles = useThemedStyles(rowStyles);
  const name = partyName(who);
  const detail =
    who.kind === 'person' && who.name && who.handle ? `@${who.handle}` : undefined;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label ?? name}
      accessibilityState={{ checked: selected, disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.press, pressed && !busy && styles.pressed]}>
      <View style={[styles.row, divider && styles.divider, busy && styles.busy]}>
        <PartyAvatar who={who} onPress={onOpenParty} />
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {detail ? (
            <Text style={styles.detail} numberOfLines={1}>{detail}</Text>
          ) : null}
        </View>
        <CheckMark selected={selected} />
      </View>
    </Pressable>
  );
}

const rowStyles = (theme: Theme) => ({
  press: {
    alignSelf: 'stretch' as const,
  },
  pressed: {
    opacity: 0.72,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: HIT_TARGET,
    paddingVertical: inset.controlY,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  busy: {
    opacity: 0.4,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: stack.tight,
  },
  name: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  detail: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
