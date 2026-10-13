import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, Field, Message } from '@/components/ui';
import { inset, size, stack, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import type { NewSourcingRequest } from './types';

export function RequestComposer({
  authorId,
  authorName,
  onSubmit,
  submitting,
  error,
}: {
  authorId: string;
  authorName: string;
  onSubmit: (input: NewSourcingRequest) => void;
  submitting: boolean;
  error?: string;
}) {
  const styles = useThemedStyles(composerStyles);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [reference, setReference] = useState('');
  const [budget, setBudget] = useState('');
  const [body, setBody] = useState('');

  const canSubmit = brand.trim().length > 0 && model.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.body}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.fields}>
        <Field
          placeholder="Brand"
          value={brand}
          onChangeText={setBrand}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <Field
          placeholder="Model"
          value={model}
          onChangeText={setModel}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <Field
          placeholder="Reference, if you know it"
          value={reference}
          onChangeText={setReference}
          autoCapitalize="characters"
        />
        <Field
          placeholder="Budget, if you have one"
          value={budget}
          onChangeText={setBudget}
          autoCapitalize="sentences"
        />
        <Field
          placeholder="What are you looking for?"
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={4}
          autoCapitalize="sentences"
          style={styles.bodyField}
        />
        <Message text="The room can reply with leads. Nothing here is a sale — you still deal with the owner directly." />
        {error ? <Message text={error} tone="error" /> : null}
      </View>

      <Button
        label="Post request"
        loading={submitting}
        disabled={!canSubmit}
        onPress={() =>
          onSubmit({
            authorId,
            authorName,
            brand,
            model,
            reference,
            budget,
            body,
          })
        }
      />
    </KeyboardAvoidingView>
  );
}

const composerStyles = (_theme: Theme) => ({
  body: {
    flex: 1,
    paddingHorizontal: inset.screen,
    paddingBottom: inset.screen,
    gap: stack.group,
  },
  fields: {
    gap: stack.related,
  },
  bodyField: {
    minHeight: size.fieldMultiline,
    textAlignVertical: 'top' as const,
    paddingTop: inset.controlY,
  },
});
