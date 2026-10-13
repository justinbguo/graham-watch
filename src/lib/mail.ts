import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

/** What the `inquiry-draft` function composes: a whole email, ready to send. */
export type MailDraft = { to: string; subject: string; body: string };

function query(pairs: Record<string, string>): string {
  return Object.entries(pairs)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * Gmail's own compose window, as a web address. `su` is Gmail's spelling of
 * subject; `view=cm` is compose and `fs=1` makes it a window of its own.
 *
 * On Android this also opens the Gmail app, which claims these links.
 */
function gmailWebUrl({ to, subject, body }: MailDraft): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&${query({ to, su: subject, body })}`;
}

/** The installed Gmail app's compose screen. iOS only: Android has no scheme. */
function gmailAppUrl({ to, subject, body }: MailDraft): string {
  return `googlegmail:///co?${query({ to, subject, body })}`;
}

function mailtoUrl({ to, subject, body }: MailDraft): string {
  // The address stays plain. Encoding the @ makes iOS Mail open a composer
  // with nobody in the To line, which looks like the button did nothing.
  return `mailto:${to}?${query({ subject, body })}`;
}

async function tryOpen(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hands the buyer a filled-in email to the dealer, in whatever writes mail here.
 *
 * `canOpenURL` is the wrong check: on iOS it says no for any scheme we did not
 * declare, including Gmail, on a phone that has Gmail. So each address is tried
 * in turn and the first one that opens wins.
 *
 * The in-app Gmail window is last on a phone, not first, even though it is the
 * one that always works: Safari inside an app has kept its own cookies since
 * iOS 11, so it asks the buyer to sign in to Google to reach a draft the Gmail
 * app already holds them signed in for. It is what makes the button work on a
 * simulator, which has neither Gmail nor Mail installed.
 */
export async function openMailDraft(draft: MailDraft): Promise<void> {
  if (Platform.OS === 'web') {
    // A window, not a navigation: `Linking.openURL` assigns `window.location`
    // on the web, so the composer would open by closing Graham.
    const composer = window.open(gmailWebUrl(draft), '_blank');
    if (composer) return;
    throw new Error('Your browser blocked the Gmail window. Allow pop-ups for Graham and try again.');
  }

  const app = Platform.OS === 'android' ? gmailWebUrl(draft) : gmailAppUrl(draft);
  if (await tryOpen(app)) return;
  if (await tryOpen(mailtoUrl(draft))) return;

  // Rejects only when the device has no browser either, which no phone is.
  await WebBrowser.openBrowserAsync(gmailWebUrl(draft), {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  });
}
