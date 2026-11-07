/**
 * How the nightly refresh reports notify-drops, and when that call fails the job.
 *
 * The catalogue write has already finished by the time this runs. A red job
 * means the drop call itself failed (missing function, bad secret, insert or
 * Expo error). Nobody to notify is not a failure: the function ran.
 */

export function explainTokenGap(followUserIds, tokenUserIds) {
  const follows = new Set(followUserIds.filter(Boolean));
  const tokens = new Set(tokenUserIds.filter(Boolean));
  let followersWithToken = 0;
  for (const id of follows) if (tokens.has(id)) followersWithToken += 1;
  let tokensWithoutFollow = 0;
  for (const id of tokens) if (!follows.has(id)) tokensWithoutFollow += 1;
  return {
    followers: follows.size,
    followersWithToken,
    tokensWithoutFollow,
  };
}

export function tokenGapLine(gap) {
  return (
    `Drop gap: ${gap.followers} follower account(s), ${gap.followersWithToken} of them have a push token, ` +
    `${gap.tokensWithoutFollow} push-token account(s) follow nobody. ` +
    'A push needs both on the same account, and a watch listed before the follow is not a drop.'
  );
}

function count(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function preview(body) {
  if (body == null || body === '') return '';
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return text.slice(0, 500);
}

function skipLine(skipped) {
  const noToken = count(skipped.noToken);
  const withListings = count(skipped.noTokenWithListings);
  const noTokenOnly = Math.max(0, noToken - withListings);
  return (
    `Skipped: ${withListings} follower(s) had new watches but no push token, ` +
    `${noTokenOnly} follower(s) had no token and nothing new, ` +
    `${count(skipped.alreadyToday)} already notified today, ` +
    `${count(skipped.nothingNew)} had a token but nothing new, ` +
    `${count(skipped.noApprovedFollow)} follow only unapproved shops.`
  );
}

/**
 * @param {number} status HTTP status, or 0 when the request never completed
 * @param {unknown} body parsed JSON, or a string when it was not JSON
 */
export function interpretDrops(status, body) {
  if (status < 200 || status >= 300) {
    const detail = preview(body);
    const lines = [
      `Drops failed (${status || 'no response'}). The catalogue refresh already finished; this job is red so the miss is visible.`,
    ];
    if (detail) lines.push(detail);
    if (status === 404) {
      lines.push('notify-drops is not deployed. The Deploy edge functions workflow has to succeed before this call can.');
    } else if (status === 401) {
      lines.push('The cron secret was rejected, or the gateway rejected the service-role JWT.');
    } else if (status === 503) {
      lines.push('GRAHAM_CRON_SECRET is not set on the hosted notify-drops function.');
    }
    return { fail: true, lines, needsGap: false };
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      fail: true,
      lines: ['Drops returned a response that was not a JSON object.', preview(body)].filter(Boolean),
      needsGap: false,
    };
  }

  if (typeof body.error === 'string' && body.error) {
    return { fail: true, lines: [`Drops failed: ${body.error}`], needsGap: false };
  }

  const users = count(body.users);
  const sent = count(body.sent);
  const failed = count(body.failed);
  const lines = [
    `Drops: ${sent} sent, ${failed} failed, ${users} selected, ${count(body.tokensRemoved)} dead token(s) removed, ${count(body.alreadyClaimed)} already claimed today.`,
  ];

  const hasSkips = body.skipped && typeof body.skipped === 'object';
  if (hasSkips) lines.push(skipLine(body.skipped));
  if (body.tokensOnFollowers != null || body.tokensOnOtherAccounts != null) {
    lines.push(
      `Push tokens: ${count(body.tokensOnFollowers)} follower account(s), ${count(body.tokensOnOtherAccounts)} account(s) that follow nobody.`
    );
  }
  if (Array.isArray(body.problems)) {
    for (const problem of body.problems) {
      if (typeof problem === 'string' && problem) lines.push(`Drop problem: ${problem}`);
    }
  }

  if (failed > 0) {
    lines.push('Drops reported a delivery or insert failure. The catalogue refresh already finished; this job is red.');
  }

  const withListings = hasSkips ? count(body.skipped.noTokenWithListings) : 0;
  const otherAccounts = count(body.tokensOnOtherAccounts);
  return {
    fail: failed > 0,
    lines,
    needsGap: !hasSkips && users === 0 && failed === 0,
    // A healthy send stays quiet. The warning is the prod miss: new watches
    // on an account with no phone, or a phone on an account that follows nobody.
    warn: withListings > 0 || (users === 0 && otherAccounts > 0),
  };
}
