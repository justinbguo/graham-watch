import { Pressable } from 'react-native';

import { Avatar } from '@/components/Avatar';
import type { ConversationWith } from '@/data/messages';
import { dealerPicture } from '@/features/dealers/picture';
import { space } from '@/lib/theme';

/** A person's photograph, or a shop's mark contained in the same square. */
export function PartyAvatar({
  who,
  px,
  onPress,
}: {
  who: ConversationWith;
  px?: number;
  onPress?: () => void;
}) {
  if (who.kind === 'group') {
    return <Avatar url={null} px={px} glyph="account-group-outline" />;
  }

  const avatar = who.kind === 'person' ? (
    <Avatar url={who.avatar_url} px={px} glyph="account-outline" />
  ) : (
    <Avatar url={who.logoUrl} px={px} fallback={dealerPicture} fit="contain" />
  );

  if (!onPress) return avatar;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`View ${who.kind === 'dealer' ? who.name : who.name ?? `@${who.handle}`} profile`}
      hitSlop={space.sm}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.72 }}>
      {avatar}
    </Pressable>
  );
}
