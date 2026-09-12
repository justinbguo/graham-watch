import { Pressable, Text, View } from 'react-native';

import { Button, Eyebrow, Message, Screen } from '@/components/ui';
import { useSaved } from '@/data/listings';
import { signOut } from '@/lib/auth';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemeContext, useThemedStyles, type ThemePreference } from '@/providers/theme';

const APPEARANCE: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function Profile() {
  const { session, userId } = useSession();
  const { data: saved = [] } = useSaved(userId);
  const { preference, setPreference } = useThemeContext();
  const styles = useThemedStyles(profileStyles);

  return (
    <Screen title="Profile">
      <View style={styles.body}>
        <View style={styles.identity}>
          <Eyebrow>Signed in as</Eyebrow>
          <Text style={styles.email}>{session?.user.email ?? 'Signed in'}</Text>
          <Message text={`${saved.length} watch${saved.length === 1 ? '' : 'es'} saved`} />
        </View>

        <View style={styles.section}>
          <Eyebrow>Appearance</Eyebrow>
          <View style={styles.segmented}>
            {APPEARANCE.map((option) => {
              const isActive = preference === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setPreference(option.value)}
                  style={[styles.segment, isActive && styles.segmentActive]}>
                  <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.footer}>
          <Button label="Sign out" variant="secondary" onPress={() => signOut()} />
        </View>
      </View>
    </Screen>
  );
}

const profileStyles = (theme: Theme) => ({
  body: {
    flex: 1,
    paddingHorizontal: inset.screen,
    gap: stack.section,
  },
  identity: {
    gap: stack.tight,
  },
  email: {
    ...type.title,
    color: theme.color.text,
  },
  section: {
    gap: stack.related,
  },
  segmented: {
    flexDirection: 'row' as const,
    backgroundColor: theme.color.surfaceSunken,
    borderRadius: radius.md,
    padding: space.xs,
    gap: space.xs,
  },
  segment: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: space.md,
    borderRadius: radius.sm,
  },
  segmentActive: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  segmentLabel: {
    ...type.label,
    color: theme.color.textMuted,
  },
  segmentLabelActive: {
    color: theme.color.text,
  },
  footer: {
    marginTop: 'auto' as const,
    paddingBottom: inset.screen,
  },
});
