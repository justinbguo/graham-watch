import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ALLOWED_PREFIXES = ['studio/', 'expo-env.d.ts', 'supabase/seed.sql', 'src/lib/database.types.ts'];

const LINE_MARKERS = ['//', '/*', '{/*'];

export function isAllowed(file) {
  return ALLOWED_PREFIXES.some((prefix) => file === prefix || file.startsWith(prefix));
}

export function lineIsComment(file, text) {
  const line = text.trim();
  if (LINE_MARKERS.some((marker) => line.startsWith(marker))) return true;
  return file.endsWith('.sql') && line.startsWith('--');
}

export function violationsInDiff(diff) {
  const found = [];
  let file = '';
  let lineNo = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      file = '';
      continue;
    }
    if (raw.startsWith('+++ b/')) {
      file = raw.slice('+++ b/'.length);
      continue;
    }
    if (raw.startsWith('+++ /dev/null')) {
      file = '';
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (!raw.startsWith('+')) {
      if (raw.startsWith('-') || raw.startsWith('\\')) continue;
      if (file) lineNo += 1;
      continue;
    }
    const text = raw.slice(1);
    if (file && !isAllowed(file) && lineIsComment(file, text)) {
      found.push({ file, line: lineNo, text: text.trim() });
    }
    lineNo += 1;
  }
  return found;
}

function resolveBase() {
  const named = process.argv[2] || process.env.CHECK_COMMENTS_BASE;
  if (named) return named;
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) return `origin/${baseRef}`;
  return 'origin/main';
}

function main() {
  const base = resolveBase();
  if (/^0+$/.test(base)) return;
  let diff = '';
  try {
    diff = execFileSync('git', ['diff', '-U0', base, 'HEAD'], { encoding: 'utf8' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`check:comments could not diff ${base} against HEAD\n${message}\n`);
    process.exit(2);
  }
  const found = violationsInDiff(diff);
  if (found.length === 0) return;
  for (const item of found) {
    process.stdout.write(`${item.file}:${item.line}: ${item.text}\n`);
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
