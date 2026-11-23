import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Eyebrow, Field, Message } from '@/components/ui';
import { useUpdateDealerListing } from '@/data/dealers';
import { dealerListingChanges } from '@/features/listings/listingParse';
import type { WatchCatalogHit } from '@/data/watchCatalog';
import { Constants } from '@/lib/database';
import { humanize } from '@/lib/format';

import { WatchModelSuggest } from './WatchModelSuggest';
import type {
  CaseMaterial,
  Complication,
  DeckCard,
  DialColor,
  WatchStyle,
  Winding,
} from '@/lib/models';
import { fieldChrome, HIT_TARGET, inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const { case_material, complication, dial_color, watch_style, winding } = Constants.public.Enums;

// The codes dealers actually price in. An unknown code would reach
// Intl.NumberFormat and throw, so this is a closed list plus whatever the row
// already holds.
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'HKD', 'AUD', 'CAD'];

type Draft = {
  brand: string;
  model: string;
  reference: string;
  year: string;
  caliber: string;
  condition: string;
  price: string;
  currency: string;
  caseSize: string;
  description: string;
  sourceUrl: string;
  winding: Winding | null;
  caseMaterial: CaseMaterial | null;
  dialColor: DialColor | null;
  style: WatchStyle | null;
  complications: Complication[];
  hasBox: boolean | null;
  hasPapers: boolean | null;
};

const text = (value: string | null) => value ?? '';
const number = (value: number | null) => (value == null ? '' : String(value));

function draftFrom(card: DeckCard): Draft {
  return {
    brand: card.brand,
    model: text(card.model),
    reference: text(card.reference),
    year: number(card.year),
    caliber: text(card.caliber),
    condition: text(card.condition),
    // Dealers think in whole currency, the column is cents.
    price: card.price_cents == null ? '' : String(card.price_cents / 100),
    currency: card.currency,
    caseSize: number(card.case_size_mm),
    description: text(card.description),
    sourceUrl: text(card.source_url),
    winding: card.winding,
    caseMaterial: card.case_material,
    dialColor: card.dial_color,
    style: card.style,
    complications: card.complications,
    hasBox: card.has_box,
    hasPapers: card.has_papers,
  };
}

