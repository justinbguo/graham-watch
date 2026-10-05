import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

export default defineConfig(({ mode, command }) => {
  // A build with no env is worse than a failed one. Vite inlines the missing
  // values as `undefined`, which makes supabase.ts's guard clause statically
  // true, so Rollup proves createClient is unreachable and tree-shakes every
  // line of supabase-js away. The result is a green build a third smaller than
  // production that can only throw on load. Fail here instead.
  if (command === 'build') {
    // This directory, not process.cwd(): Vite's own envDir defaults to the
    // config file's directory, and the check has to read what Vite reads or it
    // fails on a build started from elsewhere.
    const env = loadEnv(mode, import.meta.dirname, 'VITE_');
    const missing = REQUIRED.filter((name) => !env[name]);

    if (missing.length > 0) {
      throw new Error(
        `Missing ${missing.join(' and ')}. Run \`npm run env -- local\` from the repo root, or set them in the environment.`
      );
    }
  }

  return { plugins: [react()] };
});
