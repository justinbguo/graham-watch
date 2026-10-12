import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Button, Field, Message, Spinner } from '@/components/ui';
import {
  useExchangePost,
  useSaveExchangePost,
  type ExchangeDraftPhoto,
  type ExchangeIntent,
} from '@/data/exchange';
import { inset, radius, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { BODY_PLACEHOLDER, hasPrice } from './copy';
import { IntentSelect } from './IntentSelect';

const PHOTO_LIMIT = 6;

function dollarsToCents(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const dollars = Number(digits);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return dollars * 100;
}

function dollarsFromCents(cents: number | null) {
  if (cents == null) return '';
  return String(cents / 100);
}

export function Composer({
  userId,
  postId = null,
  onPosted,
}: {
  userId: string;
  postId?: string | null;
  onPosted: (id: string) => void;
}) {
  const styles = useThemedStyles(composerStyles);
  const theme = useTheme();
  const existing = useExchangePost(postId);
  const save = useSaveExchangePost(userId);
  const [intent, setIntent] = useState<ExchangeIntent>('sell');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<ExchangeDraftPhoto[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [filled, setFilled] = useState(!postId);

  useEffect(() => {
    if (!postId || filled || !existing.data?.post) return;
    const post = existing.data.post;
    setIntent(post.intent);
    setTitle(post.title);
    setBody(post.body);
    setPrice(dollarsFromCents(post.price_cents));
    setPhotos(existing.data.photos.map((photo) => ({ kind: 'remote', ...photo })));
    setFilled(true);
  }, [postId, filled, existing.data]);

  const titleOk = title.trim().length >= 3 && title.trim().length <= 80;
  const bodyOk = body.trim().length >= 1 && body.trim().length <= 4000;
  const cents = dollarsToCents(price);
  const priceOk = intent === 'sell' ? cents != null : price.trim() === '' || cents != null;
  const photosOk = photos.length > 0;
  const ready = titleOk && bodyOk && priceOk && photosOk && !save.isPending && filled;

  async function addPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: PHOTO_LIMIT - photos.length,
      quality: 0.7,
    });
    if (result.canceled) return;
    const next: ExchangeDraftPhoto[] = result.assets.map((asset) => ({
      kind: 'local',
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
    }));
    setPhotos((current) => [...current, ...next].slice(0, PHOTO_LIMIT));
  }

  function removePhoto(index: number) {
    const photo = photos[index];
    if (photo?.kind === 'remote') setRemoved((paths) => [...paths, photo.path]);
    setPhotos((current) => current.filter((_, item) => item !== index));
  }

  async function submit() {
    if (!ready) return;
    try {
      const id = await save.mutateAsync({
        postId,
        intent,
        title,
        body,
        priceCents: hasPrice(intent) ? cents : null,
        photos,
        removedPaths: removed,
      });
      if (id) onPosted(id);
    } catch {
      // The message under the button is the failure.
    }
  }

  if (postId && !filled) {
    if (existing.isPending || existing.data === undefined) return <Spinner />;
    if (!existing.data.post) return <Message text="This post did not load." />;
    return <Spinner />;
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <IntentSelect value={intent} onChange={setIntent} />
        <Field
          placeholder="What watch"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="words"
          autoCorrect
          maxLength={80}
        />
        {!hasPrice(intent) ? null : (
          <Field
            placeholder={intent === 'buy' ? 'Budget, if you have one' : 'Price'}
            value={price}
            onChangeText={setPrice}
            keyboardType="number-pad"
          />
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {photos.map((photo, index) => (
            <View key={photo.kind === 'remote' ? photo.path : photo.uri} style={styles.thumbWrap}>
              <Image
                source={{ uri: photo.kind === 'remote' ? photo.url : photo.uri }}
                style={styles.thumb}
                contentFit="cover"
                accessible={false}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                hitSlop={space.sm}
                onPress={() => removePhoto(index)}
                style={styles.remove}>
                <MaterialCommunityIcons name="close" size={size.iconSmall} color={theme.color.onAccent} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <Button
          label={photos.length === 0 ? 'Add photos' : 'Add another photo'}
          icon="image-outline"
          disabled={photos.length >= PHOTO_LIMIT}
          onPress={() => void addPhotos()}
        />
        {photos.length === 0 ? <Message text="A post needs a photo of the watch." /> : null}
        <Field
          placeholder={BODY_PLACEHOLDER[intent]}
          value={body}
          onChangeText={setBody}
          multiline
          autoCapitalize="sentences"
          autoCorrect
          maxLength={4000}
        />
        {save.error ? (
          <Message
            text="That post did not go up. Check the title, the price, and the photos, then try again."
            tone="error"
          />
        ) : null}
        <Button
          label={postId ? 'Save' : 'Post'}
          icon={postId ? 'check' : undefined}
          disabled={!ready}
          loading={save.isPending}
          onPress={() => void submit()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const composerStyles = (theme: Theme) => ({
  fill: { flex: 1 },
  form: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
    gap: space.md,
  },
  photos: {
    gap: space.sm,
  },
  thumbWrap: {
    width: 96,
    height: 96,
  },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
  },
  remove: {
    position: 'absolute' as const,
    top: space.xs,
    right: space.xs,
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.color.accent,
  },
});
