'use strict';
// The programme as data: plates, pairs, what each field still needs, the order of the work, the notebook's
// pages, and the shape of a saved game. Pure functions over a state object, no DOM, so they run in tests.
const Model = (() => {
  const SAME_FIELD = 4;            // degrees: two labels this close are one field
  const PAIR_MIN = 1, PAIR_MAX = 14;   // nights between the plates of a pair
  const PAGE_LINES = 19, LINE_CHARS = 34, SKETCH_LINES = 8, WRITE_LINES = 4;
  const SAVE_VERSION = 4;

  const nights = (a, b) => Math.round((b - a) / Astro.DAY);
  const usable = S => S.plates.filter(p => p.developed && !p.ruined && p.label);
  const sameLabel = (p, q) => Astro.sep(p.label.ra, p.label.dec, q.label.ra, q.label.dec) <= SAME_FIELD;
  const samePointing = (p, q) => Astro.sep(p.ra, p.dec, q.ra, q.dec) <= SAME_FIELD;

  const plateName = p => p.label
    ? `${Astro.fieldStr(p.label.ra, p.label.dec)} · ${Astro.nearestRegion(p.label.ra, p.label.dec).name}`
    : 'unlabelled plate';
  const pairName = pr => plateName(pr.a);

  // any two usable plates of one field, in time order; the caller decides whether the interval is sensible
  function pairOf(S, a, b) {
    if (a.t > b.t) [a, b] = [b, a];
    const third = usable(S).some(p => p !== a && p !== b && sameLabel(p, a) && samePointing(p, a));
    return { key: `${a.id}-${b.id}`, a, b, days: nights(a.t, b.t), third, mismatch: !samePointing(a, b) };
  }
  // the automatic pairs: each plate takes the next usable plate of its field, 1 to 14 nights on
  function pairs(S) {
    const ps = usable(S).sort((a, b) => a.t - b.t), out = [];
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j], days = nights(a.t, b.t);
        if (days > PAIR_MAX) break;
        if (days < PAIR_MIN || !sameLabel(a, b)) continue;
        if (out.some(o => o.a === a)) break;
        out.push(pairOf(S, a, b));
      }
    }
    return out;
  }
  const undeveloped = S => S.plates.filter(p => !p.developed && !p.ruined);
  const unblinked = S => pairs(S).filter(p => !S.blinked[p.key] && !p.mismatch);
  const unlabelled = S => S.plates.filter(p => !p.label && !p.ruined);
  const openSuspects = (S, key) => S.suspects.filter(s => (!key || s.pair === key) && !s.verdict);

  // labelled plates without a partner whose window (1 to 14 nights) is open tonight
  function needsSecond(S) {
    const prs = pairs(S);
    return S.plates.filter(p => p.label && !p.ruined && !prs.some(x => x.a === p || x.b === p))
      .map(p => ({ p, days: nights(p.t, S.t) })).filter(x => x.days >= PAIR_MIN && x.days <= PAIR_MAX)
      .sort((a, b) => b.days - a.days);
  }
  const sameField = (S, ra, dec) => S.plates
    .filter(p => p.label && !p.ruined && Astro.sep(p.label.ra, p.label.dec, ra, dec) <= SAME_FIELD)
    .sort((a, b) => a.t - b.t)[0];

  // Order of the programme: unlabelled plates, a backlog of pairs, open suspects and a silent notebook pull it down
  function order(S) {
    const unl = unlabelled(S).length, backlog = unblinked(S).length, open = openSuspects(S).length;
    const silent = (S.t - (S.lastNote ?? S.t)) / Astro.DAY;
    const score = clamp(1 - 0.12 * unl - 0.04 * Math.max(0, backlog - 4) - 0.06 * open - (silent > 14 ? 0.2 : 0), 0, 1);
    return { score, unl, backlog, open, silent, label: score > .7 ? 'good order' : score > .35 ? 'slipping' : 'chaos' };
  }

  // the field the player is working on: the pair with open suspects, else the newest unblinked pair, else the newest plate
  function fieldSteps(S) {
    const prs = pairs(S), live = S.plates.filter(p => !p.ruined && p.label);
    const pr = prs.find(x => S.blinked[x.key] && openSuspects(S, x.key).length)
      || prs.filter(x => !S.blinked[x.key]).sort((a, b) => b.b.t - a.b.t)[0];
    const p = pr ? pr.a : live.sort((a, b) => b.t - a.t)[0];
    if (!p) return null;
    const blinked = !!(pr && S.blinked[pr.key]);
    const open = pr ? openSuspects(S, pr.key).length : 0;
    const judged = pr ? S.suspects.filter(s => s.pair === pr.key && s.verdict).length : 0;
    const n = nights(pr ? pr.b.t : p.t, S.t);
    return { name: Astro.nearestRegion(p.label.ra, p.label.dec).name, pair: pr, steps: [
      ['1st plate', `No. ${p.id}`, true],
      ['2nd plate', pr ? `No. ${pr.b.id}, ${pr.days} nights later` : n < PAIR_MIN ? 'another night' : n > PAIR_MAX ? 'too late, start over' : 'same field, tonight', !!pr],
      ['Blink', blinked ? `${judged + open} marked` : pr ? 'at the comparator' : '', blinked],
      ['3rd plate', pr && pr.third ? 'ready' : blinked && open ? 'expose it' : '', !!(pr && pr.third)],
      ['Check', blinked ? (open ? `${open} open` : judged ? 'settled' : 'nothing marked') : '', blinked && !open && judged > 0],
    ] };
  }

  // what a plate's field still needs, with the label of the exposure that would supply it
  function plateNeed(S, p) {
    if (p.ruined || !p.label) return null;
    const pr = pairs(S).find(x => x.a === p || x.b === p), n = nights(p.t, S.t);
    if (!pr) {
      if (!p.developed) return null;
      if (n < PAIR_MIN) return { text: 'second plate: another night' };
      if (n > PAIR_MAX) return { text: `${n} nights ago, too old for a pair. Start the field again.`, shoot: 'Expose again' };
      const left = PAIR_MAX - n;
      return { text: `needs a second plate (${left} night${left === 1 ? '' : 's'} left)`, shoot: 'Expose the second plate' };
    }
    if (!S.blinked[pr.key]) return { text: 'pair ready: blink it' };
    const open = openSuspects(S, pr.key).length;
    if (open && !pr.third) return { text: `${open} suspect${open > 1 ? 's' : ''} open: needs a third plate`, shoot: 'Expose the third plate' };
    return null;
  }

  // the notebook: plates and notes in time order, cut into fixed pages, the writing box always fitting on the last
  const lineCount = txt => (txt || '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / LINE_CHARS)), 0);
  function notebookPages(S) {
    const entries = [];
    S.plates.filter(p => !p.ruined || p.label).forEach(p => entries.push({
      t: p.t + 1, kind: 'plate',
      d: `No. ${p.id} · ${Astro.fmtShort(p.t)} ${new Date(p.t).getUTCFullYear()}${p.slipher ? ' · V. M. S.' : ''}`,
      text: `${p.label ? Astro.fieldStr(p.label.ra, p.label.dec) : 'no label'} · 60 min · ${p.haze ? 'thin cloud' : 'clear'}${p.wind ? ', wind' : ''}${p.developed ? ' · dev.' : ''}${p.ruined ? ' · lost' : ''}`,
    }));
    S.log.forEach((e, i) => entries.push({ t: Date.parse(e.d.split(',')[0]) || 0, i, kind: e.sketch ? 'sketch' : 'note', d: e.d, text: e.text, src: e }));
    entries.sort((a, b) => a.t - b.t || (a.i ?? 0) - (b.i ?? 0));
    const pages = [[]]; let used = 0;
    entries.forEach(e => {
      const n = e.kind === 'sketch' ? 1 + SKETCH_LINES : 1 + lineCount(e.text);
      if (used + n > PAGE_LINES && pages[pages.length - 1].length) { pages.push([]); used = 0; }
      pages[pages.length - 1].push(e); used += n;
    });
    if (used > PAGE_LINES - WRITE_LINES) pages.push([]);
    return pages;
  }

  // notes and plans that carry a position, e.g. "7h 20m +22 again", become pins on the sky
  function notePins(S) {
    const re = /(\d{1,2})h\s*(\d{1,2})m?\s*([+\-−]\s?\d{1,2}(?:\.\d)?)°?/, out = [];
    const pin = (text, label) => { const m = text && text.match(re); if (!m) return;
      out.push({ ra: (+m[1] + m[2] / 60) % 24, dec: parseFloat(m[3].replace('−', '-').replace(/\s/, '')), text: label }); };
    (S.log || []).forEach(e => pin(e.text, (e.text || '').slice(0, 40)));
    Object.entries(S.cal || {}).forEach(([k, v]) => pin(v, `${k.slice(5)}: ${v.slice(0, 36)}`));
    return out.filter(p => !isNaN(p.dec));
  }

  // A saved game from any earlier version, or a damaged one, comes back whole or not at all.
  function migrate(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.t !== 'number' || !Array.isArray(raw.plates)) return null;
    const S = { ...raw };
    const arr = k => { if (!Array.isArray(S[k])) S[k] = []; }, obj = k => { if (!S[k] || typeof S[k] !== 'object') S[k] = {}; };
    ['log', 'suspects', 'found_ids', 'seenPlates'].forEach(arr); ['blinked', 'cal', 'pairNotes'].forEach(obj);
    S.plates = S.plates.filter(p => p && typeof p.id === 'number' && typeof p.t === 'number');
    S.nextId = Math.max(S.nextId || 1, ...S.plates.map(p => p.id + 1));
    S.clock ??= 450; S.loc ??= 'room'; S.energy ??= 1; S.focus ??= 1; S.sessions ??= 0; S.found ??= false; S.done ??= false;
    S.energy = clamp(S.energy, 0, 1); S.focus = clamp(S.focus, 0, 1);
    if (!['room', 'dome', 'comparator', 'darkroom', 'logbook', 'calendar', 'plates', 'status', 'observatory'].includes(S.loc)) S.loc = 'room';
    S.v = SAVE_VERSION;
    return S;
  }

  return { SAME_FIELD, PAIR_MIN, PAIR_MAX, PAGE_LINES, SKETCH_LINES, SAVE_VERSION, nights, plateName, pairName, pairOf, pairs,
    undeveloped, unblinked, unlabelled, openSuspects, needsSecond, sameField, order, fieldSteps, plateNeed, lineCount, notebookPages, notePins, migrate };
})();
