import assert from 'node:assert/strict';
import test from 'node:test';

import { deckStage } from '../src/lib/layout.ts';
import { visibleHeight } from '../src/lib/visibleViewport.ts';

test('phone-width web stacks the card', () => {
  for (const width of [375, 390, 430, 480]) {
    assert.deepEqual(deckStage('web', width), { width: 'card', split: false });
  }
});

test('web wider than one card stays side by side', () => {
  assert.deepEqual(deckStage('web', 481), { width: 'cardWeb', split: true });
  assert.deepEqual(deckStage('web', 768), { width: 'cardWeb', split: true });
});

test('desktop web uses the framed side-by-side stage', () => {
  assert.deepEqual(deckStage('web', 900), { width: 'deckFrameWeb', split: true });
  assert.deepEqual(deckStage('web', 1280), { width: 'deckFrameWeb', split: true });
});

test('native stays a stacked card at every width', () => {
  assert.deepEqual(deckStage('ios', 390), { width: 'card', split: false });
  assert.deepEqual(deckStage('android', 1280), { width: 'card', split: false });
});

test('visible height follows the visual viewport when it is on screen', () => {
  assert.equal(visibleHeight(844, 700), 700);
  assert.equal(visibleHeight(844, 844), 844);
  assert.equal(visibleHeight(844, 900), 844);
  assert.equal(visibleHeight(844, null), 844);
  assert.equal(visibleHeight(844, undefined), 844);
  assert.equal(visibleHeight(844, 0), 844);
  assert.equal(visibleHeight(844, Number.NaN), 844);
});
