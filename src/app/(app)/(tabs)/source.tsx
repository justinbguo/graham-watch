import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';

import { Centered, Heading, Message, Screen } from '@/components/ui';
import { useSourcingRequests } from '@/data/sourcing';
import { RequestRow } from '@/features/sourcing/RequestRow';
import { HIT_TARGET, inset, radius, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

export default function Source() {
  const styles = useThemedStyles(sourceStyles);
  const theme = useTheme();
  const { data: requests = [] } = useSourcingRequests();

  return (
    <Screen
      title="Source"
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New request"
          onPress={() => router.push('/sourcing/new')}
          style={({ pressed }) => [styles.new, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="plus" size={size.tabIcon} color={theme.color.text} />
        </Pressable>
      }>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <Message text="Ask the room to help you find a watch. Posts stay on this phone until you close the app." />
        }
        renderItem={({ item }) => (
          <RequestRow request={item} onPress={() => router.push(`/sourcing/${item.id}`)} />
        )}
        ListEmptyComponent={
          <Centered>
            <Heading>No requests yet</Heading>
            <Message text="Post the watch you want and collectors can reply with leads." />
          </Centered>
        }
      />
    </Screen>
  );
}

const sourceStyles = (theme: Theme) => ({
  new: {
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.pill,
    backgroundColor: theme.color.surfaceSunken,
  },
  pressed: {
    opacity: 0.72,
  },
  list: {
    paddingHorizontal: inset.screen,
    flexGrow: 1,
    paddingBottom: space.xxl,
  },
  separator: {
    height: 1,
    backgroundColor: theme.color.border,
  },
});
