import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Message } from '@/components/ui';
import { useSaved } from '@/data/listings';
import { fullName, useProfile, useSetAvatar } from '@/data/profile';
import { size, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

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

  const name = fullName(profile) ?? 'Collector';
  const savedLabel = `${saved.length} ${saved.length === 1 ? 'watch' : 'watches'} on your wishlist`;
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
          style={({ pressed }) => [styles.photoPress, pressed && styles.pressed]}>
          <Avatar url={profile?.avatar_url ?? null} px={size.profile} />
        </Pressable>

        <View style={styles.copy}>
          <Text style={styles.name}>{name}</Text>
          {profile?.handle ? <Text style={styles.handle}>@{profile.handle}</Text> : null}
          {profile ? (
            <Text style={styles.saved}>{`Collector #${profile.collector_number}`}</Text>
          ) : null}
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
  },
  // The face and who you are, side by side. Aligned at the top, so the name
  // starts on the photo's top edge rather than floating against its middle.
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.md,
  },
  // The photo is `size.profile`, the height of the type beside it, and
  // already wider than a hit target. Left to stretch it would be a press
  // area the height of the whole block.
  photoPress: {
    alignSelf: 'flex-start' as const,
  },
  // Takes the rest of the row, so a long name wraps inside it instead of
  // pushing the block wider than the page.
  copy: {
    flex: 1,
    gap: stack.tight,
  },
  name: {
    ...type.title,
    color: theme.color.text,
  },
  handle: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  saved: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  pressed: {
    opacity: 0.72,
  },
});
