import { useState } from 'react';

import { useShopApplication } from './application';
import { ApplicationForm } from './ApplicationForm';
import { useShopClaim } from './claim';
import { ClaimShopForm } from './ClaimShopForm';

/**
 * The one door a dealer comes through, whichever side of the import they are on.
 *
 * They type the site they sell from and the answer decides the branch: a shop
 * we already hold is claimed with a code, and one we have never read is applied
 * for. Asking the dealer to pick the branch themselves would push our own
 * bookkeeping onto them — they have no way of knowing whether we scraped them.
 */
export function ShopIntake({ onDone }: { onDone: () => void }) {
  const claim = useShopClaim();
  const [applyingFor, setApplyingFor] = useState<string | null>(null);
  const apply = useShopApplication(applyingFor ?? '');

  // An application already on file outranks the website question: it is the
  // thing waiting on an answer, and re-asking would file a second one.
  if (applyingFor !== null || (apply.application && apply.step !== 'form')) {
    return <ApplicationForm apply={apply} onDone={onDone} />;
  }

  return <ClaimShopForm claim={claim} onDone={onDone} onApply={setApplyingFor} />;
}
