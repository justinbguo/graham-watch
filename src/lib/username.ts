/**
 * The same pattern as `profiles_handle_format`. Continue uses it to stay
 * disabled; `claim_username` is what actually accepts the name.
 */
const USERNAME = /^[a-z][a-z0-9_]{2,19}$/;

export function normalizeUsername(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

/** The sentence under the username on the onboarding slide. */
export function collectorLine(number: number): string {
  return `You are Collector #${number} on Graham`;
}

export function usernameIsValid(value: string): boolean {
  return USERNAME.test(normalizeUsername(value));
}
