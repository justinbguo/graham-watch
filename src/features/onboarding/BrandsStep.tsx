import { Button } from '@/components/ui';
import { useFacets } from '@/data/search';
import { FilterPanel } from '@/features/filters/FilterPanel';
import { useFilters } from '@/features/filters/provider';

import { StepShell } from './StepShell';

/**
 * The same filter panel as Buy, without shops. Continue copies the brand keys
 * the panel already wrote onto the deck.
 */
export function BrandsStep({
  onContinue,
  onBack,
}: {
  onContinue: (brands: string[]) => void;
  onBack: () => void;
}) {
  const { filters } = useFilters('deck');
  const { data: facets = [], isPending } = useFacets();
  const brandFacets = facets.filter((facet) => facet.kind === 'brand');
  const nothingToPick = !isPending && brandFacets.length === 0;

  return (
    <StepShell
      heading="What should we show you first?"
      detail="These picks narrow the deck. Filter can change them later."
      onBack={onBack}
      actions={
        <Button
          label="Continue"
          disabled={!nothingToPick && filters.brands.length === 0}
          onPress={() => onContinue(filters.brands)}
        />
      }>
      <FilterPanel surface="deck" showDealers={false} />
    </StepShell>
  );
}
