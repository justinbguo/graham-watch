import { ScrollView } from 'react-native';

import { Button, ChoiceRow } from '@/components/ui';
import { useThemedStyles } from '@/providers/theme';

import { WATCH_SEARCH_PAINS, type WatchSearchPain } from './options';
import { StepShell } from './StepShell';
import { onboardingStyles } from './styles';

export function PainPointsStep({
  selected,
  onToggle,
  onContinue,
  onBack,
}: {
  selected: WatchSearchPain[];
  onToggle: (value: WatchSearchPain) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const styles = useThemedStyles(onboardingStyles);

  return (
    <StepShell
      heading="What makes vintage watch hunting difficult?"
      detail="Pick every frustration that applies. This helps us decide what Graham should solve."
      onBack={onBack}
      actions={<Button label="Continue" disabled={!selected.length} onPress={onContinue} />}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.choices}>
        {WATCH_SEARCH_PAINS.map((option) => (
          <ChoiceRow
            key={option.value}
            label={option.label}
            selected={selected.includes(option.value)}
            onPress={() => onToggle(option.value)}
          />
        ))}
      </ScrollView>
    </StepShell>
  );
}
