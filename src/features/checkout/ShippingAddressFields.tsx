import { Text, View } from 'react-native';

import { Field } from '@/components/ui';
import type { ShipTo } from '@/data/checkout';
import { space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** The address block a seller gets. Country is a two-letter code; US by default. */
export function ShippingAddressFields({
  value,
  onChange,
  disabled = false,
}: {
  value: ShipTo;
  onChange: (next: ShipTo) => void;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(fieldsStyles);
  const set = (key: keyof ShipTo) => (text: string) => onChange({ ...value, [key]: text });

  return (
    <View style={styles.block}>
      <Field
        value={value.name}
        onChangeText={set('name')}
        placeholder="Full name"
        autoCapitalize="words"
        textContentType="name"
        editable={!disabled}
      />
      <Field
        value={value.line1}
        onChangeText={set('line1')}
        placeholder="Street address"
        autoCapitalize="words"
        textContentType="streetAddressLine1"
        editable={!disabled}
      />
      <Field
        value={value.line2}
        onChangeText={set('line2')}
        placeholder="Apt, suite, unit (optional)"
        autoCapitalize="words"
        textContentType="streetAddressLine2"
        editable={!disabled}
      />
      <View style={styles.row}>
        <View style={styles.grow}>
          <Field
            value={value.city}
            onChangeText={set('city')}
            placeholder="City"
            autoCapitalize="words"
            textContentType="addressCity"
            editable={!disabled}
          />
        </View>
        <View style={styles.region}>
          <Field
            value={value.region}
            onChangeText={set('region')}
            placeholder="State"
            autoCapitalize="characters"
            textContentType="addressState"
            editable={!disabled}
          />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Field
            value={value.postal_code}
            onChangeText={set('postal_code')}
            placeholder="ZIP / postal code"
            textContentType="postalCode"
            editable={!disabled}
          />
        </View>
        <View style={styles.region}>
          <Field
            value={value.country}
            onChangeText={set('country')}
            placeholder="US"
            autoCapitalize="characters"
            maxLength={2}
            textContentType="countryName"
            editable={!disabled}
          />
        </View>
      </View>
      <Field
        value={value.phone}
        onChangeText={set('phone')}
        placeholder="Phone for the carrier (optional)"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        editable={!disabled}
      />
      <Text style={styles.note}>
        The seller sees only this address and your first name. Nothing else from your profile.
      </Text>
    </View>
  );
}

const fieldsStyles = (theme: Theme) => ({
  block: {
    gap: stack.tight,
  },
  row: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  grow: {
    flex: 1,
  },
  region: {
    width: 96,
  },
  note: {
    ...type.caption,
    color: theme.color.textMuted,
    paddingTop: space.xs,
  },
});
