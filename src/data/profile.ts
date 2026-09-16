import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { signOut } from '@/lib/auth';
import type { Database } from '@/lib/database.types';
import { demo, isDemo } from '@/lib/demo';
import type { Profile } from '@/lib/models';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

import { keys } from './keys';

const AVATAR_BUCKET = 'avatars';

const AVATAR_TYPES: Record<string, { ext: string; contentType: string }> = {
  'image/jpeg': { ext: 'jpg', contentType: 'image/jpeg' },
  'image/jpg': { ext: 'jpg', contentType: 'image/jpeg' },
  'image/png': { ext: 'png', contentType: 'image/png' },
  'image/webp': { ext: 'webp', contentType: 'image/webp' },
};

export type Onboarding = {
  firstName: string;
  lastName: string;
  favoriteBrands: string[];
  /**
   * Which door they came through. Routing only — a dealer's actual powers come
   * from `dealers.claimed_by`, never from this.
   */
  accountType: Database['public']['Enums']['account_type'];
};

async function fetchProfile(userId: string): Promise<Profile | null> {
  if (isDemo) return demo.profile();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function saveOnboarding(userId: string, answers: Onboarding) {
  if (isDemo) return demo.completeOnboarding();

  const { data, error } = await supabase
    .from('profiles')
    .update({
      first_name: answers.firstName.trim(),
      last_name: answers.lastName.trim(),
      favorite_brands: answers.favoriteBrands,
      account_type: answers.accountType,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', userId)
    // Selected so the write can prove it landed. An update matching no row is
    // a 204 with no error, and the gate then sends the user straight back here
    // — a Continue button that looks broken rather than one that failed.
    .select('id');

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Your account is no longer on this server. Sign out and sign in again.');
  }
}

export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: keys.profile(userId ?? 'anonymous'),
    queryFn: () => fetchProfile(userId!),
    enabled: Boolean(userId),
    // The gate reads this on every launch; refetching it mid-session would only
    // risk bouncing a user back into onboarding on a blip.
    staleTime: Infinity,
  });
}

async function saveAvatar(userId: string, file: { uri: string; mimeType: string }) {
  if (isDemo) {
    demo.setAvatar(file.uri);
    return;
  }

  const kind = AVATAR_TYPES[file.mimeType];
  if (!kind) throw new Error('Use a jpeg, png, or webp photo.');

  const body = await fetch(file.uri).then((response) => response.arrayBuffer());
  const path = `${userId}/avatar.${kind.ext}`;
  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, body, {
    contentType: kind.contentType,
    upsert: true,
  });
  if (uploadError) throw uploadError;

  // Same path on every change, so bust the CDN the public URL would otherwise
  // keep serving the previous file from.
  const publicUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: `${publicUrl}?v=${Date.now()}` })
    .eq('id', userId);
  if (error) throw error;
}

export function useSetAvatar(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: { uri: string; mimeType: string }) => {
      if (!userId) throw new Error('Not signed in.');
      return saveAvatar(userId, file);
    },
    onMutate: async (file) => {
      if (!userId) return;
      const queryKey = keys.profile(userId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Profile>(queryKey);
      queryClient.setQueryData<Profile>(queryKey, (current) =>
        current ? { ...current, avatar_url: file.uri } : current
      );
      return { previous };
    },
    onError: (_error, _file, context) => {
      if (!userId || !context?.previous) return;
      queryClient.setQueryData(keys.profile(userId), context.previous);
    },
    onSettled: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.profile(userId) });
    },
  });
}

export function useCompleteOnboarding(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (answers: Onboarding) => {
      if (!userId) throw new Error('Not signed in.');
      return saveOnboarding(userId, answers);
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.profile(userId) });
      // Favourite brands rank the deck, so the pile built before the answers
      // existed is now in the wrong order.
      queryClient.invalidateQueries({ queryKey: ['deck'] });
    },
  });
}

/**
 * Which of the three root destinations the user belongs in. `ready` is false
 * while the profile is still loading: routing on a half-known answer would show
 * the deck for a frame and then yank it away.
 */
export function useOnboardingGate() {
  const { isSignedIn, userId } = useSession();
  const { data: profile, isPending, isSuccess } = useProfile(userId);

  // A read of one's own profile is never filtered — the policy is `auth.uid() =
  // id` — so no row means the account itself is gone while the token outlived
  // it. The local stack signs with a fixed secret, so a session minted before a
  // `db reset` still verifies and every write after it matches zero rows.
  // Ending the session is the only way out: onboarding has no sign-out button.
  const accountIsGone = isSignedIn && isSuccess && profile === null;
  useEffect(() => {
    if (accountIsGone) void signOut().catch(() => undefined);
  }, [accountIsGone]);

  if (!isSignedIn) return { ready: true, needsOnboarding: false };
  return { ready: !isPending, needsOnboarding: !profile?.onboarded_at };
}

export function fullName(profile: Profile | null | undefined): string | null {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}
