import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable } from 'react-native';

import { HIT_TARGET, size } from '@/lib/theme';
import { useTheme } from '@/providers/theme';

const hit = {
  width: HIT_TARGET,
  height: HIT_TARGET,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

export function HeaderIcon({
  label,
  name,
  onPress,
}: {
  label: string;
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={hit}>
      <MaterialCommunityIcons name={name} size={size.icon} color={theme.color.text} />
    </Pressable>
  );
}
