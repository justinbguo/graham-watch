import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/** `conversations.title` refuses a longer name. The field stops here too. */
const GROUP_NAME_MAX = 40;

/**
 * The group's name in the thread header. Tap it to rename. An empty name
 * clears the stored one, and the header goes back to the other people.
 */
export function GroupTitle({
  name,
  givenName,
  editing,
  onStart,
  onClose,
  onCommit,
}: {
  name: string;
  givenName: string | null;
  editing: boolean;
  onStart: () => void;
  onClose: () => void;
  onCommit: (title: string) => void;
}) {
  const styles = useThemedStyles(titleStyles);
  const theme = useTheme();
  const field = useRef<TextInput>(null);
  const [draft, setDraft] = useState(givenName ?? '');
  const finished = useRef(false);

  function finish() {
    if (finished.current) return;
    finished.current = true;
    const cleaned = draft.trim().replace(/\s+/g, ' ');
    if (cleaned === (givenName ?? '')) onClose();
    else onCommit(cleaned);
  }

  if (!editing) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Rename ${name}`}
        onPress={() => {
          setDraft(givenName ?? '');
          finished.current = false;
          onStart();
        }}
        style={({ pressed }) => [styles.name, pressed && styles.pressed]}>
        <Text style={styles.label}>{name}</Text>
        <MaterialCommunityIcons
          name="pencil-outline"
          size={size.iconSmall}
          color={theme.color.textMuted}
        />
      </Pressable>
    );
  }

  return (
    <View style={styles.name}>
      <TextInput
        ref={field}
        accessibilityLabel="Group name"
        value={draft}
        onChangeText={setDraft}
        placeholder="Group name"
        placeholderTextColor={theme.color.textMuted}
        autoCapitalize="words"
        autoCorrect
        autoFocus
        maxLength={GROUP_NAME_MAX}
        returnKeyType="done"
        onSubmitEditing={() => field.current?.blur()}
        onBlur={finish}
        style={styles.input}
      />
    </View>
  );
}

const titleStyles = (theme: Theme) => ({
  name: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    ...type.title,
    color: theme.color.text,
    flexShrink: 1,
  },
  input: {
    fontFamily: type.title.fontFamily,
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    letterSpacing: type.title.letterSpacing,
    color: theme.color.text,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    padding: 0,
    margin: 0,
  },
});
