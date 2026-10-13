import { isPrivateIPv4 } from '@/lib/localHost';

/**
 * Expo Go strips the Metro host out of the launch URL. A dev build on a phone
 * does not: `exp://192.168.x.x:8081` arrives as a path, and the router treats
 * the IP as a screen name. Nothing handles that action.
 */
function hostOf(path: string): string | null {
  const trimmed = path.trim();
  try {
    if (trimmed.includes('://')) return new URL(trimmed).hostname;
  } catch {
    return null;
  }
  const bare = trimmed.replace(/^\//, '').split(/[/?#]/)[0] ?? '';
  return bare.split(':')[0] || null;
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const deep = path.indexOf('/--/');
    if (deep >= 0) {
      const rest = path.slice(deep + 4).split('?')[0] ?? '';
      return rest ? `/${rest}` : '/';
    }
    const host = hostOf(path);
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === 'expo-development-client' ||
      (host != null && isPrivateIPv4(host))
    ) {
      return '/';
    }
    return path;
  } catch {
    return path;
  }
}
