'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { Astro } = require('./_load');

test('sidereal time stays within a day and advances with the clock', () => {
  const t = Astro.d(1930, 1, 23);
  const a = Astro.lst(t, 21), b = Astro.lst(t, 23);
  assert.ok(a >= 0 && a < 24 && b >= 0 && b < 24);
  assert.ok(((b - a + 24) % 24) > 1.9 && ((b - a + 24) % 24) < 2.1, 'two hours of clock is about two hours of sidereal time');
});
test('Polaris stands at the latitude of Flagstaff, the south pole never rises', () => {
  const lst = Astro.lst(Astro.d(1930, 1, 23), 23);
  assert.ok(Math.abs(Astro.altitude(2.53, 89.26, lst) - 35.2) < 1.2);
  assert.ok(Astro.altitude(0, -90, lst) < -30);
});
test('a plate covers its own centre and not a field a quarter turn away', () => {
  assert.ok(Astro.covers(7.26, 22, 7.26, 22));
  assert.ok(!Astro.covers(7.26, 22, 13.26, 22));
});
test('the moon is new on 29 January 1930 and bright a fortnight later', () => {
  assert.ok(Astro.moonIllum(Astro.d(1930, 1, 29)) < 0.05);
  assert.ok(Astro.moonIllum(Astro.d(1930, 2, 13)) > 0.9);
});
test('seven planets, each on the sky', () => {
  const ps = Astro.planets(Astro.d(1930, 1, 23));
  assert.equal(ps.length, 7);
  ps.forEach(p => { assert.ok(p.ra >= 0 && p.ra < 24, p.name); assert.ok(Math.abs(p.dec) < 30, p.name); });
});
test('the forced-clear discovery nights are clear', () => {
  assert.ok(Astro.weather(Astro.d(1930, 1, 23), 23).ok);
  assert.ok(Astro.weather(Astro.d(1930, 1, 29), 23).ok);
});
