import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

import { keys } from './keys';

/**
 * The block a seller receives to ship a watch. Exactly these fields and nothing
 * else about the buyer. Keys match the jsonb the RPCs validate.
 */
export type ShipTo = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  phone: string;
};

export const EMPTY_SHIP_TO: ShipTo = {
  name: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postal_code: '',
  country: 'US',
  phone: '',
};

/** Stand-in until Stripe: the label a buyer sees for their saved method. */
export const TEST_PAYMENT_LABEL = 'Test card •••• 4242';

export type CheckoutDefaults = {
  shipTo: ShipTo | null;
  paymentLabel: string | null;
};

const REQUIRED: (keyof ShipTo)[] = ['name', 'line1', 'city', 'region', 'postal_code', 'country'];

export function shipToIsComplete(shipTo: ShipTo): boolean {
  return REQUIRED.every((key) => shipTo[key].trim().length > 0);
}

export function trimShipTo(shipTo: ShipTo): ShipTo {
  return {
    name: shipTo.name.trim(),
    line1: shipTo.line1.trim(),
    line2: shipTo.line2.trim(),
    city: shipTo.city.trim(),
    region: shipTo.region.trim(),
    postal_code: shipTo.postal_code.trim(),
    country: shipTo.country.trim().toUpperCase(),
    phone: shipTo.phone.trim(),
  };
}

export function formatShipTo(shipTo: ShipTo): string {
  const cityLine = [shipTo.city, shipTo.region].filter(Boolean).join(', ');
  return [
    shipTo.name,
    shipTo.line1,
    shipTo.line2,
    [cityLine, shipTo.postal_code].filter(Boolean).join(' '),
    shipTo.country,
  ]
    .filter(Boolean)
    .join('\n');
}

export function shipToFromJson(value: unknown): ShipTo | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const read = (key: keyof ShipTo) => (typeof row[key] === 'string' ? (row[key] as string) : '');
  const shipTo: ShipTo = {
    name: read('name'),
    line1: read('line1'),
    line2: read('line2'),
    city: read('city'),
    region: read('region'),
    postal_code: read('postal_code'),
    country: read('country') || 'US',
    phone: read('phone'),
  };
  return shipToIsComplete(shipTo) ? shipTo : null;
}

async function fetchCheckoutDefaults(userId: string): Promise<CheckoutDefaults> {
  if (isDemo) return { shipTo: null, paymentLabel: null };
  const { data, error } = await supabase
    .from('checkout_defaults')
    .select('ship_to, payment_label')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return {
    shipTo: shipToFromJson(data?.ship_to),
    paymentLabel: data?.payment_label ?? null,
  };
}

export function useCheckoutDefaults(userId: string | null) {
  return useQuery({
    queryKey: keys.checkoutDefaults(userId ?? 'anonymous'),
    queryFn: () => fetchCheckoutDefaults(userId!),
    enabled: Boolean(userId),
  });
}

export function useSaveCheckoutDefaults(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Partial<CheckoutDefaults>) => {
      if (!userId) throw new Error('Not signed in.');
      if (isDemo) throw new Error('Demo mode cannot save checkout details.');
      const current = queryClient.getQueryData<CheckoutDefaults>(keys.checkoutDefaults(userId));
      const next: CheckoutDefaults = {
        shipTo: input.shipTo !== undefined ? input.shipTo : (current?.shipTo ?? null),
        paymentLabel:
          input.paymentLabel !== undefined ? input.paymentLabel : (current?.paymentLabel ?? null),
      };
      const { error } = await supabase.from('checkout_defaults').upsert(
        {
          user_id: userId,
          ship_to: next.shipTo ? trimShipTo(next.shipTo) : null,
          payment_label: next.paymentLabel,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      if (!userId) return;
      queryClient.setQueryData(keys.checkoutDefaults(userId), next);
    },
  });
}
