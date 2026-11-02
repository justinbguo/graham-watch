/**
 * Node will not resolve `from './types'` inside a TypeScript file. The app
 * bundler does. This hook is only for tests that import those files directly.
 */
import { register } from 'node:module';

register('./ts-resolve-hook.mjs', import.meta.url);
