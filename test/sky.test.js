'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { Sky } = require('./_load');

test('the same field seed gives the same stars, in plate pixels, limit about 17th magnitude', () => {
  const spec = { seed: 'f7.3|22', density: 1 };
  const a = Sky.starField(spec), b = Sky.starField(spec);
  assert.equal(Array.from(a.slice(0, 30)).join(), Array.from(b.slice(0, 30)).join());
  assert.equal(a.length, 30000 * 3);
  let maxMag = 0; for (let i = 2; i < a.length; i += 3) { maxMag = Math.max(maxMag, a[i]); assert.ok(a[i - 2] >= 0 && a[i - 2] <= Sky.W); }
  assert.ok(maxMag <= 17.2 && maxMag > 16.5);
  assert.notEqual(Array.from(Sky.starField({ seed: 'other' }).slice(0, 6)).join(), Array.from(a.slice(0, 6)).join());
});
test('Pluto creeps a few millimetres in six nights', () => {
  const mm = Math.hypot(Sky.PLUTO.dRaDay * Math.cos(Sky.PLUTO.dec * Math.PI / 180), Sky.PLUTO.dDecDay) * 6 * 3600 / 123;
  assert.ok(mm > 2.5 && mm < 4.5, `${mm} mm`);
});
