import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { SegmentedChoice } from '@/components/SegmentedChoice';
import { SocialButton } from '@/components/SocialButton';
import { Eyebrow, Message } from '@/components/ui';
import {
  DEFAULT_OFFER_EXPIRY_HOURS,
  OFFER_EXPIRY_CHOICES,
  useCreateDeal,
  useReviseDeal,
} from '@/data/deals';
import { useListing } from '@/data/listings';
import type { MessageListing } from '@/data/messages';
import {
  centsToPriceDigits,
  PostPriceField,
  priceDigitsToCents,
} from '@/features/exchange/PostPriceField';
import { feeCentsFromBps, formatCents } from '@/lib/money';
import { stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { DealListingPhotoStrip } from './DealListingPhotoStrip';
import { DealListingDelta } from './DealListingDelta';
import { DealOfferFinalWarning } from './DealOfferFinalWarning';
import { DealOfferSummary } from './DealOfferSummary';
import { DealSheetShell, dealSheetActionStyles } from './DealSheetShell';

const FEE_BPS = 500;

const EXPIRY_OPTIONS = OFFER_EXPIRY_CHOICES.map((choice) => ({
  value: choice.hours,
  label: choice.label,
}));

type Step = 'compose' | 'review';

export function OfferDealSheet({
  visible,
  conversationId,
  listing,
  intent = 'create',
  editDeal,
  onOpenListing,
  onClose,
}: {
  visible: boolean;
  conversationId: string;
  listing: MessageListing;
  intent?: 'create' | 'edit' | 'counter';
  /** When set, the review step updates this open offer instead of creating a new deal. */
  editDeal?: { id: string; amountCents: number } | null;
  onOpenListing: () => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(sheetStyles);
  const create = useCreateDeal(conversationId);
  const revise = useReviseDeal(conversationId);
  const { data: listingCard } = useListing(listing.id);
  const [digits, setDigits] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(DEFAULT_OFFER_EXPIRY_HOURS);
  const [step, setStep] = useState<Step>('compose');
  const editing = intent === 'edit' && Boolean(editDeal);
  const countering = intent === 'counter' && Boolean(editDeal);
  const revising = editing || countering;

  const photoUrls = useMemo(() => {
    const fromListing = listingCard?.photos.map((photo) => photo.url) ?? [];
    if (fromListing.length > 0) return fromListing;
    return listing.photoUrl ? [listing.photoUrl] : [];
  }, [listing.photoUrl, listingCard?.photos]);

  useEffect(() => {
    if (!visible) {
      setDigits('');
      setStep('compose');
      setExpiresInHours(DEFAULT_OFFER_EXPIRY_HOURS);
      return;
    }
    const seed = editDeal?.amountCents ?? listing.priceCents ?? null;
    setDigits(centsToPriceDigits(seed));
  }, [visible, listing.priceCents, editDeal?.amountCents, editDeal?.id]);

  const cents = priceDigitsToCents(digits);
  const fee = cents ? feeCentsFromBps(cents, FEE_BPS) : null;
  const net = cents && fee !== null ? cents - fee : null;

  const saving = create.isPending || revise.isPending;
  const saveError = create.error ?? revise.error;

  const composeTitle = countering ? 'Counteroffer' : editing ? 'Edit offer' : 'Offer a deal';
  const reviewTitle = countering ? 'Review counteroffer' : editing ? 'Review changes' : 'Review offer';
  const sendLabel = countering ? 'Send counteroffer' : editing ? 'Update offer' : 'Send offer';
  const expiryLabel =
    OFFER_EXPIRY_CHOICES.find((choice) => choice.hours === expiresInHours)?.label ?? '3 days';

  const sendOffer = () => {
    if (!cents) return;
    const onSuccess = () => {
      setDigits('');
      setStep('compose');
      onClose();
    };
    if (revising && editDeal) {
      revise.mutate({ dealId: editDeal.id, amountCents: cents }, { onSuccess });
    } else {
      create.mutate(
        { amountCents: cents, proposerIsSeller: true, listingId: listing.id, expiresInHours },
        { onSuccess },
      );
    }
  };

  const listingPreview = (
    <View style={styles.preview}>
      <DealListingPhotoStrip urls={photoUrls} onPress={onOpenListing} />
      <Text style={styles.listingTitle} numberOfLines={2} ellipsizeMode="tail">
        {listing.title}
      </Text>
    </View>
  );

  return (
    <DealSheetShell
      visible={visible}
      title={step === 'compose' ? composeTitle : reviewTitle}
      closeLabel="Close offer sheet"
      onClose={onClose}>
      {step === 'compose' ? (
        <>
          {listingPreview}
          <PostPriceField
            intent="sell"
            digits={digits}
            onChangeDigits={setDigits}
            showKicker={false}
          />
          {cents ? (
            <DealListingDelta offerCents={cents} listPriceCents={listing.priceCents} />
          ) : listing.priceCents ? (
            <Text style={styles.listedOnly}>Listed {formatCents(listing.priceCents)}</Text>
          ) : null}
          {cents && fee !== null && net !== null ? (
            <DealOfferSummary
              cents={cents}
              fee={fee}
              net={net}
              listPriceCents={listing.priceCents}
              countering={countering}
            />
          ) : null}
          {!revising ? (
            <View style={styles.expiry}>
              <Eyebrow>Offer expires in</Eyebrow>
              <SegmentedChoice
                label="Offer expires in"
                value={expiresInHours}
                options={EXPIRY_OPTIONS}
                onChange={setExpiresInHours}
              />
              <Text style={styles.expiryNote}>
                After that the buyer can no longer accept. A counteroffer restarts the clock at 3
                days.
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          {listingPreview}
          {cents && fee !== null && net !== null ? (
            <DealOfferSummary
              cents={cents}
              fee={fee}
              net={net}
              listPriceCents={listing.priceCents}
              countering={countering}
            />
          ) : null}
          {!revising ? <Text style={styles.expiryNote}>Open for {expiryLabel}.</Text> : null}
          <DealOfferFinalWarning />
        </>
      )}

      {saveError ? <Message text={saveError.message} tone="error" /> : null}

      <View style={dealSheetActionStyles.actions}>
        {step === 'compose' ? (
          <>
            <SocialButton
              label="Continue"
              solid
              block
              disabled={!cents}
              onPress={() => setStep('review')}
            />
            <SocialButton label="Cancel" block disabled={saving} onPress={onClose} />
          </>
        ) : (
          <>
            <SocialButton
              label={sendLabel}
              solid
              block
              busy={saving}
              disabled={!cents}
              onPress={sendOffer}
            />
            <View style={dealSheetActionStyles.row}>
              <SocialButton
                label="Edit"
                rowItem
                disabled={saving}
                onPress={() => setStep('compose')}
              />
              <SocialButton label="Cancel" rowItem disabled={saving} onPress={onClose} />
            </View>
          </>
        )}
      </View>
    </DealSheetShell>
  );
}

const sheetStyles = (theme: Theme) => ({
  preview: {
    gap: stack.tight,
    alignSelf: 'stretch' as const,
  },
  listingTitle: {
    ...type.title,
    color: theme.color.text,
  },
  listedOnly: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  expiry: {
    gap: stack.tight,
    paddingTop: stack.tight,
  },
  expiryNote: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
