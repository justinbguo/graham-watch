import { isPublicHttpUrl, normalizeDomain } from '../import-listings/discover.ts';

import { configuredSecret, offeredSecret, secretMatches } from './auth.ts';

export class OperatorError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OperatorError';
    this.status = status;
  }
}

export class FixtureImportOff extends OperatorError {
  constructor() {
    super(
      'Fixture import is off. It runs only on a local stack with GRAHAM_ALLOW_FIXTURE_IMPORT=1, and never against the hosted project.',
      404,
    );
    this.name = 'FixtureImportOff';
  }
}

export type FixtureWatch = {
  brand: string;
  model: string | null;
  reference: string | null;
  year: number | null;
  priceCents: number | null;
  description: string | null;
  sourceUrl: string;
  photoUrl: string | null;
};

export type AuditRow = {
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
};

export type OperatorDeps = {
  env: { get(name: string): string | undefined };
  discover(domain: string): Promise<unknown>;
  inspect(sourceUrl: string): Promise<unknown>;
  importCatalog(input: { sourceUrl: string; dealerName?: string; dealerEmail?: string }): Promise<unknown>;
  importFixture(input: { sourceUrl: string; dealerName?: string; listings: FixtureWatch[] }): Promise<unknown>;
  setPermission(dealerId: string, permission: 'approved' | 'pending'): Promise<unknown>;
  report(dealerId: string): Promise<unknown>;
  audit(row: AuditRow): Promise<void>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function publicUrl(raw: unknown, label: string): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text || !isPublicHttpUrl(text)) {
    throw new OperatorError(`${label} is not a public http URL.`, 400);
  }
  return new URL(text).toString();
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function dealerIdOf(body: Record<string, unknown>): string {
  const dealerId = typeof body.dealerId === 'string' ? body.dealerId.trim() : '';
  if (!UUID.test(dealerId)) throw new OperatorError('That dealer id is not a UUID.', 400);
  return dealerId;
}

function dealerIdFrom(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const dealerId = (result as { dealerId?: unknown }).dealerId;
  return typeof dealerId === 'string' ? dealerId : null;
}

function fixtureListings(body: Record<string, unknown>): FixtureWatch[] {
  const raw = body.listings;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 5) {
    throw new OperatorError('fixture import needs 1 to 5 listings.', 400);
  }
  return raw.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new OperatorError('A fixture listing must be an object.', 400);
    }
    const row = item as Record<string, unknown>;
    const brand = typeof row.brand === 'string' ? row.brand.trim() : '';
    if (!brand) throw new OperatorError('A fixture listing needs a brand.', 400);
    return {
      brand,
      model: optionalText(row.model) ?? null,
      reference: optionalText(row.reference) ?? null,
      year: typeof row.year === 'number' ? row.year : null,
      priceCents: typeof row.price_cents === 'number' ? row.price_cents : null,
      description: optionalText(row.description) ?? null,
      sourceUrl: publicUrl(row.source_url ?? row.sourceUrl, 'A fixture source URL'),
      photoUrl: row.photo_url || row.photoUrl
        ? publicUrl(row.photo_url ?? row.photoUrl, 'A fixture photo URL')
        : null,
    };
  });
}

async function run(effect: () => Promise<unknown>, audit: (result: unknown) => Promise<void>) {
  try {
    const result = await effect();
    await audit(result);
    return Response.json(result ?? {});
  } catch (error) {
    if (error instanceof OperatorError) return jsonError(error.message, error.status);
    const message = error instanceof Error ? error.message : 'Operator request failed.';
    return jsonError(message, 500);
  }
}

export async function handleOperatorRequest(req: Request, deps: OperatorDeps): Promise<Response> {
  if (req.method !== 'POST') return jsonError('POST only.', 405);

  const expected = configuredSecret(deps.env);
  if (!expected) return jsonError('Operator access is not configured.', 503);

  const offered = offeredSecret(req);
  if (!(await secretMatches(offered, expected))) return jsonError('Not authorized.', 401);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonError('Bad request.', 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonError('Bad request.', 400);
  }

  const action = typeof body.action === 'string' ? body.action : '';

  try {
    if (action === 'discover') {
      const domain = typeof body.domain === 'string' ? body.domain.trim() : '';
      if (!domain) return jsonError('discover needs a domain.', 400);
      let origin: string;
      try {
        origin = normalizeDomain(domain);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'That is not a domain.';
        return jsonError(message, 400);
      }
      return await run(
        () => deps.discover(origin),
        () => deps.audit({
          action: 'discover_shop',
          targetType: 'shop',
          targetId: null,
          before: null,
          after: { domain: origin },
        }),
      );
    }

    if (action === 'inspect' || action === 'preview') {
      const sourceUrl = publicUrl(body.sourceUrl, 'sourceUrl');
      return await run(
        () => deps.inspect(sourceUrl),
        () => deps.audit({
          action: 'inspect_shop',
          targetType: 'shop',
          targetId: null,
          before: null,
          after: { sourceUrl },
        }),
      );
    }

    if (action === 'import') {
      const sourceUrl = publicUrl(body.sourceUrl, 'sourceUrl');
      const dealerName = optionalText(body.dealerName);
      const dealerEmail = optionalText(body.dealerEmail);
      if (body.listings !== undefined) {
        const listings = fixtureListings(body);
        return await run(
          () => deps.importFixture({ sourceUrl, dealerName, listings }),
          (result) => deps.audit({
            action: 'import_shop',
            targetType: 'shop',
            targetId: dealerIdFrom(result),
            before: null,
            after: { sourceUrl, fixture: true, listings: listings.length },
          }),
        );
      }
      return await run(
        () => deps.importCatalog({ sourceUrl, dealerName, dealerEmail }),
        (result) => deps.audit({
          action: 'import_shop',
          targetType: 'shop',
          targetId: dealerIdFrom(result),
          before: null,
          after: { sourceUrl, fixture: false },
        }),
      );
    }

    if (action === 'approve' || action === 'unapprove') {
      const dealerId = dealerIdOf(body);
      const permission = action === 'approve' ? 'approved' : 'pending';
      try {
        const result = await deps.setPermission(dealerId, permission);
        return Response.json(result ?? {});
      } catch (error) {
        if (error instanceof OperatorError) return jsonError(error.message, error.status);
        const message = error instanceof Error ? error.message : 'Operator request failed.';
        return jsonError(message, 500);
      }
    }

    if (action === 'report') {
      const dealerId = dealerIdOf(body);
      return await run(
        () => deps.report(dealerId),
        () => deps.audit({
          action: 'read_shop',
          targetType: 'shop',
          targetId: dealerId,
          before: null,
          after: { dealerId },
        }),
      );
    }

    return jsonError(action ? `Unknown action "${action}".` : 'An action is required.', 400);
  } catch (error) {
    if (error instanceof OperatorError) return jsonError(error.message, error.status);
    const message = error instanceof Error ? error.message : 'Operator request failed.';
    return jsonError(message, 500);
  }
}
