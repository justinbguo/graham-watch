import { Button } from '@/components/ui';
import { useFollows, useToggleFollow } from '@/data/follows';
import { useSession } from '@/providers/session';

export function FollowDealer({
  dealer,
}: {
  dealer: { id: string; name: string; logo_url?: string | null };
}) {
  const { userId } = useSession();
  const { data: follows = [] } = useFollows(userId);
  const toggle = useToggleFollow(userId);
  const following = follows.some((shop) => shop.id === dealer.id);

  if (!userId) return null;

  return (
    <Button
      label={following ? 'Following' : 'Follow'}
      icon={following ? 'account-check' : 'account-plus'}
      onPress={() =>
        toggle.mutate({
          id: dealer.id,
          name: dealer.name,
          logo_url: dealer.logo_url ?? null,
          following: !following,
        })
      }
    />
  );
}
