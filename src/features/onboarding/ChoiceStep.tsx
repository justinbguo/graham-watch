import { ScrollView } from 'react-native';

import { CheckRow } from '@/components/CheckRow';
import { Button } from '@/components/ui';
import { useThemedStyles } from '@/providers/theme';

import { StepShell } from './StepShell';
import { onboardingStyles } from './styles';

export function ChoiceStep<T extends string>({
  heading,
  detail,
  options,
  selected,
  onSelect,
  onContinue,
  onBack,
}: {
  heading: string;
  detail: string;
  options: { value: T; label: string }[];
  selected: T | null;
  onSelect: (value: T) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const styles = useThemedStyles(onboardingStyles);

  return (
    <StepShell
      heading={heading}
      detail={detail}
      onBack={onBack}
      actions={<Button label="Continue" disabled={!selected} onPress={onContinue} />}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.choices}>
        {options.map((option) => (
          <CheckRow
            key={option.value}
            label={option.label}
            selected={selected === option.value}
            onPress={() => onSelect(option.value)}
          />
        ))}
      </ScrollView>
    </StepShell>
  );
}
