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

const SHIP_ALL = new Set([
  'supabase/config.toml',
  'scripts/deploy-functions.mjs',
  '.github/workflows/deploy-functions.yml',
]);

function changedFileShipsAll(file, functions) {
  const normalized = file.replaceAll('\\', '/');
  if (SHIP_ALL.has(normalized)) return true;
  const match = normalized.match(/^supabase\/functions\/([^/]+)\/(.+)$/);
  if (!match) return false;
  const [, name, rest] = match;
  if (name.startsWith('_')) return true;
  if (rest.endsWith('.test.ts') || rest.endsWith('.env.example') || rest === 'deno.ci.json') return false;
  return functions.includes(name);
}

/**
 * @param {string[] | null} files null means the diff is unknown and every function ships
 * @param {string[]} functions directory names under supabase/functions, excluding shared folders
 */
export function functionsToShip(files, functions) {
  const all = [...functions].sort();
  if (files == null) return all;
  return files.some((file) => changedFileShipsAll(file, functions)) ? all : [];
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
  const names = functionsToShip(files, functions);

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
