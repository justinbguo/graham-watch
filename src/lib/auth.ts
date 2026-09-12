import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export const redirectTo = makeRedirectUri();

export async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return null;

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return data.session;
}

export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
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
  const name = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ');
  if (name) {
    await supabase.auth.updateUser({ data: { full_name: name } });
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase.from('profiles').update({ display_name: name }).eq('id', data.user.id);
    }
  }
}

/**
 * Google needs a client ID and secret that only exist once someone creates them
 * in Google Cloud. Until then Supabase answers every attempt with
 * "provider is not enabled", so the button stays hidden rather than lying.
 * Flip this on in the same change that enables [auth.external.google].
 */
export const GOOGLE_SIGN_IN_ENABLED = false;

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) {
    if (/not enabled/i.test(error.message)) {
      throw new Error('Google sign-in is not set up yet. Use an email code instead.');
    }
    throw error;
  }
  if (!data.url) throw new Error('Supabase did not return an OAuth URL.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'success') {
    await createSessionFromUrl(result.url);
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
