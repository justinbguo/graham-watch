import { useEffect, useRef } from 'react';

import { identify, track } from '@/lib/analytics';
import { useSession } from '@/providers/session';

/** One app-open per cold start, and the signed-in id once a session exists. */
export function Telemetry() {
  const { userId } = useSession();
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    track('app_open');
  }, []);

  useEffect(() => {
    if (userId) identify(userId);
  }, [userId]);

  return null;
}
