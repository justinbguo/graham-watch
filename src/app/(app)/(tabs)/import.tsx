import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Message, Screen } from '@/components/ui';
import type { ImportJob } from '@/lib/database.types';
import { fetchImportJobs, startImport } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session';

const STATUS_LABEL: Record<ImportJob['status'], string> = {
  queued: 'Queued',
  running: 'Scraping…',
  succeeded: 'Done',
  failed: 'Failed',
};

export default function Import() {
  const { userId } = useSession();
  const [url, setUrl] = useState('');
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    fetchImportJobs(userId).then(setJobs).catch(() => undefined);

    const channel = supabase
      .channel('import-jobs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'import_jobs', filter: `user_id=eq.${userId}` },
        () => {
          fetchImportJobs(userId).then(setJobs).catch(() => undefined);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const job = await startImport(url.trim());
      setJobs((current) => [job, ...current]);
      setUrl('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the import.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Import">
      <View style={styles.form}>
        <Message text="Paste the URL of a shop, collection, or single listing. Graham scrapes it and recreates the watches here." />
        <Field
          value={url}
          onChangeText={setUrl}
          placeholder="https://example.com/watches"
          keyboardType="url"
          autoComplete="url"
        />
        <Button
          label="Import listings"
          loading={busy}
          disabled={!url.trim().startsWith('http')}
          onPress={submit}
        />
        {error ? <Message text={error} tone="error" /> : null}
      </View>

      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <View style={styles.job}>
            <Text style={styles.jobUrl} numberOfLines={1}>
              {item.source_url}
            </Text>
            <Text style={styles.jobMeta}>
              {STATUS_LABEL[item.status]}
              {item.status === 'succeeded' ? ` · ${item.listings_created} listings` : ''}
              {item.error ? ` · ${item.error}` : ''}
            </Text>
          </View>
        )}
        ListHeaderComponent={jobs.length ? <Text style={styles.listHeader}>Recent imports</Text> : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    paddingHorizontal: theme.space(2),
    gap: theme.space(1.5),
    paddingBottom: theme.space(2),
  },
  list: {
    paddingHorizontal: theme.space(2),
  },
  listHeader: {
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.color.muted,
    paddingBottom: theme.space(1),
  },
  separator: {
    height: 1,
    backgroundColor: theme.color.border,
  },
  job: {
    paddingVertical: theme.space(1.25),
    gap: 2,
  },
  jobUrl: {
    fontSize: 15,
    color: theme.color.text,
  },
  jobMeta: {
    fontSize: 13,
    color: theme.color.muted,
  },
});
