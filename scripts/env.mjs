#!/usr/bin/env node
/**
 * npm run env            which Graham each surface points at
 * npm run env -- local   app, scripts, and operator UI → the local stack
 * npm run env -- hosted  app, scripts, and operator UI → production
 *
 * Hosted credentials are never written by this script. They stay where they
 * were put by hand: `.env` for the app, `scripts/.env.operator.local` for the
 * scripts. Switching only creates or removes `.env.local` and rewrites
 * `operator/.env.local`, both git-ignored.
 */
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';

import {
  APP_ENV,
  APP_LOCAL,
  OPERATOR_HOSTED,
  OPERATOR_UI_ENV,
  hostOf,
  isLocalUrl,
  localStatus,
  parseEnvFile,
  target,
} from './_env.mjs';

const WRITTEN_BY = '# Written by `npm run env`. Switch with `npm run env -- local|hosted`.';

function fail(lines) {
  console.error(`\n${lines.map((line) => `  ${line}`).join('\n')}\n`);
  process.exit(1);
}

function label(url) {
  if (!url) return 'not configured';
  const host = hostOf(url);
  if (!host) return `not a URL: ${url}`;
  return isLocalUrl(url) ? 'local' : `hosted · ${host}`;
}

function report() {
  const app = parseEnvFile(APP_LOCAL).EXPO_PUBLIC_SUPABASE_URL ?? parseEnvFile(APP_ENV).EXPO_PUBLIC_SUPABASE_URL;
  const scripts =
    target() === 'local' ? 'local' : label(parseEnvFile(OPERATOR_HOSTED).SUPABASE_URL);
  const ui = parseEnvFile(OPERATOR_UI_ENV).VITE_SUPABASE_URL;

  console.log(`
  app          ${label(app)}
  scripts      ${scripts}${process.env.GRAHAM_TARGET ? '  (GRAHAM_TARGET)' : ''}
  operator ui  ${label(ui)}
`);

  const surfaces = [label(app), scripts, label(ui)];
  if (new Set(surfaces).size > 1) {
    console.log('  These disagree. `npm run env -- local` or `npm run env -- hosted` lines them up.\n');
  }
  if (surfaces.some((s) => s === 'local') && !localStatus()) {
    console.log('  The local stack is not running: `npm run db:start`.\n');
  }
}

function writeOperatorUi(url, anonKey) {
  writeFileSync(
    OPERATOR_UI_ENV,
    `${WRITTEN_BY}\nVITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`
  );
}

function toLocal() {
  const status = localStatus();
  if (!status) {
    fail(['The local stack is not running. Start it first: `npm run db:start`.']);
  }
  writeFileSync(
    APP_LOCAL,
    `${WRITTEN_BY}\nEXPO_PUBLIC_SUPABASE_URL=${status.url}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${status.anonKey}\n`
  );
  writeOperatorUi(status.url, status.anonKey);
  console.log('\n  Everything → local.\n');
}

function toHosted() {
  const hosted = parseEnvFile(OPERATOR_HOSTED);
  if (!hosted.SUPABASE_URL || !hosted.SUPABASE_ANON_KEY) {
    fail([
      `${OPERATOR_HOSTED} is missing SUPABASE_URL or SUPABASE_ANON_KEY.`,
      `Copy scripts/.env.operator.example there and fill it from the Supabase dashboard.`,
    ]);
  }
  if (isLocalUrl(hosted.SUPABASE_URL)) {
    fail([`${OPERATOR_HOSTED} points at ${hosted.SUPABASE_URL}, which is not a hosted project.`]);
  }
  const app = parseEnvFile(APP_ENV);
  if (!app.EXPO_PUBLIC_SUPABASE_URL || isLocalUrl(app.EXPO_PUBLIC_SUPABASE_URL)) {
    fail([`${APP_ENV} does not hold the hosted pair; the app would have nowhere to go.`]);
  }

  if (existsSync(APP_LOCAL)) {
    // Deleting is the switch, so only delete a file this script could have
    // written. Anything else in it is somebody's hand-kept setting.
    const extra = Object.keys(parseEnvFile(APP_LOCAL)).filter(
      (key) => !['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'].includes(key)
    );
    if (extra.length) {
      fail([
        `${APP_LOCAL} holds more than the Supabase pair (${extra.join(', ')}).`,
        'Move those into .env, then run this again.',
      ]);
    }
    unlinkSync(APP_LOCAL);
  }
  writeOperatorUi(hosted.SUPABASE_URL, hosted.SUPABASE_ANON_KEY);
  console.log(`\n  Everything → hosted · ${hostOf(hosted.SUPABASE_URL)}.\n`);
}

const [command] = process.argv.slice(2);

if (command === undefined) {
  report();
} else if (command === 'local') {
  toLocal();
  report();
  console.log('  Restart Metro and the operator UI; env is read when they start.\n');
} else if (command === 'hosted') {
  toHosted();
  report();
  console.log('  Restart Metro and the operator UI; env is read when they start.\n');
} else {
  fail([`Unknown target "${command}". Use: npm run env [-- local|hosted]`]);
}
