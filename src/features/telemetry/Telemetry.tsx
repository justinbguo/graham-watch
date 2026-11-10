import { useEffect, useRef } from 'react';

import { setEventUser } from '@/data/listingEvents';
import { identify, track } from '@/lib/analytics';
import { useSession } from '@/providers/session';

/**
 * One app-open per cold start, and the signed-in id once a session exists.
 * The buyer event log hears the id, or its absence, once the session has
 * loaded, so it can tell a guest from a session that has not arrived yet.
 */
export function Telemetry() {
  const { userId, isLoading } = useSession();
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    track('app_open');
  }, []);

  useEffect(() => {
    if (userId) identify(userId);
  }, [userId]);

  useEffect(() => {
    if (!isLoading) setEventUser(userId);
  }, [isLoading, userId]);

  return null;
}