/** Column names as a dealer would say them: "the price, the year and the model". */
function listFields(columns: string[]): string {
  const names = columns.map((column) => humanize(column).toLowerCase());
  if (names.length === 1) return `the ${names[0]}`;
  return `the ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function ListingEditor({ card, onSaved }: { card: DeckCard; onSaved: () => void }) {
  const styles = useThemedStyles(editorStyles);
  const [draft, setDraft] = useState(() => draftFrom(card));
  const [problem, setProblem] = useState<string | null>(null);
  const save = useUpdateDealerListing(card.dealer_id);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  /** Tapping the live option clears it: "we do not know" is a real answer. */
  const pickOne = <K extends 'winding' | 'caseMaterial' | 'dialColor' | 'style'>(
    key: K,
    value: NonNullable<Draft[K]>
  ) => set(key, (draft[key] === value ? null : value) as Draft[K]);

  const toggleComplication = (value: Complication) =>
    set(
      'complications',
      draft.complications.includes(value)
        ? draft.complications.filter((item) => item !== value)
        : [...draft.complications, value]
    );

  function applyCatalog(hit: WatchCatalogHit) {
    setDraft((current) => ({
      ...current,
      brand: hit.brand_name,
      model: hit.series_name,
      reference: hit.reference_number ?? '',
    }));
  }

  const catalogQuery = draft.reference.trim() || draft.model.trim();

  const currencies = CURRENCIES.includes(draft.currency)
    ? CURRENCIES
    : [draft.currency, ...CURRENCIES];

  const photo = card.photos[0]?.url;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.identity}>
        {photo ? <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" /> : null}
        <View style={styles.identityCopy}>
          <Text style={styles.title}>{[card.brand, card.model].filter(Boolean).join(' ')}</Text>
          <Message text="Photos come from your own site. Refresh from the Deal tab Listings section to pick up new ones." />
          {/* The rule is invisible otherwise, and a dealer who does not know it
              cannot tell a refresh that respected their work from one that got
              lucky. */}
          <Message
            text={
              card.edited_fields.length
                ? `You have corrected ${listFields(card.edited_fields)} by hand. A refresh leaves those alone and updates the rest from your site.`
                : 'Anything you change here stops following your site. Everything else keeps updating on each refresh.'
            }
          />
        </View>
      </View>

      <Group title="Watch">
        <Labelled label="Brand">
          <Field
            value={draft.brand}
            onChangeText={(value) => set('brand', value)}
            autoCapitalize="words"
            placeholder="Rolex"
          />
        </Labelled>
        <Labelled label="Model">
          <Field
            value={draft.model}
            onChangeText={(value) => set('model', value)}
            autoCapitalize="words"
            placeholder="Explorer"
          />
        </Labelled>
        <Labelled label="Reference">
          <Field
            value={draft.reference}
            onChangeText={(value) => set('reference', value)}
            placeholder="1016"
          />
        </Labelled>
        <WatchModelSuggest query={catalogQuery} brand={draft.brand} onPick={applyCatalog} />
        <View style={styles.pair}>
          <Labelled label="Year">
            <Field
              value={draft.year}
              onChangeText={(value) => set('year', value)}
              keyboardType="number-pad"
              placeholder="1967"
            />
          </Labelled>
          <Labelled label="Case size (mm)">
            <Field
              value={draft.caseSize}
              onChangeText={(value) => set('caseSize', value)}
              keyboardType="decimal-pad"
              placeholder="36"
            />
          </Labelled>
        </View>
        <Labelled label="Caliber">
          <Field
            value={draft.caliber}
            onChangeText={(value) => set('caliber', value)}
            placeholder="Cal. 1570"
          />
        </Labelled>
        <Labelled label="Condition">
          <Field
            value={draft.condition}
            onChangeText={(value) => set('condition', value)}
            autoCapitalize="sentences"
            placeholder="Excellent, recently serviced"
          />
        </Labelled>
      </Group>

      <Group title="Price">
        <View style={styles.pair}>
          <Labelled label="Amount">
            <Field
              value={draft.price}
              onChangeText={(value) => set('price', value)}
              keyboardType="decimal-pad"
              placeholder="Leave empty for price on request"
            />
          </Labelled>
        </View>
        <View style={styles.options}>
          {currencies.map((code) => (
            <Option
              key={code}
              label={code}
              selected={draft.currency === code}
              onPress={() => set('currency', code)}
            />
          ))}
        </View>
      </Group>

      <Group title="Winding">
        <View style={styles.options}>
          {winding.map((value) => (
            <Option
              key={value}
              label={humanize(value)}
              selected={draft.winding === value}
              onPress={() => pickOne('winding', value)}
            />
          ))}
        </View>
      </Group>

      <Group title="Case">
        <View style={styles.options}>
          {case_material.map((value) => (
            <Option
              key={value}
              label={humanize(value)}
              selected={draft.caseMaterial === value}
              onPress={() => pickOne('caseMaterial', value)}
            />
          ))}
        </View>
      </Group>

      <Group title="Dial">
        <View style={styles.options}>
          {dial_color.map((value) => (
            <Option
              key={value}
              label={humanize(value)}
              selected={draft.dialColor === value}
              onPress={() => pickOne('dialColor', value)}
            />
          ))}
        </View>
      </Group>

      <Group title="Style">
        <View style={styles.options}>
          {watch_style.map((value) => (
            <Option
              key={value}
              label={humanize(value)}
              selected={draft.style === value}
              onPress={() => pickOne('style', value)}
            />
          ))}
        </View>
      </Group>

      <Group title="Complications">
        <View style={styles.options}>
          {complication.map((value) => (
            <Option
              key={value}
              label={humanize(value)}
              selected={draft.complications.includes(value)}
              onPress={() => toggleComplication(value)}
            />
          ))}
        </View>
      </Group>

      <Group title="Box and papers">
        <Tristate label="Box" value={draft.hasBox} onChange={(next) => set('hasBox', next)} />
        <Tristate
          label="Papers"
          value={draft.hasPapers}
          onChange={(next) => set('hasPapers', next)}
        />
      </Group>

      <Group title="Description">
        <Field
          value={draft.description}
          onChangeText={(value) => set('description', value)}
          multiline
          autoCapitalize="sentences"
          placeholder="What a buyer should know about this watch."
          style={styles.multiline}
        />
      </Group>

      <Group title="Link">
        <Labelled label="Page on your site">
          <Field
            value={draft.sourceUrl}
            onChangeText={(value) => set('sourceUrl', value)}
            keyboardType="url"
            placeholder="https://your-shop.com/watches/explorer-1016"
          />
        </Labelled>
        <Message text="Buyers follow this link, and inquiry emails carry it. It is also how a refresh recognises this watch, so changing it can import the watch a second time." />
      </Group>

      {problem ? <Message text={problem} tone="error" /> : null}
      {save.error ? <Message text={save.error.message} tone="error" /> : null}

      <View style={styles.actions}>
        <Button
          label="Save changes"
          loading={save.isPending}
          disabled={!draft.brand.trim()}
          onPress={() => {
            const changes = dealerListingChanges(draft);
            if ('error' in changes) {
              setProblem(changes.error);
              return;
            }
            setProblem(null);
            save.mutate({ listingId: card.id, changes }, { onSuccess: onSaved });
          }}
        />
      </View>
    </ScrollView>
  );
}

/**
 * One value of an enum. Compact rather than the full-width row the filter sheet
 * uses: this form offers about sixty options across seven enums, and sixty rows
 * is a form nobody reaches the bottom of.
 */
function Option({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(editorStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(editorStyles);
  return (
    <View style={styles.group}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </View>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useThemedStyles(editorStyles);
  return (
    <View style={styles.labelled}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Tristate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean | null) => void;
}) {
  const styles = useThemedStyles(editorStyles);

  return (
    <View style={styles.labelled}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.options}>
        <Option label="Yes" selected={value === true} onPress={() => onChange(true)} />
        <Option label="No" selected={value === false} onPress={() => onChange(false)} />
        <Option label="Unknown" selected={value === null} onPress={() => onChange(null)} />
      </View>
    </View>
  );
}

const editorStyles = (theme: Theme) => ({
  content: {
    paddingHorizontal: inset.screen,
    paddingBottom: inset.screen,
    gap: stack.group,
  },
  identity: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  identityCopy: {
    flex: 1,
    gap: stack.tight,
  },
  thumb: {
    width: size.thumb,
    height: size.thumb,
    borderRadius: radius.sm,
    backgroundColor: theme.color.surfaceSunken,
  },
  title: {
    ...type.title,
    color: theme.color.text,
  },
  group: {
    gap: stack.related,
  },
  labelled: {
    flex: 1,
    gap: stack.tight,
  },
  fieldLabel: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  pair: {
    flexDirection: 'row' as const,
    gap: space.md,
  },
  options: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  option: {
    ...fieldChrome(theme),
    borderRadius: radius.full,
    paddingHorizontal: inset.compactX,
    paddingVertical: inset.compactY,
    minHeight: HIT_TARGET,
    justifyContent: 'center' as const,
  },
  optionSelected: {
    backgroundColor: theme.color.brass,
    borderColor: theme.color.brass,
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
  multiline: {
    minHeight: size.fieldMultiline,
    textAlignVertical: 'top' as const,
    paddingTop: inset.controlY,
  },
  actions: {
    gap: stack.related,
  },
});
