import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { ImportJob } from '@/lib/database.types';
import { demo, isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

import { keys } from './keys';

async function fetchImportJobs(userId: string): Promise<ImportJob[]> {
  if (isDemo) return demo.importJobs();

  const { data, error } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

/**
 * Scraping runs in the background on the server, so progress arrives as Postgres
 * changes rather than as a response. Realtime pushes those rows to us; the query
 * cache is just told to refetch when one lands.
 */
export function useImportJobs(userId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keys.importJobs(userId ?? 'anonymous'),
    queryFn: () => fetchImportJobs(userId!),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    if (!userId || isDemo) return;

    const channel = supabase
      .channel(`import-jobs-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'import_jobs', filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: keys.importJobs(userId) });
          queryClient.invalidateQueries({ queryKey: keys.imported(userId) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return query;
}

export function useStartImport(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sourceUrl, dealerId }: { sourceUrl: string; dealerId?: string }) => {
      if (isDemo) return demo.startImport(sourceUrl);

      const { data, error } = await supabase.functions.invoke<{ job: ImportJob }>(
        'import-listings',
        { body: { sourceUrl, dealerId } }
      );
      if (error) throw error;
      if (!data?.job) throw new Error('Import did not start.');
      return data.job;
    },
    onSuccess: () => {
      if (userId) queryClient.invalidateQueries({ queryKey: keys.importJobs(userId) });
    },
  });
}
