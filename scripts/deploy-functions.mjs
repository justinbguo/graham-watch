/**
 * Deploy the edge functions whose code changed on this push to main.
 *
 * The project ref is the hosted Graham project. The access token is a
 * repository secret (SUPABASE_ACCESS_TOKEN), read from the environment by
 * the Supabase CLI — it is never passed as an argument.
 *
 * import-listings keeps JWT verification on. The nightly job sends the
 * service-role JWT and the cron secret. `--no-verify-jwt` is not a flag
 * this script will add. config.toml is the source of that choice, and a
 * change to it deploys every function so a missed manual deploy gets
 * caught up the next time this file or the config changes.
 *
 * Migrations are not applied here. `db push` writes production schema and
 * needs a database password this job does not have. See docs/OPERATING.md.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PROJECT_REF = 'hbxgxtbtefpyutyqafoi';

export function listFunctionDirs(root = 'supabase/functions') {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

/** operator-bot must say verify_jwt = false. A secret key is not a JWT. */
export function operatorBotSkipsJwt(configText) {
  const blocks = configText.split(/\n(?=\[)/);
  const block = blocks.find((part) => part.startsWith('[functions.operator-bot]'));
  if (!block) return false;
  return /^\s*verify_jwt\s*=\s*false\s*$/m.test(block) && !/verify_jwt\s*=\s*true/.test(block);
}

/** The import-listings block must say verify_jwt = true, and must not also say false. */
export function importListingsKeepsJwt(configText) {
  const blocks = configText.split(/\n(?=\[)/);
  const block = blocks.find((part) => part.startsWith('[functions.import-listings]'));
  if (!block) return false;
  return /^\s*verify_jwt\s*=\s*true\s*$/m.test(block) && !/verify_jwt\s*=\s*false/.test(block);
}

/**
 * @param {string[] | null} files null means the diff is unknown and every function ships
 * @param {string[]} functions directory names under supabase/functions, excluding _shared
 */
export function selectFunctions(files, functions) {
  if (files == null) return [...functions].sort();

  let all = false;
  const chosen = new Set();
  for (const file of files) {
    const normalized = file.replaceAll('\\', '/');
    if (normalized === 'supabase/config.toml') {
      all = true;
      continue;
    }
    const match = normalized.match(/^supabase\/functions\/([^/]+)\/(.+)$/);
    if (!match) continue;
    const [, name, rest] = match;
    if (name.startsWith('_')) {
      all = true;
      continue;
    }
    if (rest.endsWith('.test.ts') || rest.endsWith('.env.example') || rest === 'deno.ci.json') continue;
    if (functions.includes(name)) chosen.add(name);
  }

  if (all) return [...functions].sort();
  return [...chosen].sort();
}

export function deployArgs(name, projectRef = PROJECT_REF) {
  return ['functions', 'deploy', name, '--project-ref', projectRef];
}

const TOKEN_PAGE = 'https://supabase.com/dashboard/account/tokens';

/**
 * A rejected management-API call, as a sentence an operator can act on.
 * Null when the status is some other failure and the caller should print
 * the raw body itself.
 */
export function deployAuthFailure(status, bodyText) {
  const text = bodyText ?? '';
  if (status === 401 || /invalid access token/i.test(text)) {
    return (
      `SUPABASE_ACCESS_TOKEN was rejected (401 Invalid access token). ` +
      `The GitHub Actions secret is missing, expired, or revoked. ` +
      `Create a new personal access token at ${TOKEN_PAGE} for the account that owns project ${PROJECT_REF}, ` +
      `then replace the repository secret SUPABASE_ACCESS_TOKEN. ` +
      `This workflow stops here. Edge functions stay on the last successful deploy until that secret works. ` +
      `Re-run Deploy edge functions after replacing it.`
    );
  }
  if (status === 403) {
    return (
      `SUPABASE_ACCESS_TOKEN cannot list functions on project ${PROJECT_REF} (403). ` +
      `The token is accepted, and the account that owns it does not have access to that project. ` +
      `Replace the repository secret with a token from an account that does, then re-run Deploy edge functions.`
    );
  }
  return null;
}

export async function probeManagementApi(token, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

function diffFiles(before) {
  if (!before || /^0+$/.test(before)) return null;
  try {
    const out = execFileSync('git', ['diff', '--name-only', before, 'HEAD'], { encoding: 'utf8' });
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function writeOutput(names) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${names.length > 0 ? 'true' : 'false'}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `functions<<EOF\n${names.join('\n')}\nEOF\n`);
}

async function main() {
  const configText = readFileSync('supabase/config.toml', 'utf8');
  if (!importListingsKeepsJwt(configText)) {
    console.error(
      'supabase/config.toml must set [functions.import-listings] verify_jwt = true. This deploy does not pass --no-verify-jwt.'
    );
    process.exit(1);
  }

  const functions = listFunctionDirs();
  const files = diffFiles(process.env.BEFORE ?? '');
  const names = selectFunctions(files, functions);

  if (names.length === 0) {
    console.log('No edge function code changed. Nothing to deploy.');
  } else if (files == null) {
    console.log(`No reliable diff against the previous main. Deploying every function: ${names.join(', ')}`);
  } else {
    console.log(`Deploying: ${names.join(', ')}`);
  }

  writeOutput(names);
  if (process.argv.includes('--plan') || names.length === 0) return;

  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.error(
      `SUPABASE_ACCESS_TOKEN is not set. Add a Supabase account access token as that repository secret (${TOKEN_PAGE}). The project ref is already in this script. This workflow cannot deploy until the secret is set.`
    );
    process.exit(1);
  }

  // Fail before the CLI's stack trace. A bad token used to surface as
  // "unexpected list functions status 401" buried under a Node exception,
  // and the nightly refresh then stayed green when notify-drops 404'd.
  const probe = await probeManagementApi(process.env.SUPABASE_ACCESS_TOKEN);
  if (!probe.ok) {
    const loud =
      deployAuthFailure(probe.status, probe.body) ??
      `Could not list edge functions (${probe.status}). ${probe.body.slice(0, 300)}`;
    console.error(loud);
    if (process.env.GITHUB_ACTIONS === 'true') {
      const encoded = loud.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
      console.error(`::error title=SupabaseAccessToken::${encoded}`);
    }
    process.exit(1);
  }

  for (const name of names) {
    const args = deployArgs(name);
    if (args.includes('--no-verify-jwt')) {
      console.error('Refusing to deploy with JWT verification off.');
      process.exit(1);
    }
    execFileSync('supabase', args, { stdio: 'inherit' });
  }
}

function isMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
