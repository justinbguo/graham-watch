import { NewMessageButton } from '@/features/messages/NewMessageButton';

/** Seller Hub inbox: white "New" pill beside search. */
export function HubNewMessageButton({ onPress }: { onPress: () => void }) {
  return <NewMessageButton variant="pill" onPress={onPress} />;
}
