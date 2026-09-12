import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { demo, isDemo } from '@/lib/demo';
import type { Profile } from '@/lib/models';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

import { keys } from './keys';

export type Onboarding = {
  firstName: string;
  lastName: string;
  favoriteBrands: string[];
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

  const { error } = await supabase
    .from('profiles')
    .update({
      first_name: answers.firstName.trim(),
      last_name: answers.lastName.trim(),
      favorite_brands: answers.favoriteBrands,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
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
  const { data: profile, isPending } = useProfile(userId);

  if (!isSignedIn) return { ready: true, needsOnboarding: false };
  return { ready: !isPending, needsOnboarding: !profile?.onboarded_at };
}

export function fullName(profile: Profile | null | undefined): string | null {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}
