import { LinearGradient } from 'expo-linear-gradient';
import { useLayoutEffect, useRef } from 'react';
import { ScrollView, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { HIT_TARGET, radius, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { daysInMonth } from './age';

const ROW = HIT_TARGET;
const VISIBLE = 5;
const PAD = ROW * 2;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatBirthday(month: number, day: number, year: number): string {
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function years(): number[] {
  const latest = new Date().getFullYear();
  const list: number[] = [];
  for (let year = latest; year >= latest - 120; year -= 1) list.push(year);
  return list;
}

const YEAR_VALUES = years();

/**
 * Month, day, and year, each a wheel that snaps to one value. A slider would
 * ask a thumb to land on a single year. The selected row is the center one.
 */
export function BirthdayWheels({
  month,
  day,
  year,
  onChange,
}: {
  month: number;
  day: number;
  year: number;
  onChange: (next: { month: number; day: number; year: number }) => void;
}) {
  const styles = useThemedStyles(wheelStyles);
  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);

  return (
    <View style={styles.columns}>
      <Wheel
        label="Month"
        flex={2}
        items={MONTHS.map((label, index) => ({ value: index + 1, label }))}
        value={month}
        onChange={(value) => onChange({ month: value, day, year })}
      />
      <Wheel
        label="Day"
        flex={1}
        items={days.map((value) => ({ value, label: String(value) }))}
        value={day}
        onChange={(value) => onChange({ month, day: value, year })}
      />
      <Wheel
        label="Year"
        flex={1.4}
        items={YEAR_VALUES.map((value) => ({ value, label: String(value) }))}
        value={year}
        onChange={(value) => onChange({ month, day, year: value })}
      />
    </View>
  );
}

function Wheel({
  label,
  items,
  value,
  onChange,
  flex,
}: {
  label: string;
  items: { value: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
  flex: number;
}) {
  const styles = useThemedStyles(wheelStyles);
  const theme = useTheme();
  const ref = useRef<ScrollView>(null);
  const fromUser = useRef(false);
  const index = Math.max(0, items.findIndex((item) => item.value === value));

  useLayoutEffect(() => {
    if (fromUser.current) {
      fromUser.current = false;
      return;
    }
    ref.current?.scrollTo({ y: index * ROW, animated: false });
  }, [index]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(
      items.length - 1,
      Math.max(0, Math.round(event.nativeEvent.contentOffset.y / ROW))
    );
    const item = items[next];
    if (!item || item.value === value) return;
    fromUser.current = true;
    onChange(item.value);
  };

  return (
    <View style={{ flex }}>
      <View style={styles.window} pointerEvents="none">
        <View style={styles.band} />
      </View>
      <ScrollView
        ref={ref}
        style={styles.scroller}
        contentContainerStyle={styles.rows}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        nestedScrollEnabled
        accessibilityLabel={label}
        onContentSizeChange={() => {
          if (fromUser.current) return;
          ref.current?.scrollTo({ y: index * ROW, animated: false });
        }}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(event) => {
          if (event.nativeEvent.velocity?.y === 0) settle(event);
        }}>
        {items.map((item) => (
          <View key={item.value} style={styles.cell}>
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        ))}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={[theme.color.background, 'transparent']}
        style={styles.fadeTop}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', theme.color.background]}
        style={styles.fadeBottom}
      />
    </View>
  );
}

const wheelStyles = (theme: Theme) => ({
  columns: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  window: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    height: ROW * VISIBLE,
    justifyContent: 'center' as const,
  },
  band: {
    height: ROW,
    borderRadius: radius.md,
    backgroundColor: theme.color.fill,
  },
  scroller: {
    height: ROW * VISIBLE,
  },
  rows: {
    paddingVertical: PAD,
  },
  cell: {
    height: ROW,
    justifyContent: 'center' as const,
    paddingHorizontal: space.sm,
  },
  label: {
    ...type.body,
    color: theme.color.text,
    textAlign: 'center' as const,
  },
  fadeTop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: ROW,
  },
  fadeBottom: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: ROW,
  },
});
