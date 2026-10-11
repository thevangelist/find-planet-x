'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { Astro, Model } = require('./_load');

const DAY = Astro.DAY, T0 = Astro.d(1930, 1, 23);
const plate = (id, day, extra = {}) => ({ id, t: T0 + day * DAY, ra: 7.26, dec: 22, label: { ra: 7.26, dec: 22 }, developed: true, ruined: false, ...extra });
const state = (plates, extra = {}) => ({ t: T0 + 10 * DAY, plates, blinked: {}, suspects: [], log: [], cal: {}, ...extra });

test('pairs: two plates of one field 1 to 14 nights apart, one partner per plate', () => {
  const S = state([plate(1, 0), plate(2, 6), plate(3, 6.2), plate(4, 30)]);
  const prs = Model.pairs(S);
  assert.equal(prs.map(p => p.key).join(' '), '1-2', 'plate 3 is the same night as plate 2, plate 4 is too late for anyone');
  assert.equal(prs[0].days, 6);
  assert.ok(prs[0].third, 'a third plate of the field exists');
});
test('pairs: nothing pairs across fields, the same night, or after two weeks', () => {
  assert.equal(Model.pairs(state([plate(1, 0), plate(2, 0.3)])).length, 0);
  assert.equal(Model.pairs(state([plate(1, 0), plate(2, 15)])).length, 0);
  assert.equal(Model.pairs(state([plate(1, 0), plate(2, 5, { label: { ra: 13, dec: 22 } })])).length, 0);
  assert.equal(Model.pairs(state([plate(1, 0), plate(2, 5, { developed: false })])).length, 0);
});
test('pairOf takes any two plates, in time order, and flags a mislabelled pointing', () => {
  const a = plate(1, 0), b = plate(2, 20, { ra: 9, dec: 22 });
  const pr = Model.pairOf(state([a, b]), b, a);
  assert.equal(pr.key, '1-2'); assert.equal(pr.days, 20); assert.ok(pr.mismatch);
});
test('order slips with unlabelled plates and open suspects', () => {
  assert.equal(Model.order(state([plate(1, 0)])).label, 'good order');
  const bad = state([plate(1, 0, { label: null }), plate(2, 1, { label: null }), plate(3, 2, { label: null })], { suspects: [{ pair: 'x' }, { pair: 'y' }, { pair: 'z' }], lastNote: T0 - 30 * DAY });
  assert.equal(Model.order(bad).label, 'chaos');
});
test('fieldSteps walks a field from the first plate to a settled check', () => {
  const S = state([plate(1, 0)]);
  let fs = Model.fieldSteps(S); assert.equal(fs.steps.filter(s => s[2]).length, 1);
  S.plates.push(plate(2, 6)); fs = Model.fieldSteps(S); assert.equal(fs.steps.filter(s => s[2]).length, 2);
  S.blinked['1-2'] = S.t; S.suspects.push({ pair: '1-2', verdict: null });
  fs = Model.fieldSteps(S); assert.equal(fs.steps[2][2], true); assert.equal(fs.steps[3][1], 'expose it');
  S.plates.push(plate(3, 9)); fs = Model.fieldSteps(S); assert.equal(fs.steps[3][2], true); assert.equal(fs.steps[4][2], false);
  S.suspects[0].verdict = 'asteroid'; fs = Model.fieldSteps(S);
  assert.equal(fs.pair.key, '2-3', 'once a pair is settled the tracker moves to the next unblinked pair of the field');
  assert.equal(fs.steps[2][2], false);
  assert.equal(Model.fieldSteps(state([])), null);
});
test('plateNeed names the next exposure', () => {
  assert.equal(Model.plateNeed(state([plate(1, 9.8)]), plate(1, 9.8)).text, 'second plate: another night');
  const lone = state([plate(1, 0)]); assert.equal(Model.plateNeed(lone, lone.plates[0]).shoot, 'Expose the second plate');
  const old = state([plate(1, -20)]); assert.equal(Model.plateNeed(old, old.plates[0]).shoot, 'Expose again');
  const S = state([plate(1, 0), plate(2, 6)]); assert.equal(Model.plateNeed(S, S.plates[0]).text, 'pair ready: blink it');
  S.blinked['1-2'] = 1; S.suspects.push({ pair: '1-2' }); assert.equal(Model.plateNeed(S, S.plates[1]).shoot, 'Expose the third plate');
  S.plates.push(plate(3, 8)); assert.equal(Model.plateNeed(S, S.plates[0]), null);
});
test('the notebook keeps four lines for the writing box on the last page', () => {
  const S = state([], { log: Array.from({ length: 9 }, (_, i) => ({ d: `${23 + i} January 1930, 12:00`, text: 'x'.repeat(10) })) });
  const pages = Model.notebookPages(S);
  assert.equal(pages.length, 2); assert.equal(pages[1].length, 0);
  assert.equal(Model.notebookPages(state([])).length, 1);
});
test('a note with a position becomes a pin', () => {
  const pins = Model.notePins(state([], { log: [{ d: 'x', text: 'try 7h 20m +22 again' }, { d: 'y', text: 'nothing' }], cal: { '1930-02-01': '3h 08m −15° again' } }));
  assert.equal(pins.length, 2);
  assert.ok(Math.abs(pins[0].ra - 7.333) < 0.01 && pins[0].dec === 22);
  assert.equal(pins[1].dec, -15);
});
test('migrate repairs an old or damaged save and rejects garbage', () => {
  assert.equal(Model.migrate(null), null); assert.equal(Model.migrate('x'), null); assert.equal(Model.migrate({ plates: 3 }), null);
  const S = Model.migrate({ t: T0, plates: [plate(4, 0), null, { id: 'x' }], energy: 7 });
  assert.equal(S.plates.length, 1); assert.equal(S.nextId, 5); assert.equal(S.energy, 1); assert.equal(S.loc, 'room');
  assert.equal(JSON.stringify(S.suspects), '[]'); assert.equal(JSON.stringify(S.blinked), '{}'); assert.equal(S.v, Model.SAVE_VERSION);
});
