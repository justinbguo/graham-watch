import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Eyebrow, Message, Screen, Spinner } from '@/components/ui';
import { forgetRole, takeRole, type AccountRole } from '@/features/auth/role';
import { BuyerFlow } from '@/features/onboarding/BuyerFlow';
import { DealerFlow } from '@/features/onboarding/DealerFlow';
import { onboardingStyles } from '@/features/onboarding/styles';
import { HIT_TARGET, inset, radius, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export default function Onboarding() {
  const [role, setRole] = useState<AccountRole | null>(null);
  const [resolving, setResolving] = useState(true);

  // Picked on the sign-in screen and stashed, because the session that carries
  // it can arrive through a deep link or a browser round trip that never comes
  // back to that screen. A missing stash is a real case, not an error.
  useEffect(() => {
    let live = true;
    void takeRole()
      .then((stored) => {
        if (live) setRole(stored);
        // Cleared once read. Left behind, the next person to sign in on this
        // device would silently inherit whichever door the last one picked.
        return forgetRole();
      })
      .finally(() => {
        if (live) setResolving(false);
      });
    return () => {
      live = false;
    };
  }, []);

  if (resolving) {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }

  if (!role) return <RoleStep onChoose={setRole} />;
  return role === 'dealer' ? <DealerFlow /> : <BuyerFlow />;
}

/** The fallback fork, for a session that arrived without the sign-in stash. */
function RoleStep({ onChoose }: { onChoose: (role: AccountRole) => void }) {
  const layout = useThemedStyles(onboardingStyles);

  return (
    <Screen>
      <View style={layout.body}>
        <View style={layout.header}>
          <Eyebrow>First question</Eyebrow>
          <Text style={layout.heading}>Are you buying or selling?</Text>
          <Message text="You can change this later by writing to us." />
        </View>

        <View style={layout.form}>
          <Choice
            title="I'm looking for a watch"
            detail="Swipe a deck and write to the dealer when one is right."
            onPress={() => onChoose('buyer')}
          />
          <Choice
            title="I sell watches"
            detail="List your shop's stock and answer buyers directly."
            onPress={() => onChoose('dealer')}
          />
        </View>
      </View>
    </Screen>
  );
}

function Choice({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(roleStyles);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </Pressable>
  );
}

const roleStyles = (theme: Theme) => ({
  card: {
    borderRadius: radius.md,
    padding: inset.card,
    minHeight: HIT_TARGET,
    gap: stack.tight,
    backgroundColor: theme.color.surface,
  },
  title: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  detail: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  pressed: {
    opacity: 0.72,
  },
});
