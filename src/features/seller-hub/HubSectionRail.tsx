import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View } from 'react-native';

import { DeckRailButton } from '@/components/DeckRailButton';
import { space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { HubSellerToolsHeader } from './HubSellerToolsHeader';
import type { HubSectionId } from './HubSection';

type RailIcon = keyof typeof MaterialCommunityIcons.glyphMap;

const SECTIONS: { id: HubSectionId; label: string; icon: RailIcon }[] = [
  { id: 'messages', label: 'Messages', icon: 'email-outline' },
  { id: 'payments', label: 'Payments', icon: 'credit-card-outline' },
  { id: 'analytics', label: 'Analytics', icon: 'chart-line' },
  { id: 'listings', label: 'Listings', icon: 'tag-outline' },
  { id: 'support', label: 'Support', icon: 'lifebuoy' },
];

/** Desktop Deal tab: hub sections in the left rail, same column as Buy and Community. */
export function HubSectionRail({
  value,
  onChange,
  messagesUnread,
}: {
  value: HubSectionId;
  onChange: (next: HubSectionId) => void;
  messagesUnread: boolean;
}) {
  const styles = useThemedStyles(railStyles);

  return (
    <View style={styles.rail}>
      <HubSellerToolsHeader />
      {SECTIONS.map((section) => (
        <DeckRailButton
          key={section.id}
          label={section.label}
          icon={section.icon}
          active={value === section.id}
          accessibilityLabel={
            section.id === 'messages' && messagesUnread
              ? `${section.label}, unread messages`
              : section.label
          }
          onPress={() => onChange(section.id)}
        />
      ))}
    </View>
  );
}

const railStyles = (_theme: Theme) => ({
  rail: {
    alignSelf: 'stretch' as const,
    gap: space.sm,
  },
});
