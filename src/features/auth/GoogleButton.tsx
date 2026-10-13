import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { SignInOption } from '@/features/auth/SignInOption';
import { size } from '@/lib/theme';

const MARK = require('../../../assets/google-g.png');

/**
 * Google's door. The capsule is ours — `SignInOption`, so it contrasts the
 * page like every other button. The mark is Google's four-color G, and it
 * is the one thing on the door we do not recolor.
 *
 * The mark is silent. The label already names Google, and a screen reader
 * naming both says Google twice.
 */
export function GoogleButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <SignInOption
      label={label}
      disabled={disabled}
      onPress={onPress}
      mark={<Image source={MARK} style={styles.mark} contentFit="contain" accessible={false} />}
    />
  );
}

const styles = StyleSheet.create({
  mark: {
    width: size.providerMark,
    height: size.providerMark,
  },
});
