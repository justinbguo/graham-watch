import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { backendInfo } from './backend';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// Expo Go's default is exp://<LAN-ip>:<port>. GoTrue refuses that host and
// silently falls back to site_url (`graham://`), which Safari reports as an
// invalid address. preferLocalhost rewrites the IP to localhost, which we
// measured is on the allow-list. No effect on a real build (graham://).
export const redirectTo = makeRedirectUri({ preferLocalhost: true });

/** A failed OAuth return. Auth puts the reason in the URL and otherwise says nothing. */
export function callbackFailure(url: string): string | null {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (params.access_token) return null;
  return params.error_description || params.error || errorCode || null;
}

export async function createSessionFromUrl(url: string) {
  const failed = callbackFailure(url);
  if (failed) throw new Error(failed);

  const { params } = QueryParams.getQueryParams(url);
  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return null;

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return data.session;
}

/**
 * One call serves both doors. Creating an account lets GoTrue mint the user;
 * logging in does not, so an address nobody registered gets a 422 "Signups
 * not allowed for otp" instead of a silent new account under a typo.
 */
export async function sendEmailCode(email: string, { createAccount }: { createAccount: boolean }) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo, shouldCreateUser: createAccount },
  });
  if (!error) return;
  if (!createAccount && /signups not allowed/i.test(error.message)) {
    const { shortLabel } = backendInfo();
    throw new Error(
      `No account uses that address on ${shortLabel}. Create an account instead, or check Settings → Backend.`,
    );
  }
  throw error;
}

/**
 * The mail templates print {{ .Token }}. A brand-new address gets the signup
 * confirmation template; a returning one gets the magic-link template. The
 * two OTP types are not interchangeable, so try signup first and fall through.
 */
export async function verifyEmailCode(email: string, token: string) {
  const trimmed = email.trim();
  const otp = token.trim();
  const signup = await supabase.auth.verifyOtp({ email: trimmed, token: otp, type: 'signup' });
  if (!signup.error) return;
  const magic = await supabase.auth.verifyOtp({ email: trimmed, token: otp, type: 'email' });
  if (magic.error) throw magic.error;
}

// Ask the module, not the platform. Apple Sign In is missing in Expo Go and on
// older iOS, and rendering its button without the native view logs "Unable to
// get the view config" and draws nothing.
export const isAppleSignInAvailable = () => AppleAuthentication.isAvailableAsync();

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // Apple sends the name on first sign-in only, so capture it now or never.
  // Onboarding shows it back as a prefill the user can correct.
  const given = credential.fullName?.givenName ?? null;
  const family = credential.fullName?.familyName ?? null;
  if (given || family) {
    await supabase.auth.updateUser({ data: { given_name: given, family_name: family } });
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase
        .from('profiles')
        .update({ first_name: given, last_name: family })
        .eq('id', data.user.id);
    }
  }
}

/**
 * Google needs a client ID and secret that only exist once someone creates them
 * in Google Cloud. Until then Supabase answers every attempt with
 * "provider is not enabled", so the button stays hidden rather than lying.
 * Set EXPO_PUBLIC_GOOGLE_SIGN_IN=1 in the same change that fills in the two
 * SUPABASE_AUTH_EXTERNAL_GOOGLE_* variables — see docs/AUTH.md.
 */
export const GOOGLE_SIGN_IN_ENABLED = process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN === '1';

const PROVIDER_LABEL = {
  google: 'Google',
  apple: 'Apple',
} as const;

/**
 * The browser round trip Google and Apple-on-the-web share. Apple on an
 * iPhone does not use this — that path is `signInWithApple`, which never
 * leaves the device.
 */
export async function signInWithProvider(provider: keyof typeof PROVIDER_LABEL) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) {
    if (/not enabled/i.test(error.message)) {
      throw new Error(`${PROVIDER_LABEL[provider]} sign-in is not set up yet. Use email instead.`);
    }
    throw error;
  }
  if (!data.url) throw new Error('Supabase did not return an OAuth URL.');
  // `skipBrowserRedirect` builds the URL locally, so "provider is not enabled"
  // only appears once the browser opens it. Ask first, or web shows raw JSON.
  await assertProviderReady(data.url, provider);

  // Google's login page severs window.opener, so a popup cannot hand the
  // session back to this tab. Web leaves and returns; the client reads the
  // session from the URL. Native keeps the system sheet.
  if (Platform.OS === 'web') {
    window.location.assign(data.url);
    return;
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'success') {
    await createSessionFromUrl(result.url);
  }
}

export function signInWithGoogle() {
  return signInWithProvider('google');
}

async function assertProviderReady(url: string, provider: keyof typeof PROVIDER_LABEL) {
  const response = await fetch(url, { redirect: 'manual' });
  if (response.status < 400) return;

  const body = (await response.json().catch(() => null)) as { msg?: string } | null;
  const message = body?.msg ?? '';
  if (/not enabled/i.test(message)) {
    throw new Error(`${PROVIDER_LABEL[provider]} sign-in is not set up yet. Use email instead.`);
  }
  throw new Error(message || `${PROVIDER_LABEL[provider]} sign-in failed.`);
}

export async function signOut(options?: { scope?: 'global' | 'local' | 'others' }) {
  const { error } = await supabase.auth.signOut(options);
  if (error) throw error;
}
