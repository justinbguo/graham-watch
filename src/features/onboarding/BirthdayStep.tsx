import { useEffect } from 'react';
import { Keyboard, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useThemedStyles } from '@/providers/theme';

import { daysInMonth, defaultBirthday, parseDateOfBirth } from './age';
import { BirthdayWheels, formatBirthday } from './BirthdayWheels';
import { StepShell } from './StepShell';
import { onboardingStyles } from './styles';

export function BirthdayStep({
  month,
  day,
  year,
  error,
  onChangeMonth,
  onChangeDay,
  onChangeYear,
  onContinue,
  onBack,
}: {
  month: string;
  day: string;
  year: string;
  error?: string | null;
  onChangeMonth: (value: string) => void;
  onChangeDay: (value: string) => void;
  onChangeYear: (value: string) => void;
  onContinue: (iso: string, adult: boolean) => void;
  onBack: () => void;
}) {
  const styles = useThemedStyles(onboardingStyles);
  const fallback = defaultBirthday();
  const monthNum = integerOr(month, fallback.month);
  const yearNum = integerOr(year, fallback.year);
  const dayNum = Math.min(integerOr(day, fallback.day), daysInMonth(yearNum, monthNum));
  const parsed = parseDateOfBirth(String(monthNum), String(dayNum), String(yearNum));

  // The previous slide holds the keyboard. This one has nothing to type into,
  // and an empty answer becomes the youngest legal birthday so the wheels are
  // never blank.
  useEffect(() => {
    Keyboard.dismiss();
    if (month && day && year) return;
    onChangeMonth(String(fallback.month));
    onChangeDay(String(fallback.day));
    onChangeYear(String(fallback.year));
    // Once, when the slide opens. Later scrolls must not be reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (next: { month: number; day: number; year: number }) => {
    const clamped = Math.min(next.day, daysInMonth(next.year, next.month));
    onChangeMonth(String(next.month));
    onChangeDay(String(clamped));
    onChangeYear(String(next.year));
  };

  return (
    <StepShell
      heading="When is your birthday?"
      detail="Graham is for people 18 and over."
      error={error}
      onBack={onBack}
      actions={
        <Button
          label="Continue"
          disabled={!parsed.ok}
          onPress={() => {
            if (parsed.ok) onContinue(parsed.iso, parsed.adult);
          }}
        />
      }>
      <View style={styles.form}>
        <Text style={styles.birthdayReadout}>{formatBirthday(monthNum, dayNum, yearNum)}</Text>
        <BirthdayWheels month={monthNum} day={dayNum} year={yearNum} onChange={apply} />
      </View>
    </StepShell>
  );
}

function integerOr(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
