/** Last valid day of a 1-indexed month, including leap Februaries. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The youngest birthday the age gate accepts, used as the wheels' starting
 * position. A future date is not offered. Leap day eighteen years ago falls
 * back to the last real day of that month.
 */
export function defaultBirthday(today = new Date()): { month: number; day: number; year: number } {
  const year = today.getFullYear() - 18;
  const month = today.getMonth() + 1;
  const day = Math.min(today.getDate(), daysInMonth(year, month));
  return { month, day, year };
}

/**
 * Birthday is a calendar date, not a timestamp. Parse the three fields into
 * YYYY-MM-DD and refuse dates that are not real (31 February) or in the future.
 * Eighteen is checked here for the UI; the database trigger is the actual gate.
 */
export function parseDateOfBirth(
  month: string,
  day: string,
  year: string
): { ok: true; iso: string; adult: boolean } | { ok: false } {
  const m = Number(month);
  const d = Number(day);
  const y = Number(year);
  if (!Number.isInteger(m) || !Number.isInteger(d) || !Number.isInteger(y)) {
    return { ok: false };
  }
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) {
    return { ok: false };
  }

  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false };
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > todayUtc) return { ok: false };

  return { ok: true, iso: `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`, adult: isAdult(date, today) };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isAdult(born: Date, today: Date): boolean {
  let age = today.getFullYear() - born.getUTCFullYear();
  const month = today.getMonth() - born.getUTCMonth();
  if (month < 0 || (month === 0 && today.getDate() < born.getUTCDate())) age -= 1;
  return age >= 18;
}
