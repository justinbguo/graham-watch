import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Message } from '@/components/ui';
import { useSaved } from '@/data/listings';
import { fullName, useProfile, useSetAvatar } from '@/data/profile';
import { HIT_TARGET, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * expo-image-picker is the system photo sheet. A text field for a URL would
 * work without a native module, but nobody has a hosted jpeg of their face
 * ready to paste. Camera is off: this is a library pick, not a selfie booth.
 */
export function ProfileHeader() {
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);
  const { data: saved = [] } = useSaved(userId);
  const setAvatar = useSetAvatar(userId);
  const [pickError, setPickError] = useState<string | null>(null);
  const styles = useThemedStyles(headerStyles);
  const theme = useTheme();

  const name = fullName(profile) ?? 'Collector';
  const savedLabel = `${saved.length} watch${saved.length === 1 ? '' : 'es'} saved`;
  const photoLabel = profile?.avatar_url ? 'Change profile picture' : 'Add a profile picture';
  const errorText = pickError ?? setAvatar.error?.message;

  const pickPhoto = async () => {
    setPickError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setAvatar.mutate({
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
    } catch (error) {
      setPickError(error instanceof Error ? error.message : 'Could not open photos.');
    }
  };

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={photoLabel}
          disabled={setAvatar.isPending}
          onPress={pickPhoto}
          style={({ pressed }) => [pressed && styles.pressed]}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.photo} contentFit="cover" />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]}>
              <MaterialCommunityIcons
                name="account-outline"
                size={size.icon}
                color={theme.color.textMuted}
              />
            </View>
          )}
        </Pressable>
        <View style={styles.copy}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.saved}>{savedLabel}</Text>
        </View>
      </View>
      {errorText ? <Message text={errorText} tone="error" /> : null}
    </View>
  );
}

const headerStyles = (theme: Theme) => ({
  block: {
    gap: stack.related,
    paddingVertical: space.md,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.lg,
    minHeight: HIT_TARGET,
  },
  photo: {
    width: size.thumb,
    height: size.thumb,
    borderRadius: radius.sm,
    backgroundColor: theme.color.surfaceSunken,
  },
  photoEmpty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  copy: {
    flex: 1,
    gap: stack.tight,
  },
  name: {
    ...type.title,
    color: theme.color.text,
  },
  saved: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  pressed: {
    opacity: 0.72,
  },
});
