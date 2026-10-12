import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Database } from '@/lib/database';
import { isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

import { keys } from './keys';

/** The applicant's own application, with the host they must prove a mailbox on. */
export type DealerApplication =
  Database['public']['Functions']['my_dealer_application']['Returns'][number];

export type ListingVolume = Database['public']['Enums']['listing_volume'];

export type ApplicationDraft = {
  shopName: string;
  website: string;
  brands: string[];
  volume: ListingVolume;
};

/** Read as a dealer would say it, so the form and the operator agree. */
export const VOLUME_LABELS: Record<ListingVolume, string> = {
  under_10: 'Fewer than 10',
  '10_to_50': '10 to 50',
  '50_to_200': '50 to 200',
  over_200: 'More than 200',
};

export const VOLUMES = Object.keys(VOLUME_LABELS) as ListingVolume[];

async function readFunctionError(error: unknown): Promise<string | null> {
  const response = (error as { context?: Response })?.context;
  if (!response) return null;

  try {
    return (await response.json())?.error ?? null;
  } catch {
    return null;
  }
}

export function useMyApplication() {
  const { isSignedIn, userId } = useSession();

  return useQuery({
    queryKey: keys.myApplication(userId ?? 'anonymous'),
    queryFn: async (): Promise<DealerApplication | null> => {
      if (isDemo) return null;
      const { data, error } = await supabase.rpc('my_dealer_application');
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: isSignedIn,
  });
}

export function useSubmitApplication() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (draft: ApplicationDraft) => {
      if (!userId) throw new Error('Not signed in.');

      // Only the columns the insert policy permits. Status, verification, and
      // the linked shop are all pinned null by that policy, so sending them
      // would fail the whole insert rather than be ignored.
      const { data, error } = await supabase
        .from('dealer_applications')
        .insert({
          user_id: userId,
          shop_name: draft.shopName.trim(),
          website: draft.website.trim(),
          brands: draft.brands,
          volume: draft.volume,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      if (userId) queryClient.invalidateQueries({ queryKey: keys.myApplication(userId) });
    },
  });
}

export function useRequestApplicationCode() {
  return useMutation({
    mutationFn: async (input: { applicationId: string; email: string }) => {
      const { data, error } = await supabase.functions.invoke<{
        sentTo: string;
        expiresAt: string;
      }>('verify-application', { body: input });

      if (error) throw new Error((await readFunctionError(error)) ?? error.message);
      return data!;
    },
  });
}

export function useVerifyApplicationCode() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (input: { applicationId: string; code: string }) => {
      const { data, error } = await supabase.rpc('verify_application_email', {
        p_application_id: input.applicationId,
        p_code: input.code.trim(),
      });
      if (error) throw error;
      // Null is a wrong code, not a failure: the attempt has to commit, so the
      // function cannot raise and still count the guess.
      if (!data) throw new Error('That code is not right.');
      return data;
    },
    onSuccess: () => {
      if (userId) queryClient.invalidateQueries({ queryKey: keys.myApplication(userId) });
    },
  });
}
