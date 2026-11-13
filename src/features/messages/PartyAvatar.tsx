import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { Avatar } from '@/components/Avatar';
import type { ConversationWith } from '@/data/messages';
import { dealerPicture } from '@/features/dealers/picture';
import { avatarMonogramLetter } from '@/lib/avatarMonogram';
import { space } from '@/lib/theme';

import { partyName } from './party';

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
  let avatar: ReactNode;

  if (who.kind === 'group') {
    avatar = (
      <Avatar
        url={null}
        px={px}
        monogram={{
          letter: avatarMonogramLetter(who.givenName ?? who.title),
          seed: who.title,
        }}
      />
    );
  } else if (who.kind === 'person') {
    avatar = <Avatar url={who.avatar_url} px={px} />;
  } else {
    avatar = <Avatar url={who.logoUrl} px={px} fallback={dealerPicture} fit="contain" />;
  }

  if (!onPress) return avatar;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`View ${partyName(who)} profile`}
      hitSlop={space.sm}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.72 }}>
      {avatar}
    </Pressable>
  );
}
