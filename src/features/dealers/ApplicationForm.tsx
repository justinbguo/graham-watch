import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Field, Heading, Message, Spinner } from '@/components/ui';
import { VOLUMES, VOLUME_LABELS } from '@/data/applications';
import { HIT_TARGET, inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { useShopApplication } from './application';

/**
 * Applying to list a shop Graham has never read.
 *
 * Three qualifications, because an operator reads every application by hand and
 * these are what the decision turns on: the site to look at, what they stock,
 * and how much of it. Nothing here is a grant — see `application.ts`.
 */
export function ApplicationForm({
  apply,
  onDone,
}: {
  apply: ReturnType<typeof useShopApplication>;
  onDone: () => void;
}) {
  const styles = useThemedStyles(formStyles);

  if (apply.isLoading) return <Spinner />;

  if (apply.step === 'done') {
    return (
      <View style={styles.card}>
        <Heading>That is with us</Heading>
        <Message
          text={`We know ${apply.application?.shop_name ?? 'your shop'} is really yours. Someone here reads every application and will write to ${apply.application?.verified_email ?? 'you'} either way.`}
        />
        <Message text="Nothing is public until we have read it. You can browse in the meantime." />
        <Button label="Start looking around" variant="solid" onPress={onDone} />
      </View>
    );
  }

  if (apply.step === 'verify') {
    return (
      <View style={styles.card}>
        <View style={styles.copy}>
          <Heading>Check it is really you</Heading>
          <Message
            text={
              apply.sentTo
                ? apply.readingInbox
                  ? `Reading the local inbox for ${apply.sentTo}.`
                  : `We sent a six digit code to ${apply.sentTo}. It expires in 15 minutes.`
                : 'Pick a mailbox on your own domain. We send a code there so we know the application came from the shop.'
            }
          />
        </View>

        {apply.sentTo ? (
          <>
            <Field
              accessibilityLabel="Verification code"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              placeholder="123456"
              value={apply.code}
              onChangeText={apply.setCode}
            />
            {apply.error ? <Message text={apply.error} tone="error" /> : null}
            <Button
              label="Confirm"
              variant="solid"
              loading={apply.verifying}
              disabled={apply.code.trim().length !== 6}
              onPress={apply.submitCode}
            />
            <Button label="Use a different address" variant="ghost" onPress={apply.startOver} />
          </>
        ) : apply.host ? (
          <>
            <View style={styles.inline}>
              <View style={styles.grow}>
                <Field
                  accessibilityLabel="Mailbox name"
                  placeholder="you"
                  value={apply.localPart}
                  onChangeText={apply.setLocalPart}
                />
              </View>
              <Text style={styles.suffix}>@{apply.host}</Text>
            </View>
            {apply.error ? <Message text={apply.error} tone="error" /> : null}
            <Button
              label="Send the code"
              variant="solid"
              loading={apply.sending}
              disabled={!apply.localPart.trim()}
              onPress={apply.sendCode}
            />
          </>
        ) : (
          <Message
            text="We could not read a domain off that website. Email us and we will sort it out."
            tone="error"
          />
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.copy}>
        <Heading>Tell us about your shop</Heading>
        <Message text="We read this by hand. It is the whole application — no fee, and no commission on anything you sell." />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Shop name</Text>
        <Field
          value={apply.shopName}
          onChangeText={apply.setShopName}
          autoCapitalize="words"
          placeholder="Watches of Knightsbridge"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Website</Text>
        <Field
          value={apply.website}
          onChangeText={apply.setWebsite}
          keyboardType="url"
          autoCapitalize="none"
          placeholder="your-shop.com"
        />
        <Message text="We send the code to a mailbox on this domain, so use the site you actually sell from." />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Brands you stock</Text>
        <Field
          value={apply.brandsInput}
          onChangeText={apply.setBrandsInput}
          autoCapitalize="words"
          placeholder="Rolex, Heuer, Universal Genève"
        />
        {apply.brands.length ? (
          <Text style={styles.parsed}>
            {apply.brands.length} brand{apply.brands.length === 1 ? '' : 's'}:{' '}
            {apply.brands.join(' · ')}
          </Text>
        ) : (
          <Message text="Separate them with commas." />
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>How many watches do you list at once?</Text>
        <View style={styles.options}>
          {VOLUMES.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: apply.volume === value }}
              onPress={() => apply.setVolume(value)}
              style={({ pressed }) => [
                styles.option,
                apply.volume === value && styles.optionSelected,
                pressed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.optionLabel,
                  apply.volume === value && styles.optionLabelSelected,
                ]}>
                {VOLUME_LABELS[value]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {apply.error ? <Message text={apply.error} tone="error" /> : null}

      <Button
        label="Send my application"
        variant="solid"
        loading={apply.filing}
        disabled={!apply.shopName.trim() || !apply.website.trim()}
        onPress={apply.file}
      />
    </ScrollView>
  );
}

const formStyles = (theme: Theme) => ({
  content: {
    gap: stack.group,
  },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: radius.md,
    padding: inset.card,
    gap: stack.related,
  },
  copy: {
    gap: stack.tight,
  },
  field: {
    gap: stack.tight,
  },
  label: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  parsed: {
    ...type.caption,
    color: theme.color.brass,
  },
  inline: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: stack.tight,
  },
  grow: {
    flex: 1,
  },
  suffix: {
    ...type.body,
    color: theme.color.textMuted,
  },
  options: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  option: {
    borderRadius: radius.sm,
    paddingHorizontal: inset.compactX,
    paddingVertical: inset.compactY,
    minHeight: HIT_TARGET,
    justifyContent: 'center' as const,
    backgroundColor: theme.color.fill,
  },
  optionSelected: {
    backgroundColor: theme.color.brass,
  },
  optionLabel: {
    ...type.control,
    color: theme.color.text,
  },
  optionLabelSelected: {
    color: theme.color.background,
  },
  pressed: {
    opacity: 0.72,
  },
});
