import { ScrollView, View } from 'react-native';

import { CheckRow } from '@/components/CheckRow';
import { Button, Message, Spinner } from '@/components/ui';
import { useFacets } from '@/data/search';
import { useThemedStyles } from '@/providers/theme';

import { StepShell } from './StepShell';
import { onboardingStyles } from './styles';

export function BrandsStep({
  brands,
  onToggle,
  onContinue,
  onBack,
}: {
  brands: string[];
  onToggle: (value: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const styles = useThemedStyles(onboardingStyles);
  const { data: facets = [], isPending, error } = useFacets();
  const brandFacets = facets.filter((facet) => facet.kind === 'brand');

  let list = null;
  if (isPending) {
    list = (
      <View style={styles.insteadOfList}>
        <Spinner />
      </View>
    );
  } else if (error) {
    list = (
      <View style={styles.insteadOfList}>
        <Message text={error.message} tone="error" />
      </View>
    );
  } else if (brandFacets.length) {
    list = (
      <ScrollView style={styles.fill} contentContainerStyle={styles.choices}>
        {brandFacets.map((facet) => (
          <CheckRow
            key={facet.value}
            label={facet.label}
            count={facet.count}
            selected={brands.includes(facet.value)}
            onPress={() => onToggle(facet.value)}
          />
        ))}
      </ScrollView>
    );
  } else {
    list = (
      <View style={styles.insteadOfList}>
        <Message text="No brands to pick from yet — no dealer's watches have been approved. This only sets the order of your deck, so nothing is lost." />
      </View>
    );
  }

  const nothingToPick = !isPending && brandFacets.length === 0;

  return (
    <StepShell
      heading="Which brands do you love?"
      detail="Watches from these come up first. Everything else still shows."
      onBack={onBack}
      actions={
        <Button
          label="Continue"
          disabled={!nothingToPick && brands.length === 0}
          onPress={onContinue}
        />
      }>
      {list}
    </StepShell>
  );
}
