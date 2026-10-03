import { ShopListings } from './ShopListings';
import { STEP_LABEL, countsLine, stageOf, type Step } from './stage';
import type { OperatorDealer } from './supabase';

export type Profile = {
  description: string | null;
  instagram: string | null;
  logo_url: string | null;
};

/**
 * One shop, as a page of its own rather than a row that opens inside a table.
 *
 * Everything you check about one dealer is here: who they are as the app
 * shows them, what we imported, and what is still on their site. The list
 * stays a list of next steps.
 */
export function ShopPage({
  dealer,
  profile,
  busy,
  reload,
  onBack,
  onStep,
  onRefresh,
  onChanged,
}: {
  dealer: OperatorDealer;
  profile: Profile | undefined;
  busy: boolean;
  reload: number;
  onBack: () => void;
  onStep: (step: Step) => void;
  onRefresh: () => void;
  onChanged: () => void;
}) {
  const stage = stageOf(dealer);
  const visibility: Step = dealer.permission === 'approved' ? 'pull-back' : 'publish';
  const others = [dealer.can_import ? 'pick' : null, visibility].filter(
    (step): step is Step => step !== null && step !== stage.primary
  );

  return (
    <section className="shop-page">
      <button className="ghost back" onClick={onBack}>
        ← All shops
      </button>

      <header className="shop-head">
        {profile?.logo_url ? <img className="shopmark" src={profile.logo_url} alt="" /> : null}
        <div className="grow">
          <h1>{dealer.name}</h1>
          <p className="muted small links">
            {dealer.website ? (
              <a href={dealer.website} target="_blank" rel="noreferrer">
                {dealer.website}
              </a>
            ) : (
              'no website'
            )}
            {profile?.instagram ? (
              <a href={`https://instagram.com/${profile.instagram}`} target="_blank" rel="noreferrer">
                @{profile.instagram}
              </a>
            ) : null}
            {dealer.contact_email ? <span>{dealer.contact_email}</span> : null}
          </p>
          {dealer.contact_email ? null : (
            // send-inquiry has nowhere to send without one, so a buyer's
            // question fails rather than goes unanswered.
            <span className="badge wait">no address — inquiries fail</span>
          )}
          {profile?.description ? (
            <p className="small about">{profile.description}</p>
          ) : (
            <p className="muted small">Their homepage says nothing about themselves.</p>
          )}
        </div>
        <span className={`badge stage ${stage.tone}`}>{stage.label}</span>
      </header>

      <div className="bar">
        {stage.primary ? (
          <button disabled={busy} onClick={() => onStep(stage.primary!)}>
            {STEP_LABEL[stage.primary]}
          </button>
        ) : null}
        {others.map((step) => (
          <button key={step} className="ghost" disabled={busy} onClick={() => onStep(step)}>
            {STEP_LABEL[step]}
          </button>
        ))}
        <span className="muted small">{countsLine(dealer)}</span>
      </div>

      <ShopListings
        dealerId={dealer.id}
        reload={reload}
        onChanged={onChanged}
        site={
          <div className="bar">
            <span className="muted small">
              {Number(dealer.catalog_total)} for sale
              {dealer.catalog_queued > 0 ? ` · ${dealer.catalog_queued} queued` : ''}
              {dealer.catalog_failed > 0 ? ` · ${dealer.catalog_failed} failed` : ''}
            </span>
            <button
              className="ghost"
              disabled={busy || !dealer.can_import}
              title={
                dealer.can_import
                  ? 'Read their site again for stock we have not seen. Imports nothing.'
                  : 'The dealer manages this shop themselves'
              }
              onClick={onRefresh}>
              Refresh from site
            </button>
          </div>
        }
      />
    </section>
  );
}
