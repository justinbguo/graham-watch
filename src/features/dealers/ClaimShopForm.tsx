import { Text, View } from 'react-native';

import { Button, Field, Heading, Message } from '@/components/ui';
import { inset, radius, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { useShopClaim } from './claim';

export function ClaimShopForm({
  claim,
  onDone,
}: {
  claim: ReturnType<typeof useShopClaim>;
  onDone: () => void;
}) {
  const styles = useThemedStyles(formStyles);

  if (claim.step === 'done') {
    return (
      <View style={styles.card}>
        <Heading>{claim.dealer?.name} is yours</Heading>
        <Message text="Its listings are now on your Profile tab, along with a way to refresh them from your site." />
        <Button label="Open my shop" variant="solid" onPress={onDone} />
      </View>
    );
  }

  if (claim.step === 'code') {
    return (
      <View style={styles.card}>
        <View style={styles.copy}>
          <Heading>Enter the code</Heading>
          <Message
            text={
              claim.readingInbox
                ? `Reading the local inbox for ${claim.sentTo}.`
                : `We sent a six digit code to ${claim.sentTo}. It expires in 15 minutes.`
            }
          />
        </View>
        <Field
          accessibilityLabel="Claim code"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          maxLength={6}
          placeholder="123456"
          value={claim.code}
          onChangeText={claim.setCode}
        />
        {claim.error ? <Message text={claim.error} tone="error" /> : null}
        <Button
          label="Claim this shop"
          variant="solid"
          loading={claim.verifying}
          disabled={claim.code.trim().length !== 6}
          onPress={claim.submitCode}
        />
        <Button label="Use a different address" variant="ghost" onPress={claim.startOver} />
      </View>
    );
  }

  if (claim.step === 'address' && claim.dealer) {
    return (
      <View style={styles.card}>
        <View style={styles.copy}>
          <Heading>{claim.dealer.name}</Heading>
          <Message text="Pick a mailbox you can read. We send a code there to check you run the shop — the address you signed in with does not have to match." />
        </View>

        {claim.addresses.host ? (
          <View style={styles.copy}>
            <Text style={styles.label}>An address at {claim.addresses.host}</Text>
            <View style={styles.inline}>
              <View style={styles.grow}>
                <Field
                  accessibilityLabel="Mailbox name"
                  placeholder="you"
                  value={claim.localPart}
                  onChangeText={claim.setLocalPart}
                />
              </View>
              <Text style={styles.suffix}>@{claim.addresses.host}</Text>
            </View>
            <Button
              label="Send the code"
              variant="solid"
              loading={claim.sending}
              disabled={!claim.localPart.trim()}
              onPress={claim.sendToDomain}
            />
          </View>
        ) : null}

        {claim.addresses.published ? (
          <View style={styles.copy}>
            <Text style={styles.label}>Or the address on your site</Text>
            <Button
              label={`Send to ${claim.addresses.published}`}
              loading={claim.sending}
              onPress={claim.sendToPublished}
            />
          </View>
        ) : null}

        {claim.error ? <Message text={claim.error} tone="error" /> : null}
        <Button label="Different shop" variant="ghost" onPress={() => claim.confirmDealer(null)} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <Heading>Which shop is yours?</Heading>
        <Message text="Type the website you sell from. We look for it among the shops already here." />
      </View>
      <Field
        accessibilityLabel="Your shop's website"
        keyboardType="url"
        placeholder="your-shop.com"
        value={claim.website}
        onChangeText={claim.setWebsite}
      />

      {claim.match ? (
        claim.match.claimed ? (
          <Message
            text={`${claim.match.name} is already managed by another account. Email us and we will sort it out.`}
            tone="error"
          />
        ) : (
          <View style={styles.match}>
            <Text style={styles.matchName}>{claim.match.name}</Text>
            <Text style={styles.matchSite}>{claim.match.website}</Text>
            <Button
              label="This is my shop"
              variant="solid"
              onPress={() => claim.confirmDealer(claim.match)}
            />
          </View>
        )
      ) : claim.searching ? (
        <Message text="Looking…" />
      ) : claim.website.trim() ? (
        <Message text="No shop here has that website yet. Check the spelling, or ask us to add it." />
      ) : null}

      {claim.error ? <Message text={claim.error} tone="error" /> : null}
    </View>
  );
}

const formStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: radius.md,
    padding: inset.card,
    gap: stack.related,
  },
  copy: {
    gap: stack.tight,
  },
  label: {
    ...type.bodyStrong,
    color: theme.color.text,
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
  match: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: radius.sm,
    padding: inset.card,
    gap: stack.tight,
  },
  matchName: {
    ...type.title,
    color: theme.color.text,
  },
  matchSite: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
