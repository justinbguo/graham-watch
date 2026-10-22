import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable } from 'react-native';

import { yellow } from '@/lib/design';
import { HIT_TARGET, size } from '@/lib/theme';

/** Seller offer entry beside the message field. */
export function OfferDealButton({
  disabled = false,
  onPress,
}: {
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Offer a deal"
      disabled={disabled}
      onPress={onPress}
      hitSlop={(HIT_TARGET - size.icon) / 2}
      style={({ pressed }) => [
        {
          width: HIT_TARGET,
          height: HIT_TARGET,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.72 : disabled ? 0.4 : 1,
        },
      ]}>
      <MaterialCommunityIcons name="handshake-outline" size={size.icon} color={yellow} />
    </Pressable>
  );
}
