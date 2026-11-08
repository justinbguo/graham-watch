import { PausedFrame } from '@/components/PausedBanner';
import { CreateGroup } from '@/features/messages/CreateGroup';

export default function NewGroupRoute() {
  return (
    <PausedFrame>
      <CreateGroup />
    </PausedFrame>
  );
}
