import type { ColorScheme } from '@/lib/theme';

/** Warm fills that read on both schemes with dark type on top. */
const PALETTE: Record<ColorScheme, readonly string[]> = {
  light: ['#E8DFD4', '#D9E4E0', '#E4DCE8', '#E0E4D9', '#E8E0D4', '#DDE3EB', '#EBE4D6'],
  dark: ['#3A3530', '#353A38', '#3A3538', '#383A35', '#3A3835', '#35383A', '#3A3638'],
};

export function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function avatarMonogramColor(seed: string, scheme: ColorScheme): string {
  const palette = PALETTE[scheme];
  return palette[stableHash(seed) % palette.length];
}

/** First letter of the first name, or the handle when there is no name. */
export function avatarMonogramLetter(name: string | null | undefined, handle?: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const first = trimmed.split(/\s+/)[0];
    if (first) return first.charAt(0).toUpperCase();
  }
  const at = handle?.replace(/^@/, '').trim();
  if (at) return at.charAt(0).toUpperCase();
  return '?';
}
