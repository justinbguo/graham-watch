import { FlatList, StyleSheet, Text, View } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { Button, Message, Screen } from '@/components/ui';
import { useImportedListings } from '@/data/listings';
import { signOut } from '@/lib/auth';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session';

export default function Profile() {
  const { session, userId } = useSession();
  const { data: listings = [] } = useImportedListings(userId);

  return (
    <Screen title="Profile">
      <View style={styles.identity}>
        <Text style={styles.email}>{session?.user.email ?? 'Signed in'}</Text>
        <Message text={`${listings.length} listing${listings.length === 1 ? '' : 's'} imported`} />
      </View>

      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <ListingRow card={item} />}
        ListEmptyComponent={<Message text="Import a URL and your listings show up here." />}
      />

      <View style={styles.footer}>
        <Button label="Sign out" variant="secondary" onPress={() => signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: {
    paddingHorizontal: theme.space(2),
    paddingBottom: theme.space(2),
    gap: 2,
  },
  email: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.color.text,
  },
  list: {
    paddingHorizontal: theme.space(2),
    flexGrow: 1,
  },
  separator: {
    height: 1,
    backgroundColor: theme.color.border,
  },
  footer: {
    padding: theme.space(2),
  },
});
