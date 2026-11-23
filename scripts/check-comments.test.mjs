import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { violationsInDiff } from './check-comments.mjs';

const SCRIPT = new URL('./check-comments.mjs', import.meta.url);

function diff(file, added) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1,0 +1 @@',
    ...added.map((line) => `+${line}`),
  ].join('\n');
}

test('an added slash comment outside the allowlist fails', () => {
  const found = violationsInDiff(diff('src/app/note.ts', ['const n = 1;', '  // added']));
  assert.equal(found.length, 1);
  assert.equal(found[0].file, 'src/app/note.ts');
  assert.equal(found[0].line, 2);
  assert.equal(found[0].text, '// added');
});

test('block, jsx, and sql comments fail, and a markdown dash line does not', () => {
  assert.equal(violationsInDiff(diff('src/app/note.ts', ['/* kept */'])).length, 1);
  assert.equal(violationsInDiff(diff('src/app/note.tsx', ['{/* kept */}'])).length, 1);
  assert.equal(violationsInDiff(diff('supabase/migrations/new.sql', ['-- kept'])).length, 1);
  assert.deepEqual(violationsInDiff(diff('docs/OPERATING.md', ['-- a table rule'])), []);
});

test('a moved comment counts as an add', () => {
  const moved = [
    'diff --git a/src/app/note.ts b/src/app/note.ts',
    '--- a/src/app/note.ts',
    '+++ b/src/app/note.ts',
    '@@ -1 +1 @@',
    '-// old place',
    '+const n = 1;',
    '@@ -9,0 +10 @@',
    '+// new place',
  ].join('\n');
  const found = violationsInDiff(moved);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 10);
  assert.equal(found[0].text, '// new place');
});

test('allowlisted paths and a url do not fail', () => {
  const body = [
    diff('studio/template.ts', ['// vendored']),
    diff('expo-env.d.ts', ['// generated']),
    diff('supabase/seed.sql', ['-- snapshot header']),
    diff('src/lib/database.types.ts', ['// generated']),
    diff('src/app/note.ts', ['const url = "https://example.test";']),
  ].join('\n');
  assert.deepEqual(violationsInDiff(body), []);
});

function git(dir, args) {
  return execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', '-c', 'init.defaultBranch=main', ...args], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function repoWith(file, before, after) {
  const dir = mkdtempSync(join(tmpdir(), 'check-comments-'));
  git(dir, ['init', '-b', 'main']);
  const path = join(dir, file);
  mkdirSync(join(dir, file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.'), { recursive: true });
  writeFileSync(path, before);
  git(dir, ['add', file]);
  git(dir, ['commit', '-m', 'base']);
  writeFileSync(path, after);
  git(dir, ['add', file]);
  git(dir, ['commit', '-m', 'add']);
  return dir;
}

test('the command fails when HEAD adds a slash comment', () => {
  const dir = repoWith('src/note.ts', 'export const n = 1;\n', 'export const n = 1;\n// added\n');
  try {
    assert.throws(
      () => execFileSync('node', [SCRIPT.pathname, 'HEAD~1'], { cwd: dir, encoding: 'utf8' }),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(error.stdout, /src\/note\.ts:\d+: \/\/ added/);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command allows a slash comment under studio', () => {
  const dir = repoWith('studio/note.ts', 'export const n = 1;\n', 'export const n = 1;\n// vendored\n');
  try {
    const stdout = execFileSync('node', [SCRIPT.pathname, 'HEAD~1'], { cwd: dir, encoding: 'utf8' });
    assert.equal(stdout, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
