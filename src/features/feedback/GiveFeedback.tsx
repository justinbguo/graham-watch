import { DeckRailButton } from '@/components/DeckRailButton';
import { Button } from '@/components/ui';
import { FEEDBACK_LABEL, FEEDBACK_URL } from '@/features/feedback/contact';
import { openExternal } from '@/lib/openExternal';

function openFeedback(): void {
  openExternal(FEEDBACK_URL);
}

export function GiveFeedback({ placement }: { placement: 'rail' | 'plain' }) {
  if (placement === 'rail') {
    return (
      <DeckRailButton
        label={FEEDBACK_LABEL}
        icon="message-text-outline"
        onPress={openFeedback}
        accessibilityRole="link"
      />
    );
  }
  return (
    <Button
      label={FEEDBACK_LABEL}
      variant="ghost"
      compact
      onPress={openFeedback}
      accessibilityRole="link"
    />
  );
}
