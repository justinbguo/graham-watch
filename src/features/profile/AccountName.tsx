import { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Message } from '@/components/ui';
import { fullName, useProfile, useSetName } from '@/data/profile';
import { NAME_MAX_LENGTH, parseName } from '@/lib/personName';
import { space, stack, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

export function AccountName() {
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);
  const save = useSetName(userId);
  const styles = useThemedStyles(nameStyles);
  const stored = fullName(profile) ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const typed = draft ?? stored;
  const check = parseName(typed, profile?.first_name);
  const tooLong = !check.ok && check.reason === 'too_long';
  const storedFirst = profile?.first_name?.trim() ?? '';
  const storedLast = profile?.last_name?.trim() || null;
  const unchanged =
    check.ok && check.name.first === storedFirst && (check.name.last ?? null) === storedLast;
  const canSave = check.ok && !unchanged;

  const commit = () => {
    if (!canSave || !check.ok) return;
    save.mutate(check.name, { onSuccess: () => setDraft(null) });
  };

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Field
          value={typed}
          onChangeText={setDraft}
          placeholder="Your name"
          accessibilityLabel="Your name"
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={commit}
          style={styles.field}
        />
        <Button label="Save" disabled={!canSave} loading={save.isPending} onPress={commit} />
      </View>
      {tooLong ? <Message text={`Use ${NAME_MAX_LENGTH} characters or fewer.`} tone="error" /> : null}
      {save.error ? <Message text={save.error.message} tone="error" /> : null}
    </View>
  );
}

const nameStyles = (_theme: Theme) => ({
  block: {
    gap: stack.tight,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  field: {
    flex: 1,
    minWidth: 0,
  },
});
