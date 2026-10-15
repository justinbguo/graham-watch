import { Avatar } from '@/components/Avatar';
import type { ConversationWith } from '@/data/messages';
import { dealerPicture } from '@/features/dealers/picture';

/** A person's photograph, or a shop's mark contained in the same square. */
export function PartyAvatar({ who, px }: { who: ConversationWith; px?: number }) {
  return who.kind === 'person' ? (
    <Avatar url={who.avatar_url} px={px} glyph="account-outline" />
  ) : (
    <Avatar url={who.logoUrl} px={px} fallback={dealerPicture} fit="contain" />
  );
}
