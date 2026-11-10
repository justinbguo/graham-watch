import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FEEDBACK_LABEL, FEEDBACK_URL } from '../src/features/feedback/contact.ts';

test('Feedback opens Justin on X', () => {
  assert.equal(FEEDBACK_LABEL, 'Feedback');
  assert.equal(
    FEEDBACK_URL,
    'https://x.com/messages/compose?recipient_id=1439387326677983236',
  );
});
