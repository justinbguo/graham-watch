import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const design = readFileSync(new URL('../src/lib/design.ts', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function schemeBlock(source, name) {
  const start = source.indexOf(`\n  ${name}: {`);
  assert.notEqual(start, -1, `${name} palette`);
  const end = source.indexOf('\n  },', start);
  assert.notEqual(end, -1, `${name} palette close`);
  return source.slice(start, end);
}

function hexToken(block, name) {
  const match = block.match(new RegExp(`\\n\\s+${name}: '(#[0-9A-Fa-f]{6})'`));
  assert.ok(match, name);
  return match[1].toUpperCase();
}

function channel(hex, offset) {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

const dark = schemeBlock(design, 'dark');
const light = schemeBlock(design, 'light');
const page = hexToken(dark, 'background');
const money = hexToken(dark, 'money');
const moneyContrast = contrast(money, page);

test('the web shell paints the dark page before the bundle', () => {
  assert.match(html, new RegExp(`html\\s*,\\s*body\\s*\\{[^}]*background-color:\\s*${page}`, 'i'));
  assert.deepEqual(
    html.match(/#[0-9A-Fa-f]{3,8}/g)?.map((hex) => hex.toUpperCase()),
    [page],
  );
  assert.match(html, /%LANG_ISO_CODE%/);
  assert.match(html, /%WEB_TITLE%/);
  assert.match(html, /property="og:title" content="Graham"/);
  assert.match(html, /property="og:description" content="The best vintage watch dealers for a very passionate collector\."/);
  assert.match(html, /property="og:image" content="https:\/\/www\.graham\.watch\/og\.png"/);
  assert.match(html, /property="og:url" content="https:\/\/www\.graham\.watch"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:image" content="https:\/\/www\.graham\.watch\/og\.png"/);
  assert.match(html, /<\/head>/);
  assert.match(html, /<\/body>/);
  assert.match(html, /id="root"/);
});

test('light money stays put', () => {
  assert.equal(hexToken(light, 'money'), '#1A7344');
  assert.equal(hexToken(light, 'background'), '#FBF9F5');
});

test(`dark money on the page clears 4.5:1 (${moneyContrast.toFixed(2)}:1)`, () => {
  const [red, green, blue] = [1, 3, 5].map((offset) => parseInt(money.slice(offset, offset + 2), 16));
  assert.ok(green > red && green > blue, 'dark money stays green');
  assert.ok(moneyContrast >= 4.5, `${money} on ${page} is ${moneyContrast.toFixed(2)}:1`);
});
