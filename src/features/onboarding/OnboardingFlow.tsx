import { useEffect, useState } from 'react';

import { useClaimUsername, useCompleteOnboarding, useProfile } from '@/data/profile';
import { OnboardingPaywall } from '@/features/subscriptions/OnboardingPaywall';
import { shouldShowOnboardingPaywall } from '@/lib/revenuecat';
import { useSession } from '@/providers/session';

import { BirthdayStep } from './BirthdayStep';
import { BlockedStep } from './BlockedStep';
import { BrandsStep } from './BrandsStep';
import { ChoiceStep } from './ChoiceStep';
import { NameStep } from './NameStep';
import { NotifyStep } from './NotifyStep';
import { requestNotificationPermission } from './notifications';
import { COLLECTION_SIZES, type CollectionSize, type WatchSearchPain } from './options';
import { PainPointsStep } from './PainPointsStep';
import { UsernameStep } from './UsernameStep';

type Step =
  | 'name'
  | 'username'
  | 'birthday'
  | 'blocked'
  | 'size'
  | 'brands'
  | 'painPoints'
  | 'notifications'
  | 'paywall';

/**
 * One pager after sign-in. Answers live here until the last step writes them
 * in one go. Killing the app mid-way starts over; that is fine for first-run.
 */
export function OnboardingFlow() {
  const { userId } = useSession();
  const { data: profile } = useProfile(userId);
  const complete = useCompleteOnboarding(userId);
  const claimUsername = useClaimUsername(userId);

  const [step, setStep] = useState<Step>('name');
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [username, setUsername] = useState(profile?.handle ?? '');

  // Claimed on a previous launch. Filling only while the field is still empty
  // keeps a later edit from being overwritten when the profile query settles.
  useEffect(() => {
    if (!profile?.handle) return;
    setUsername((current) => (current === '' ? profile.handle! : current));
  }, [profile?.handle]);
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
  const [collectionSize, setCollectionSize] = useState<CollectionSize | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [painPoints, setPainPoints] = useState<WatchSearchPain[]>([]);
  const [permissionPending, setPermissionPending] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [pendingNotifications, setPendingNotifications] = useState<boolean | null>(null);

  const finish = (notificationsEnabled: boolean) => {
    if (!dateOfBirth) return;
    // A shop is claimed from Profile. Onboarding no longer asks which they are,
    // and the database still requires an account type to finish.
    complete.mutate({
      name: { first: firstName, last: lastName },
      username,
      dateOfBirth,
      accountType: 'buyer',
      collectionSize,
      favoriteBrands: brands,
      searchPainPoints: painPoints,
      notificationsEnabled,
    });
  };

  const afterNotifications = (notificationsEnabled: boolean) => {
    if (shouldShowOnboardingPaywall()) {
      setPendingNotifications(notificationsEnabled);
      setStep('paywall');
      return;
    }
    finish(notificationsEnabled);
  };

  const togglePainPoint = (value: WatchSearchPain) =>
    setPainPoints((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );

  const enableNotifications = async () => {
    setPermissionPending(true);
    setPermissionError(null);
    try {
      afterNotifications(await requestNotificationPermission());
    } catch {
      setPermissionError('Your phone could not open notification settings. Try again or choose Not now.');
    } finally {
      setPermissionPending(false);
    }
  };

  if (step === 'name') {
    return (
      <NameStep
        firstName={firstName}
        lastName={lastName}
        onChangeFirst={setFirstName}
        onChangeLast={setLastName}
        onContinue={() => setStep('username')}
      />
    );
  }

  if (step === 'username') {
    return (
      <UsernameStep
        username={username}
        collectorNumber={profile?.collector_number ?? null}
        busy={claimUsername.isPending}
        error={claimUsername.error?.message}
        onChange={(value) => {
          claimUsername.reset();
          setUsername(value);
        }}
        onContinue={() => {
          claimUsername.mutate(username, {
            onSuccess: (claimed) => {
              setUsername(claimed);
              setStep('birthday');
            },
          });
        }}
        onBack={() => setStep('name')}
      />
    );
  }

  if (step === 'birthday') {
    return (
      <BirthdayStep
        month={month}
        day={day}
        year={year}
        onChangeMonth={setMonth}
        onChangeDay={setDay}
        onChangeYear={setYear}
        onContinue={(iso, adult) => {
          setDateOfBirth(iso);
          setStep(adult ? 'size' : 'blocked');
        }}
        onBack={() => setStep('username')}
      />
    );
  }

  if (step === 'blocked') return <BlockedStep />;

  if (step === 'size') {
    return (
      <ChoiceStep
        heading="How many watches do you own?"
        detail="A range is enough. We are not counting a safe."
        options={COLLECTION_SIZES}
        selected={collectionSize}
        onSelect={setCollectionSize}
        onContinue={() => setStep('brands')}
        onBack={() => setStep('birthday')}
      />
    );
  }

  if (step === 'brands') {
    return (
      <BrandsStep
        onContinue={(picked) => {
          setBrands(picked);
          setStep('painPoints');
        }}
        onBack={() => setStep('size')}
      />
    );
  }

  if (step === 'painPoints') {
    return (
      <PainPointsStep
        selected={painPoints}
        onToggle={togglePainPoint}
        onContinue={() => setStep('notifications')}
        onBack={() => setStep('brands')}
      />
    );
  }

  if (step === 'paywall' && pendingNotifications !== null) {
    return (
      <OnboardingPaywall
        error={complete.error?.message}
        loading={complete.isPending}
        onComplete={() => finish(pendingNotifications)}
        onBack={() => setStep('notifications')}
      />
    );
  }

  return (
    <NotifyStep
      error={permissionError ?? complete.error?.message}
      loading={permissionPending || complete.isPending}
      onContinue={() => void enableNotifications()}
      onSkip={() => afterNotifications(false)}
      onBack={() => setStep('painPoints')}
    />
  );
}
