import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { track } from '@/lib/analytics';
import { signOut } from '@/lib/auth';
import type { Database } from '@/lib/database';
import { demo, isDemo } from '@/lib/demo';
import type { Profile } from '@/lib/models';
import { normalizeUsername } from '@/lib/username';
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
  /** Already claimed on slide 2. Written again here so finishing cannot drop it. */
  username: string;
  dateOfBirth: string;
  favoriteBrands: string[];
  /**
   * Which door they came through. Routing only — a dealer's actual powers come
   * from `dealers.claimed_by`, never from this.
   */
  accountType: Database['public']['Enums']['account_type'];
  collectionSize: Database['public']['Enums']['collection_size'] | null;
  searchPainPoints: Database['public']['Enums']['watch_search_pain'][];
  notificationsEnabled: boolean;
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
      handle: normalizeUsername(answers.username),
      date_of_birth: answers.dateOfBirth,
      favorite_brands: answers.favoriteBrands,
      account_type: answers.accountType,
      collection_size: answers.collectionSize,
      search_pain_points: answers.searchPainPoints,
      notifications_enabled: answers.notificationsEnabled,
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

  // The path, not the host. The host this session used may be the Colima VM,
  // which the next session cannot open. The cache buster is the query: the
  // file name does not change, so a public URL would keep the previous bytes.
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: `${path}?v=${Date.now()}` })
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

/**
 * Storage refuses a delete from `storage.objects` in SQL, so the avatar cannot
 * go with the account inside `delete_own_account`. It is removed here, while
 * the session that owns the folder is still alive. A failure is swallowed: an
 * orphaned file in a public bucket is better than an account nobody can close.
 */
async function removeAvatarFiles(userId: string) {
  try {
    const { data } = await supabase.storage.from(AVATAR_BUCKET).list(userId);
    const paths = (data ?? []).map((file) => `${userId}/${file.name}`);
    if (paths.length) await supabase.storage.from(AVATAR_BUCKET).remove(paths);
  } catch {
    // Nothing to tell the user. The account is about to go either way.
  }
}

async function deleteOwnAccount(userId: string) {
  if (isDemo) throw new Error('Demo mode has no account to delete.');

  await removeAvatarFiles(userId);

  const { error } = await supabase.rpc('delete_own_account');
  if (error) throw error;

  // The auth user is already gone, so a server-side sign-out would 401.
  // Local only: drop the stored session and let the gate send them to sign-in.
  await signOut({ scope: 'local' });
}

export function useDeleteAccount(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('Not signed in.');
      return deleteOwnAccount(userId);
    },
    onSuccess: () => queryClient.clear(),
  });
}

/**
 * Reserves the username on slide 2. Uniqueness is a column constraint, and
 * other people's profiles are not readable, so a select cannot answer "taken".
 */
export function useClaimUsername(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (candidate: string) => {
      if (!userId) throw new Error('Not signed in.');
      if (isDemo) return normalizeUsername(candidate);

      const { data, error } = await supabase.rpc('claim_username', { candidate });
      if (error) throw error;
      return data;
    },
    onSuccess: (handle) => {
      if (!userId) return;
      queryClient.setQueryData<Profile | null>(keys.profile(userId), (current) =>
        current ? { ...current, handle } : current
      );
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
      track('signup_complete');
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
  // Ending the session is the only way out of a missing row. The 18+ block
  // also signs out, because onboarded_at must stay null.
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
