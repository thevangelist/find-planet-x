'use strict';
// Scene flow, day loop, plates and save state.
const Game = (() => {
  const SAVE = 'tombaugh-save-v3';
  const START = Astro.d(1929, 4, 6);           // first plates of the real search programme
  const PHASE_START = { morning: 450, afternoon: 820, evening: 1155, night: 1390 };   // minutes since midnight
  const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const clockSvg = m => { const a = (m / 60 % 12) / 12 * 2 * Math.PI, x = 11 + 7.5 * Math.sin(a), y = 11 - 7.5 * Math.cos(a);
    return `<svg class="clock" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10"/><circle cx="11" cy="2.2" r="1" class="dot"/><line x1="11" y1="11" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/></svg>`; };
  // Time passes while you stand there: about 3.6 game minutes per real second, so ten real minutes are
  // a day and a half of the programme. Timed work (exposure, blinking, developing) counts its own minutes.
  let live = true, liveN = 0;
  setInterval(() => { if (!S || !live || S.done || $('#hud').classList.contains('hidden')) return;
    const wasDark = isDark(); tick(3.6); if (++liveN % 10 === 0) save();
    if (isDark() !== wasDark && ['room', 'comparator', 'darkroom', 'status'].includes(S.loc)) goTo(S.loc); }, 1000);
  const tick = min => { S.clock = Math.min(S.clock + Math.round(min), 1740); if (S.coffeeAt != null && S.clock - S.coffeeAt > 90) { S.coffeeAt = null; S.focus = clamp(S.focus - 0.15, 0, 1); toast('The coffee wears off.', 1800); } if (!$('#hud').classList.contains('hidden')) $('#hud-date').innerHTML = `${clockSvg(S.clock)} ${Astro.fmt(S.t)}  –  ${hhmm(S.clock)}`; };
  
  let S = null;

  // two plates Slipher exposed in March, developed and labelled: a pair to blink on the first day
  const SLIPHER = () => [{ id: 1, ra: 8.7, dec: 19, label: { ra: 8.7, dec: 19 }, t: Astro.d(1929, 3, 28), ruined: false, developed: true, slipher: true },
    { id: 2, ra: 8.7, dec: 19, label: { ra: 8.7, dec: 19 }, t: Astro.d(1929, 4, 2), ruined: false, developed: true, slipher: true }];
  const fresh = () => ({ t: START, phase: 'morning', focus: 1, plates: SLIPHER(), blinked: {}, suspects: [], log: [], found: false, foundDate: null, nextId: 1, sessions: 0, done: false, found_ids: [], hour: 23, clock: 1155, loc: 'dome', energy: 1, nextId: 3 });
  // the world is washed out; each real find brings a little colour back, too slowly to notice
  const tone = () => { if (!S) return; const sat = Math.min(1, 0.84 + 0.025 * (S.found_ids || []).length + (S.found ? 0.1 : 0)); document.documentElement.style.setProperty('--sat', sat.toFixed(3)); };
  const save = () => { tone(); try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) {} };
  const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)); } catch (e) { return null; } };

  const scene = () => $('#scene');
  function hud(place, region = '', extra = '') {
    $('#hud').classList.remove('hidden');
    $('#hud-date').innerHTML = `${clockSvg(S.clock)} ${Astro.fmt(S.t)}  –  ${hhmm(S.clock)}`;
    $('#hud-place').textContent = place; $('#hud-region').textContent = region; $('#hud-extra').textContent = extra;
    $('#hud-focus').textContent = `${S.energy > .66 ? 'fresh' : S.energy > .33 ? 'tired' : 'exhausted'} · concentration ${S.focus > .66 ? 'good' : S.focus > .33 ? 'fair' : 'poor'}`;
  }
  // Fatigue. A night of exposures in the cold and a few hours at the comparator was a full day for Tombaugh;
  // he limited blinking to a few hours and slept late after dome nights. Hit zero and he falls asleep where he is.
  function spend(e, where) { S.energy = clamp(S.energy - e, 0, 1); if (S.energy <= 0.05) { collapse(where); return true; } return false; }
  function collapse(where) {
    const late = S.clock >= 1440;
    chronicle(where === 'dome' ? 'Fell asleep at the eyepiece. Woke stiff and frozen; the plate is fogged.' : where === 'comparator' ? 'Fell asleep over the comparator. The lamp was still on in the morning.' : 'Fell asleep in the chair with my boots on.');
    Dome3D.unmount(); Audio_.stopAll(2);
    panelScene('rest.jpg', 'Mars Hill', [where === 'dome' ? 'The cold does the rest. He wakes at the eyepiece with the slit open and grey in the east.' : 'His head goes down on the desk. The clock in the corridor keeps on.', 'The next morning starts late and badly.'],
      [{ label: 'Wake up', primary: true, fn: () => { S.t += Astro.DAY; S.clock = 600; S.energy = 0.55; S.focus = 0.4; save(); goTo('observatory'); } }], { task: 'Exhausted. He sleeps where he sits.' });
  }
  const hideHud = () => { $('#hud').classList.add('hidden'); $('#hud-nav').classList.add('hidden'); $('#flow').classList.add('hidden'); $('#flow').classList.add('hidden'); };
  const regionOf = id => Astro.REGIONS.find(r => r.id === id);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const chronicle = text => toast(text, 3500);
  const addLog = text => { S.log.push({ d: `${Astro.fmt(S.t)}, ${hhmm(S.clock)}`, text }); if (S.log.length > 400) S.log.shift(); };

  // ---------- generic slide player ----------
  const imgOk = {};
  async function firstImage(list) {
    for (const name of list) {
      if (!name) continue;
      if (imgOk[name] === undefined) imgOk[name] = await new Promise(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = `assets/img/${name}`; });
      if (imgOk[name]) return name;
    }
    return null;
  }
  async function slides(list, { hudOff = true, skip = null } = {}) {
    if (hudOff) hideHud();
    let skipped = false;
    for (let si = 0; si < list.length && !skipped; si++) {
      const sl = list[si];
      const root = scene(); root.innerHTML = '';
      const pic = el('div', 'picture slow-fade' + (sl.fit === 'contain' ? ' contain' : sl.dark || !sl.img ? ' dim' : ' ken'));
      if (skip) { const sb = el('button', 'primary', skip); sb.id = 'skip-intro'; sb.onclick = () => { skipped = true; skipResolve && skipResolve('skip'); }; root.appendChild(sb); }
      const imgs = Array.isArray(sl.img) ? sl.img : [sl.img];
      const img = await firstImage(imgs);
      if (img) pic.style.backgroundImage = `url(assets/img/${img})`; else pic.style.background = '#050506';
      if (sl.gray) pic.style.filter = 'grayscale(1) brightness(.6) contrast(1.1)';
      root.appendChild(pic);
      const cap = el('div', 'caption'); root.appendChild(cap);
      (sl.audio || []).forEach((a, i) => setTimeout(() => Audio_.play(a, 0.5, a === 'wood_floor_creak' ? 3 : 1), 400 + i * 1800));
      if (sl.loop) Audio_.loop(sl.loop, 0.3, 3);
      const ps = sl.lines.map(l => { const p = el('p', typeof l === 'object' ? 'quote' : ''); p.textContent = typeof l === 'object' ? l.q : l; cap.appendChild(p); return p; });
      const hint = el('p', 'hint', 'Space continues. Left arrow goes back.'); cap.appendChild(hint);
      let i = 0, back = false;
      const reveal = () => { if (i < ps.length) ps[i++].classList.add('on'); if (i === ps.length) hint.classList.add('on'); };
      reveal();
      const skipP = new Promise(r => { skipResolve = r; });
      while (i < ps.length) { const r = await Promise.race([nextInput(), wait(3400).then(() => 'auto'), skipP]); if (r === 'skip') break; if (r === 'ArrowLeft') { back = true; break; } reveal(); }
      if (!back && !skipped) back = (await Promise.race([nextInput(), skipP])) === 'ArrowLeft';
      if (sl.loop) Audio_.stop(sl.loop, 2);
      if (back) si = Math.max(-1, si - 2);
    }
    return skipped;
  }
  let skipResolve = null;

  // ---------- title ----------
  function title() {
    hideHud(); Audio_.stopAll(2);
    const root = scene(); root.innerHTML = '';
    const has = load();
    const t = el('div', 'fade', `<div id="title"><div class="portrait"></div><div class="side">
      <h1>Planet X</h1><h2>Mars Hill · 1929 · Ad Astra per Aspera</h2>
      <p class="brief">In 1929 Lowell Observatory hired Clyde Tombaugh, a Kansas farm boy, to photograph the ecliptic and compare the plates in pairs, looking for one faint point that moves.
        Expose on clear, moonless nights. Label every sleeve by hand. Develop, blink, check against a third plate. Write down what you find.
        Nothing is remembered that is not written. It took him ten months.</p>
      <div class="menu">
        ${has && !has.done ? `<button id="b-cont" class="primary">Continue<small>${Astro.fmt(has.t)}, ${has.plates.length} plates</small></button><button id="b-new">Begin again</button>` : `<button id="b-new" class="primary">Begin<small>January 1929. The train arrives at Flagstaff.</small></button>`}
      </div>

      <p class="meta">${location.protocol === 'file:' ? 'Audio needs an http server: ./serve.sh' : ''}</p>
    </div></div>`);
    root.appendChild(t);
    $('#b-new').onclick = () => { Audio_.init(); if (has && !has.done && !confirm('Start over? The saved game will be lost.')) return; S = fresh(); intro(); };
    const bc = $('#b-cont'); if (bc) bc.onclick = () => { Audio_.init(); S = has; S.found_ids ??= []; S.clock ??= 450; S.loc ??= 'room'; S.energy ??= 1; Audio_.preload(['amb_dome', 'coffee_pour', 'liquid_pour', 'water_slosh']); day(); };
  }
  async function credits() {
    const root = scene(); root.innerHTML = '';
    let md = ''; try { md = await (await fetch('CREDITS.md')).text(); } catch (e) {}
    const sections = []; let cur = null;
    md.split('\n').forEach(line => {
      const h = line.match(/^## (.+)/); if (h) { cur = { title: h[1], items: [] }; sections.push(cur); return; }
      const it = line.match(/^- ([^–]+?) – (.+?)(?: – (https?:\S+.*))?$/); if (it && cur) { const urls = (it[3] || '').split(/\s*,\s*/).filter(u => u.startsWith('http')); cur.items.push({ name: it[1].trim(), what: it[2].trim(), urls }); }
    });
    const fixed = [
      { title: 'Game', items: [{ name: 'Design and code', what: 'Esa Lahikainen with Claude', urls: [] }, { name: 'Typeface', what: 'IBM Plex Sans, Open Font Licence', urls: ['https://github.com/IBM/plex'] }, { name: '3D', what: 'three.js r128, MIT', urls: ['https://threejs.org'] }] },
      { title: 'Scene images', items: [{ name: 'Illustrations', what: 'generated with Midjourney from prompts written for this game; young Clyde used as the character reference', urls: [] }] },
    ];
    const all = fixed.concat(sections);
    const html = all.map(s => `<section><h3>${s.title}</h3><dl>${s.items.map(i => `<dt>${i.name.replace(/_/g, ' ')}</dt><dd>${i.what}${i.urls.length ? ' ' + i.urls.map(u => `<a href="${u}" target="_blank" rel="noopener">${new URL(u).hostname.replace('www.', '')}</a>`).join(', ') : ''}</dd>`).join('')}</dl></section>`).join('');
    hideHud(); root.appendChild(el('div', 'credits-page fade', `<header><h1>Credits</h1><p>Story after clydetombaugh.com and Clyde Tombaugh and Patrick Moore, Out of the Darkness. Bright stars from the HYG catalogue, the rest statistical. Pluto where it was in January 1930.</p></header>${html}<footer><button id="b-back" class="primary">Back</button></footer>`));
    $('#b-back').onclick = () => S && !S.done ? goTo(S.loc || 'room') : title();
  }

  // ---------- intro & tutorial ----------
  async function intro() {
    Audio_.preload(['train_arrive', 'car_engine_1920s', 'door_creak', 'wood_floor_creak_1', 'snow_footsteps', 'glass_plate_set', 'amb_arrival', 'amb_dome']);
    Audio_.loop('amb_arrival', 0.16, 6);
    const skipped = await slides(TEXT.intro, { skip: 'Skip the intro' });
    Audio_.stop('amb_arrival', 4);
    if (skipped) { S.t = START; S.phase = 'evening'; S.clock = 1155; S.loc = 'dome'; toast('Two of Slipher’s March plates wait at the comparator. The dome is yours tonight.', 6000); chronicle('April 1929. Began photographing the ecliptic. Slipher: pairs of plates about a week apart, always at opposition.'); save(); return howTo(day); }
    await tutorial();
  }
  async function tutorial() {
    S.t = Astro.d(1929, 2, 11); S.clock = 820; Audio_.stop('amb_dome', 2);
    await slides([{ img: 'comparator.jpg', lines: TEXT.tutorial.before }]);
    hud('Comparator room', 'practice plates');
    const res = await Blink.run({ spec: { seed: 'tutorial-1929', center: { ra: 130, dec: 19 }, days: 3, asteroids: 1, pluto: false, density: 0.8 },
      dates: ['8 Feb', '11 Feb'], regionName: 'Practice plate, Cancer', thirdPlate: true, focus: 1, tutorial: true });
    const got = res.suspects.some(s => s.kind === 'asteroid');
    const after = got ? TEXT.tutorial.after : [{ q: '“Not yet. But you will learn. Everyone learns, or leaves.”' }, ...TEXT.tutorial.after.slice(1)];
    await slides([{ img: 'comparator.jpg', lines: after }]);
    S.t = START; S.phase = 'evening'; S.clock = 1155; S.loc = 'dome'; S.focus = 1; toast('Two of Slipher’s March plates wait at the comparator. The dome is yours tonight.', 6000);
    chronicle('Began photographing the ecliptic. Slipher: pairs of plates, about a week apart, always at opposition.');
    save(); day();
  }

  // ---------- plates & pairs ----------
  // A plate knows where the telescope really pointed (ra, dec) and what the player wrote on its sleeve (label).
  // Only labels pair plates; the sky on the plate comes from the real pointing.
  const SAME_FIELD = 4;
  const plateName = p => p.label ? `${Astro.fieldStr(p.label.ra, p.label.dec)} · ${Astro.nearestRegion(p.label.ra, p.label.dec).name}` : 'unlabelled plate';
  const pairName = pr => plateName(pr.a);
  function pairs() {
    const ps = S.plates.filter(p => p.developed && !p.ruined && p.label).sort((a, b) => a.t - b.t); const out = [];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j], days = Math.round((b.t - a.t) / Astro.DAY);
      if (days > 14) break;
      if (days < 1 || Astro.sep(a.label.ra, a.label.dec, b.label.ra, b.label.dec) > SAME_FIELD) continue;
      if (out.some(o => o.a === a)) break;   // one partner per plate: the next usable one
      const mismatch = Astro.sep(a.ra, a.dec, b.ra, b.dec) > SAME_FIELD;
      const third = ps.some(p => p !== a && p !== b && Astro.sep(p.label.ra, p.label.dec, a.label.ra, a.label.dec) <= SAME_FIELD && Astro.sep(p.ra, p.dec, a.ra, a.dec) <= SAME_FIELD);
      out.push({ key: `${a.id}-${b.id}`, a, b, days, third, mismatch });
    }
    return out;
  }
  // labelled plates that have no partner yet and whose window (2 to 14 nights) is open tonight
  function needsSecond() { const prs = pairs(); return S.plates.filter(p => p.label && !p.ruined && !prs.some(x => x.a === p || x.b === p))
    .map(p => ({ p, days: Math.round((S.t - p.t) / Astro.DAY) })).filter(x => x.days >= 1 && x.days <= 14).sort((a, b) => b.days - a.days); }
  const sameField = (ra, dec) => S.plates.filter(p => p.label && !p.ruined && Astro.sep(p.label.ra, p.label.dec, ra, dec) <= SAME_FIELD).sort((a, b) => a.t - b.t)[0];
  // notes and plans that carry a position, e.g. "7h 20m +22 again", become pins on the sky
  function notePins() {
    const re = /(\d{1,2})h\s*(\d{1,2})m?\s*([+\-−]\s?\d{1,2}(?:\.\d)?)°?/;
    const out = [];
    (S.log || []).forEach(e => { const m = e.text && e.text.match(re); if (m) out.push({ ra: (+m[1] + m[2] / 60) % 24, dec: parseFloat(m[3].replace('−', '-').replace(/\s/, '')), text: e.text.slice(0, 40) }); });
    Object.entries(S.cal || {}).forEach(([k, v]) => { const m = v.match(re); if (m) out.push({ ra: (+m[1] + m[2] / 60) % 24, dec: parseFloat(m[3].replace('−', '-').replace(/\s/, '')), text: `${k.slice(5)}: ${v.slice(0, 36)}` }); });
    return out.filter(p => !isNaN(p.dec));
  }
  function specFor(pr) {
    const a = pr.a, rr = rng(hashStr(pr.key));
    const pluto = Astro.covers(a.ra, a.dec, Sky.PLUTO.ra / 15, Sky.PLUTO.dec);
    // Pluto's apparent motion: full retrograde speed at opposition, ~zero 6h away (near the stationary points)
    const diff = Astro.raDiff(a.ra, Astro.oppositionRA(a.t)), plutoRate = Math.cos(clamp(diff / 6, 0, 1) * Math.PI / 2);
    const MAG = { Mercury: 0.2, Venus: -4.0, Mars: 0.5, Jupiter: -2.3, Saturn: 0.7, Uranus: 5.7, Neptune: 7.8 };
    const pA = Astro.planets(a.t), pB = Astro.planets(pr.b.t);
    const planets = pA.map((p, i) => ({ name: p.name, ra: p.ra, dec: p.dec, ra2: pB[i].ra, dec2: pB[i].dec, mag: MAG[p.name] })).filter(p => Astro.covers(a.ra, a.dec, p.ra, p.dec));
    return { seed: pr.key, center: { ra: a.ra * 15, dec: a.dec }, days: pr.days, pluto, plutoRate, planets, haze: !!(a.haze || pr.b.haze || a.dev === 'thin' || pr.b.dev === 'thin'), fog: [a.dev, pr.b.dev].map((v, i) => v === 'fogged' || ((i ? pr.b : a).haze && Astro.moonIllum((i ? pr.b : a).t) > 0.2) ? 'fogged' : v),
      asteroids: rr() < 0.3 ? 1 : rr() < 0.08 ? 2 : 0, density: 0.75 + rr() * 0.5,
      finds: FINDS.onPlates(a.ra, a.dec, a.t, pr.b.t).filter(f => !S.found_ids.includes(f.id)) };
  }

  // ---------- day loop: free movement between the places on Mars Hill ----------
  const LOCS = [['observatory', 'Observatory'], ['darkroom', 'Darkroom'], ['logbook', 'Notebook']];
  const locOf = l => l === 'comparator' || l === 'dome' || l === 'status' || l === 'room' ? 'observatory' : l === 'calendar' ? 'logbook' : l;
  const phaseOf = clock => clock < 720 ? 'morning' : clock < 1140 ? 'afternoon' : 'evening';
  const isDark = () => S.clock >= 1140, dawn = () => S.clock >= 1680;
  const HOUR_CLOCK = { 21: 1260, 23: 1380, 1: 1500, 3: 1620 }, hourOf = c => c < 1320 ? 21 : c < 1440 ? 23 : c < 1560 ? 1 : 3;
  function nav() {
    const n = $('#hud-nav'); n.innerHTML = ''; n.classList.remove('hidden');
    LOCS.forEach(([id, name]) => { const b = el('button', id === locOf(S.loc) ? 'on' : '', name); b.onclick = () => goTo(id); n.appendChild(b); });
    // the two things he does besides the work
    const today = Astro.key(S.t);
    const bed = el('button', '', 'Sleep'); bed.title = 'Sleep until the afternoon. Dead nights pass to the next clear one.'; bed.onclick = () => { if (Blink.active) return toast('Leave the machine first.', 1800); sleep(1); }; n.appendChild(bed);
    // coffee sits with the condition it fixes, on the right
    const old = $('#hud-coffee'); if (old) old.remove();
    const cof = el('button', '', 'Coffee'); cof.id = 'hud-coffee'; cof.title = 'Sharp for ninety minutes, then a dip. 20 min.'; cof.onclick = () => { Audio_.play('coffee_pour', 0.5); S.focus = clamp(S.focus + 0.35, 0, 1); S.coffeeAt = S.clock; if (S.ate !== today) { S.ate = today; S.energy = clamp(S.energy + 0.12, 0, 1); } tick(20); toast('Coffee and bread at the stove. Sharp for an hour or so.', 2500); save(); hud($('#hud-place').textContent); }; $('#hud').appendChild(cof);
    flow();
  }
  // Order of the programme: plates without labels, a backlog of unexamined pairs, suspects never checked,
  // and a logbook left silent all pull it down. When it slips, plates get lost and Slipher notices.
  function order() {
    const unl = S.plates.filter(p => !p.label && !p.ruined).length, backlog = unblinked().length, open = S.suspects.filter(s => !s.verdict).length;
    const lastNote = S.lastNote ?? S.t, silent = (S.t - lastNote) / Astro.DAY;
    const score = clamp(1 - 0.12 * unl - 0.04 * Math.max(0, backlog - 4) - 0.06 * open - (silent > 14 ? 0.2 : 0), 0, 1);
    return { score, unl, backlog, open, silent, label: score > .7 ? 'good order' : score > .35 ? 'slipping' : 'chaos' };
  }
  function flow() {
    const f = $('#flow'); f.innerHTML = ''; f.classList.remove('hidden');
    const o = order(), und = undeveloped().length, analysed = new Set(Object.keys(S.blinked).flatMap(k => k.split('-'))).size, shot = S.plates.filter(p => !p.ruined).length;
    const steps = [
      ['Exposed', `${shot} plate${shot === 1 ? '' : 's'}`, S.loc === 'dome', false],
      ['Label', o.unl ? `${o.unl} unlabelled` : 'all labelled', false, o.unl > 0],
      ['Develop', und ? `${und} in the rack` : 'rack empty', S.loc === 'darkroom', und > 5],
      ['Blink', o.backlog ? `${o.backlog} pair${o.backlog === 1 ? '' : 's'} waiting` : 'nothing waiting', S.loc === 'comparator', o.backlog > 4],
      ['Check', o.open ? `${o.open} suspect${o.open === 1 ? '' : 's'} open` : (() => { const judged = S.suspects.filter(s => s.right != null); return judged.length ? `guesses ${judged.filter(s => s.right).length} of ${judged.length} right` : 'no suspects open'; })(), false, o.open > 2],
      ['Order', `${o.label} · ${analysed}/${shot} analysed`, S.loc === 'logbook', o.score < .35],
    ];
    steps.forEach(([name, sub, now, warn], i) => { if (i) f.appendChild(el('span', 'arrow', '·')); f.appendChild(el('span', 'step' + (now ? ' now' : '') + (warn ? ' warn' : ''), `<b>${name}</b> ${sub}`)); });
  }
  function goTo(loc) { if (Blink.active) { Blink.abort(); return setTimeout(() => goTo(loc), 60); } Dome3D.unmount(); S.loc = loc; S.phase = phaseOf(S.clock); save(); ({ room: observatory, darkroom, comparator, dome, logbook, status: observatory, observatory, calendar })[loc](); }
  // the observatory is the comparator by day and the dome by night
  function observatory() { const w = Astro.weather(S.t, hourOf(Math.max(S.clock, 1260))); if (isDark() && w.ok && Astro.moonDark(S.t) && !(unblinked().length && S.focus >= 0.3 && S.clock < 1260)) return goTo('dome'); goTo('comparator'); }
  // the observatory: whatever is next in the pipeline
  function work() { const w = Astro.weather(S.t, hourOf(Math.max(S.clock, 1260))), dark = Astro.moonDark(S.t);
    if (undeveloped().length) return goTo('darkroom');
    if (unblinked().length && S.focus >= 0.12) return goTo('comparator');
    if (isDark() && w.ok && dark) return goTo('dome');
    return goTo(isDark() ? 'dome' : 'comparator'); }
  function day() { goTo(S.loc || 'room'); }

  function room(img, place, textLines, actions, opts) {
    if (img === undefined) return roomScene();
    return panelScene(img, place, textLines, actions, opts);
  }
  function panelScene(img, place, textLines, actions, { red = false, region = '', task = '' } = {}) {
    hud(place, region); nav();
    const root = scene(); root.innerHTML = '';
    const pic = el('div', 'picture fade ' + (red ? 'red' : 'dim')); pic.style.backgroundImage = `url(assets/img/${img})`; root.appendChild(pic);
    const panel = el('div', 'panel fade'); const r = el('div', 'room'); r.appendChild(panel); root.appendChild(r);
    panel.innerHTML = `<h3>${place}</h3>` + (task ? `<h2 class="task">${task}</h2>` : '') + textLines.map(t => `<p>${t}</p>`).join('');
    const menu = el('div', 'menu'); panel.appendChild(menu);
    const list = actions.filter(a => a.primary).slice(0, 1).concat(actions.filter(a => !a.primary)).slice(0, 3);
    list.forEach(a => { const b = el('button', a.primary ? 'primary' : '', a.label + (a.sub ? `<small>${a.sub}</small>` : '')); b.disabled = !!a.disabled; b.onclick = a.fn; menu.appendChild(b); });
    return panel;
  }
  const undeveloped = () => S.plates.filter(p => !p.developed && !p.ruined);
  const unblinked = () => pairs().filter(p => !S.blinked[p.key] && !p.mismatch);
  function wxLine(t, hour) { const w = Astro.weather(t, hour); const k = w.state === 'storm' ? (w.summer ? 'stormSummer' : 'stormWinter') : w.state;
    const pool = TEXT.weather[k].filter(s => !(w.wind && /still/.test(s))); return pick(pool.length ? pool : TEXT.weather[k]) + (w.wind && w.ok ? ' ' + TEXT.weather.wind : ''); }
  // what is waiting, in order of what Tombaugh would do next
  function suggestion() {
    const und = undeveloped().length, ub = unblinked().length, w = Astro.weather(S.t, 23), dark = Astro.moonDark(S.t);
    const o = order();
    if (o.backlog > 4) return `Too many plates, too little looking. ${o.backlog} pairs wait at the comparator.`;
    if (o.unl) return `${o.unl} plate${o.unl > 1 ? 's' : ''} without a label. Write them in the logbook before they are forgotten.`;
    if (und) return `${und} plate${und > 1 ? 's' : ''} to develop in the darkroom.`;
    if (ub && S.focus >= 0.12) return `${ub} pair${ub > 1 ? 's' : ''} waiting at the comparator.`;
    if (isDark() && w.ok && dark) return 'Clear and dark. The dome.';
    if (!isDark()) return w.ok && dark ? 'Tonight looks clear. Wait for dark.' : 'Daylight. Nothing waits.';
    return w.ok ? 'Moonlight. No plates tonight.' : 'No exposures tonight.';
  }

  function roomScene() {
    const ph = phaseOf(S.clock), w = Astro.weather(S.t, 23), dark = Astro.moonDark(S.t), ill = Math.round(Astro.moonIllum(S.t) * 100);
    const lines = [ph === 'afternoon' && S.clock < 960 ? 'He slept through the morning, as always after a night in the dome.' : pick(TEXT[ph])];
    lines.push(`${ph === 'evening' ? '' : 'Tonight: '}${wxLine(S.t, 23)} Moon ${ill} %.`);
    if (S.energy < 0.33) lines.push('He is very tired. Another hour in the cold and he will not get up again.');
    const plan = (S.cal || {})[Astro.key(S.t)]; if (plan) lines.push(`In the calendar for today: <b>${plan}</b>.`);
    const workNow = undeveloped().length || (unblinked().length && S.focus >= 0.12) || (isDark() && w.ok && dark);
    const nothingToDo = !undeveloped().length && !unblinked().length;
    const today = Astro.key(S.t);
    const acts = [];
    if (workNow) acts.push({ label: 'To the observatory', sub: suggestion(), primary: true, fn: work });
    acts.push({ label: 'Coffee and bread', sub: 'Sharp for ninety minutes, then a dip. 20 min.', fn: () => { Audio_.play('coffee_pour', 0.5); S.focus = clamp(S.focus + 0.35, 0, 1); S.coffeeAt = S.clock; if (S.ate !== today) { S.ate = today; S.energy = clamp(S.energy + 0.12, 0, 1); } tick(20); toast('Coffee and bread, standing at the stove.'); save(); roomScene(); } });
    if (isDark() && w.ok && !dark && !workNow) { const planet = Astro.planets(S.t).filter(p => ['Jupiter', 'Saturn', 'Mars', 'Venus'].includes(p.name)).map(p => ({ ...p, alt: Astro.altitude(p.ra, p.dec, Astro.lst(S.t, 21)) })).filter(p => p.alt > 20).sort((a, b) => b.alt - a.alt)[0];
      acts.push({ label: `Sketch ${planet ? planet.name : 'a planet'} at the 24-inch`, sub: 'Moonlight ruins plates. A pencil does not mind.', fn: () => { tick(90); S.focus = clamp(S.focus + 0.15, 0, 1); if (spend(0.06, 'room')) return; chronicle(planet ? TEXT.sketch[planet.name] : TEXT.sketch.none); Audio_.play('pencil_write', 0.5); toast('A page of the sketchbook filled.', 2200); save(); roomScene(); } }); }
    if (!isDark()) acts.push({ label: 'Wait for dark', sub: w.ok && dark ? 'Clear tonight.' : 'No plates tonight.', primary: !workNow, fn: () => { S.clock = Math.max(S.clock, 1155); tick(0); goTo(w.ok && dark ? 'dome' : 'room'); } });
    else acts.push({ label: 'Turn in', sub: nothingToDo ? 'Sleep through the dead days to the next clear night.' : 'Sleep until the afternoon.', primary: !workNow, fn: () => { if (!(w.ok && dark)) chronicle(w.ok ? TEXT.logAuto.moon : TEXT.logAuto.cloudy); sleep(1); } });
    panelScene(ph === 'afternoon' ? 'coffee.jpg' : 'desk.jpg', 'Home', lines, acts, { task: workNow ? 'Work is waiting.' : isDark() ? 'Nothing to do tonight.' : 'Nothing to do until dark.' });
  }
  function status() {
    const o = order(), und = undeveloped().length, shot = S.plates.filter(p => !p.ruined).length, analysed = new Set(Object.keys(S.blinked).flatMap(k => k.split('-'))).size;
    const w = Astro.weather(S.t, 23), ill = Math.round(Astro.moonIllum(S.t) * 100);
    const lines = [
      `<b>${shot}</b> plates exposed, <b>${analysed}</b> of them examined. ${shot - analysed > 6 ? 'Photographing has run ahead of looking.' : 'In balance.'}`,
      `<b>${und}</b> in the darkroom rack · <b>${o.unl}</b> without a label · <b>${o.backlog}</b> pairs waiting · <b>${o.open}</b> suspects unchecked.`,
      `Order of the programme: <b>${o.label}</b>.${o.silent > 7 ? ` Nothing written for ${Math.round(o.silent)} days.` : ''}`,
      `Energy <b>${S.energy > .66 ? 'fresh' : S.energy > .33 ? 'tired' : 'exhausted'}</b> · concentration <b>${S.focus > .66 ? 'good' : S.focus > .33 ? 'fair' : 'poor'}</b>.`,
      `Tonight: ${wxLine(S.t, 23)} Moon ${ill} %. ${w.ok && Astro.moonDark(S.t) ? 'Exposures possible.' : 'No exposures.'}`,
      `Discoveries: <b>${S.found_ids.length}</b>${S.found_ids.length ? ' · ' + S.found_ids.map(id => FINDS.list.find(f => f.id === id).name).join(', ') : ''}. Sessions at the comparator: <b>${S.sessions}</b>.`,
    ];
    panelScene('comparator.jpg', 'Status', lines, [{ label: 'To the observatory', sub: suggestion(), primary: true, fn: work }, { label: 'Home', fn: () => goTo('room') }], { task: suggestion() });
  }
  function darkroom() {
    const und = undeveloped();
    panelScene(Math.random() < .5 ? 'darkroom_tray.jpg' : 'darkroom_face.jpg', 'Darkroom', [und.length ? `${und.length} plate${und.length > 1 ? 's' : ''} in the rack: ${und.map(plateName).join(' · ')}.` : 'The trays are empty. Fixer and acetic acid.'],
      [{ label: 'Develop', sub: und.length ? `${und.length} × 20 min under the red lamp.` : 'Nothing to develop.', primary: !!und.length, disabled: !und.length, fn: develop }, { label: 'To the observatory', sub: 'The comparator by day. The dome by night.', primary: !und.length, fn: () => goTo('observatory') }], { red: true, task: und.length ? `Develop ${und.length} plate${und.length > 1 ? 's' : ''}.` : 'Nothing to develop.' });
  }
  // Developing: the image comes up in the tray under the red lamp. Pull the plate when the density is right.
  // Too early and the faint stars never appear; too late and the whole plate fogs.
  async function develop() {
    const und = undeveloped();
    hud('Darkroom'); $('#hud-nav').classList.add('hidden'); $('#flow').classList.add('hidden'); live = false;
    Audio_.loop('safelight', 0.2, 1);
    for (let i = 0; i < und.length; i++) {
      const p = und[i]; const result = await developOne(p, i + 1, und.length);
      p.developed = true; p.dev = result; p.devT = S.t; tick(20); S.energy = clamp(S.energy - 0.02, 0, 1);
    }
    Audio_.stop('safelight', 1); live = true; save();
    goTo('comparator');
  }
  function developOne(plate, n, of) {
    return new Promise(res => {
      const root = scene(); root.innerHTML = '';
      const pic = el('div', 'picture red'); pic.style.backgroundImage = 'url(assets/img/darkroom_tray.jpg)'; pic.style.filter = 'saturate(1.1) brightness(.35)'; root.appendChild(pic);
      const wrap = el('div', 'dev-wrap'); root.appendChild(wrap);
      const cv = el('canvas'); cv.width = 420; cv.height = 340; wrap.appendChild(cv);
      const meter = el('div', 'dev-meter', '<i></i><b></b>'); wrap.appendChild(meter);
      const zones = el('div', 'dev-zones', '<span>thin</span><span>right</span><span>fogged</span>'); wrap.appendChild(zones);
      const info = el('div', 'dev-info', `<h2 class="task">Watch the plate come up. Pull it when the marker is in the middle.</h2><p>Plate ${n} of ${of}: ${plateName(plate)}. Bright stars first, the faint ones last. Left too long, the whole plate goes grey.</p>`); wrap.appendChild(info);
      const btn = el('button', 'primary', 'Pull the plate &nbsp;<span class="kbd">space</span>'); wrap.appendChild(btn);
      const g = cv.getContext('2d'), r = rng(hashStr('dev' + plate.id));
      const stars = Array.from({ length: 260 }, () => ({ x: r() * 420, y: r() * 340, m: r() }));
      let d = 0, t0 = performance.now(), done = false;
      Audio_.play('liquid_pour', 0.5);
      const draw = () => { g.fillStyle = `rgb(${18 + d * 0.9},${16 + d * 0.8},${14 + d * 0.7})`; g.fillRect(0, 0, 420, 340);
        stars.forEach(s => { const vis = clamp((d - s.m * 70) / 25, 0, 1); if (vis <= 0) return; const a = vis * (0.35 + (1 - s.m) * 0.6); g.fillStyle = `rgba(230,225,215,${a})`; const sz = 1 + (1 - s.m) * 2.5 * vis; g.fillRect(s.x, s.y, sz, sz); });
        if (d > 80) { g.fillStyle = `rgba(200,195,185,${(d - 80) / 60})`; g.fillRect(0, 0, 420, 340); }
        meter.querySelector('i').style.width = `${d}%`; meter.querySelector('b').style.left = `${d}%`; };
      const loop = now => { if (done) return; d = Math.min(100, (now - t0) / 180); draw(); if (d >= 100) finish(); else requestAnimationFrame(loop); };
      function finish() { done = true; window.removeEventListener('keydown', kd); Audio_.play('water_slosh', 0.4);
        const q = d < 50 ? 'thin' : d <= 80 ? 'good' : 'fogged';
        toast(q === 'good' ? 'Pulled right. Into the fixer.' : q === 'thin' ? 'Pulled early. A thin plate; the faint stars never came up.' : 'Too long in the bath. The plate fogged.', 3500);
        setTimeout(() => res(q), 1400); }
      const kd = e => { if (e.key === ' ') { e.preventDefault(); finish(); } };
      window.addEventListener('keydown', kd); btn.onclick = finish;
      requestAnimationFrame(loop);
    });
  }

  function comparator() {
    const ub = unblinked();
    const lines = [pick(TEXT.afternoon)];
    const acts = ub.slice(0, 2).map(pr => ({ label: `Blink ${pairName(pr)}`, sub: `${Astro.fmtShort(pr.a.t)} to ${Astro.fmtShort(pr.b.t)} · ${pr.days} days${pr.third ? ' · third plate available' : ''}`, disabled: S.focus < 0.12, fn: () => blink(pr) }));
    const mism = pairs().filter(p => p.mismatch && !S.blinked[p.key]).length; if (mism) lines.push(`${mism} pair${mism > 1 ? 's' : ''} whose labels match but whose star fields do not. A mislabelled plate somewhere.`);
    const open = pairs().filter(pr => S.blinked[pr.key] && S.suspects.some(s => s.pair === pr.key && !s.verdict));
    if (!ub.length) open.slice(0, 2).forEach(pr => acts.push({ label: `Check ${pairName(pr)}`, sub: `${Astro.fmtShort(pr.a.t)} to ${Astro.fmtShort(pr.b.t)} · ${S.suspects.filter(s => s.pair === pr.key && !s.verdict).length} unchecked${pr.third ? ' · third plate available' : ' · needs a third plate'}`, disabled: S.focus < 0.12, fn: () => blink(pr) }));
    const firstOk = acts.find(a => !a.disabled); if (firstOk) firstOk.primary = true;
    if (!ub.length) { lines.push('No pairs. A pair is two developed plates of one field with the same label, 1 to 14 nights apart.');
      const dev = S.plates.filter(p => p.developed && !p.ruined), prs = pairs(); const lone = dev.filter(p => !prs.some(x => x.a === p || x.b === p));
      lone.slice(-4).forEach(p => { if (!p.label) { lines.push(`No. ${p.id}: no label.`); return; }
        const same = dev.filter(q => q !== p && q.label && Astro.sep(q.label.ra, q.label.dec, p.label.ra, p.label.dec) <= SAME_FIELD);
        if (!same.length) lines.push(`No. ${p.id} (${Astro.fieldStr(p.label.ra, p.label.dec)}): no second plate of this field yet.`);
        else { const q = same[0], n = Math.abs(Math.round((q.t - p.t) / Astro.DAY)); lines.push(`No. ${p.id} and No. ${q.id}: ${n < 1 ? 'the same night. Another night is needed.' : n > 14 ? `${n} nights apart. Too long.` : 'the star fields differ. A label is wrong.'}`); } }); }
    const unl = S.plates.filter(p => !p.label && !p.ruined).length; if (unl) lines.push(`${unl} plate${unl > 1 ? 's' : ''} without a label. Nobody knows what they show.`);
    if (S.focus < 0.12) lines.push('The eyes are done. Rest first.');
    const w = Astro.weather(S.t, 23), can = w.ok && Astro.moonDark(S.t);
    // no pair yet: the obvious next step is the second plate of the newest lone field
    const lone = !ub.length ? S.plates.filter(p => p.label && !p.ruined && p.developed && !pairs().some(x => x.a === p || x.b === p) && Astro.key(p.t) !== Astro.key(S.t)).sort((a, b) => b.t - a.t)[0] : null;
    if (lone && (can || isDark() && w.ok)) acts.push({ label: `Expose No. ${lone.id} again`, primary: true, sub: `${Astro.fieldStr(lone.label.ra, lone.label.dec)} · ${Astro.nearestRegion(lone.label.ra, lone.label.dec).name}. ${isDark() ? 'The telescope turns there.' : 'At dusk the telescope turns there.'}`, fn: () => { S.slewTo = { ra: lone.label.ra, dec: lone.label.dec }; if (!isDark()) { S.clock = Math.max(S.clock, 1155); tick(0); } goTo('dome'); } });
    acts.push({ label: isDark() ? 'Expose' : 'Expose at dusk', sub: isDark() ? 'Up in the dome.' : can ? 'Clear tonight.' : 'No plates tonight.', primary: !acts.some(a => a.primary) && (isDark() || can), fn: () => { if (!isDark()) { S.clock = Math.max(S.clock, 1155); tick(0); } goTo(can || isDark() ? 'dome' : 'comparator'); } });
    if (!ub.length && !can) acts.push({ label: 'Sleep', sub: 'Nothing waits. To the next clear night.', primary: !acts.some(a => a.primary), fn: () => sleep(1) });
    if (!ub.length && !undeveloped().length) acts.push({ label: 'Let a month pass', sub: 'Routine plates, nothing found. The sky turns.', fn: () => { S.t += Astro.DAY * 30; S.clock = 1739; S.energy = 1; S.focus = 1; waitForNight(); } });
    if (!isDark() && !ub.length && can) lines.push(`Tonight: ${wxLine(S.t, 23)} Moon ${Math.round(Astro.moonIllum(S.t) * 100)} %.`);
    panelScene('comparator.jpg', 'Comparator room', lines, acts, { task: ub.length ? `Blink ${ub.length} pair${ub.length > 1 ? 's' : ''}.` : S.focus < 0.12 ? 'Eyes done. Rest.' : 'No pairs to blink.' });
  }
  async function blink(pr) {
    const reg = { name: pairName(pr) };
    hud('Comparator'); nav(); $('#flow').classList.add('hidden');
    Audio_.play('glass_plate_set', 0.5);
    live = false;
    const res = await Blink.run({ spec: specFor(pr), dates: [Astro.fmtShort(pr.a.t), Astro.fmtShort(pr.b.t)], regionName: reg.name, thirdPlate: pr.third, focus: S.focus,
      restore: S.suspects.filter(s => s.pair === pr.key), note: (S.pairNotes || {})[pr.key] || '',
      onNote: v => { S.pairNotes ??= {}; if (v !== S.pairNotes[pr.key]) { S.pairNotes[pr.key] = v; addLog(`${reg.name}, ${Astro.fmtShort(pr.a.t)} / ${Astro.fmtShort(pr.b.t)}: ${v}`); S.lastNote = S.t; save(); } },
      onTick: (sec, f) => { $('#hud-focus').textContent = 'concentration: ' + (f > .66 ? 'good' : f > .33 ? 'fair' : 'poor'); } });
    live = true; S.focus = res.focus; S.sessions++; tick(res.minutes + 10);
    S.pairNotes ??= {}; if (res.note && res.note !== S.pairNotes[pr.key]) { S.pairNotes[pr.key] = res.note; addLog(`${reg.name}, ${Astro.fmtShort(pr.a.t)} / ${Astro.fmtShort(pr.b.t)}: ${res.note}`); S.lastNote = S.t; }
    if (S.loc !== 'comparator') { save(); return; }   // left through the location bar const out = S.energy - res.minutes / 50 * 0.12 <= 0.05;
    const before = S.suspects.filter(s => s.pair === pr.key);
    S.suspects = S.suspects.filter(s => s.pair !== pr.key).concat(res.suspects.map(s => ({ pair: pr.key, ...s, right: s.verdict && s.guess && s.guess !== '?' ? s.guess === s.kind : null })));
    res.suspects.forEach(s => { const old = before.find(o => Math.abs(o.x - s.x) < 0.01 && Math.abs(o.y - s.y) < 0.01);
      if (s.verdict && !(old && old.verdict)) {
        if (s.find) { const f = FINDS.list.find(x => x.id === s.find); if (f && !S.found_ids.includes(f.id)) { S.found_ids.push(f.id);
          chronicle(`${reg.name}: new ${f.kind}. Reported to Slipher as ${f.prov}. ${f.kind === 'comet' ? 'A comet of my own.' : f.kind === 'variable' ? 'Brightness changed, position did not.' : 'Motion too fast for Planet X, but nobody has it on the lists.'}`);
          toast(`A real discovery: ${f.prov}, ${f.name}. ${f.note}.`, 7000); } }
        else if (s.kind === 'asteroid') chronicle(TEXT.logAuto.asteroid(reg.name)); else if (s.kind === 'defect') chronicle(TEXT.logAuto.defect(reg.name)); } });
    S.blinked[pr.key] = S.t; save();
    const open = res.suspects.filter(s => !s.verdict).length;
    chronicle(TEXT.logAuto.blinked(reg.name, Astro.fmtShort(pr.a.t), Astro.fmtShort(pr.b.t), res.suspects.length) + (open ? ` ${open} unchecked, a third plate is needed.` : ''));
    if (res.found) return discovery(pr);
    if (spend(res.minutes / 50 * 0.12, 'comparator')) return;
    goTo(S.focus > 0.3 && unblinked().length ? 'comparator' : 'room');
  }
  function sleep(days) { const short = S.clock >= 1620;
    const idle = !undeveloped().length && !unblinked().length;
    const nextT = S.t + Astro.DAY * days;
    if (idle) { S.clock = 1739; return waitForNight(); }
    const o = order();
    if (o.label === 'chaos') { const unl = S.plates.filter(p => !p.label && !p.ruined); if (unl.length && Math.random() < 0.5) { const lost = unl[Math.floor(Math.random() * unl.length)]; lost.ruined = true; chronicle(`An unlabelled plate is gone from the rack. Someone has filed it, or used it. Plate ${lost.id}, whatever it was.`); }
      else chronicle('Slipher stopped at the door and looked at the rack for a while. He said nothing. He did not need to.'); S.focus = clamp(S.focus - 0.2, 0, 1); }
    else if (o.label === 'slipping' && Math.random() < 0.4) chronicle('Plates in the rack, pairs on the table, nothing written down. It is getting away from me.'); S.t += Astro.DAY * days; S.clock = short ? 900 : 780; S.energy = clamp(S.energy + (short ? 0.7 : 0.95), 0, 1); S.focus = clamp(S.focus + 0.6, 0, 1); S.hour = 23; S.coffeeAt = null; between(() => goTo('observatory')); }
  // a quiet moment: one line, the date, no button
  function between(then) {
    hideHud(); const root = scene(); root.innerHTML = '';
    const pic = el('div', 'picture dim slow-fade'); pic.style.backgroundImage = `url(assets/img/${pick(['desk.jpg', 'rest.jpg', 'walk.jpg', 'coffee.jpg'])})`; root.appendChild(pic);
    const cap = el('div', 'caption'); cap.innerHTML = `<p class="on hint">${Astro.fmt(S.t)}</p><p class="on">${pick(TEXT.between)}</p>`; root.appendChild(cap);
    const go = () => { document.removeEventListener('pointerdown', go); document.removeEventListener('keydown', go); clearTimeout(tm); then(); };
    const tm = setTimeout(go, 3200); document.addEventListener('pointerdown', go); document.addEventListener('keydown', go);
  }
  async function waitForNight() {
    let n = 0; let t = S.t;
    do { t += Astro.DAY; n++; } while (!(Astro.weather(t, 23).ok && Astro.moonDark(t)) && n < 30);
    const skipped = n;
    S.t = t; S.clock = 1155; S.focus = 1; S.energy = 1; S.hour = 23; S.coffeeAt = null;
    chronicle(n > 1 ? `${n} days of cloud, moon, waiting. Snow creaks. Coffee.` : 'A dead night. Slept.');
    if (skipped === 1) return goTo('dome');
    panelScene('walk.jpg', 'Mars Hill', [`${n} days pass. ${pick(TEXT.morning)}`], [{ label: 'Up to the dome', primary: true, fn: () => goTo('dome') }], { task: 'An observing night at last.' });
  }
  // The logbook is an A6 notebook: fixed lines per page, entries in the order they were written, flipped by hand.
  const PAGE_LINES = 19, LINE_CHARS = 34;
  const SKETCH_LINES = 8;
  const lineCount = txt => txt.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / LINE_CHARS)), 0);
  function notebookPages() {
    const entries = [];
    S.plates.filter(p => !p.ruined || p.label).forEach(p => entries.push({ t: p.t + 1, kind: 'plate', d: `No. ${p.id} · ${Astro.fmtShort(p.t)} ${new Date(p.t).getUTCFullYear()}${p.slipher ? ' · V. M. S.' : ''}`, text: `${p.label ? Astro.fieldStr(p.label.ra, p.label.dec) : 'no label'} · 60 min · ${p.haze ? 'thin cloud' : 'clear'}${p.wind ? ', wind' : ''}${p.developed ? ' · dev.' : ''}${p.ruined ? ' · lost' : ''}` }));
    S.log.forEach((e, i) => entries.push({ t: Date.parse(e.d.split(',')[0]) || 0, i, kind: e.sketch ? 'sketch' : 'note', d: e.d, text: e.text, src: e }));
    entries.sort((a, b) => a.t - b.t || (a.i ?? 0) - (b.i ?? 0));
    const pages = [[]]; let used = 0;
    entries.forEach(e => { const n = e.kind === 'sketch' ? 1 + SKETCH_LINES : 1 + lineCount(e.text); if (used + n > PAGE_LINES && pages[pages.length - 1].length) { pages.push([]); used = 0; } pages[pages.length - 1].push(e); used += n; });
    return pages;
  }
  // pencil on paper: strokes are kept as normalised points on the entry
  function sketchPad(cv, entry) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const draw = () => { g.clearRect(0, 0, W, H); g.lineCap = 'round'; g.lineJoin = 'round';
      (entry.sketch || []).forEach(st => { if (st.length < 2) { g.fillStyle = 'rgba(40,36,30,.8)'; g.fillRect(st[0][0] * W, st[0][1] * H, 1.5, 1.5); return; }
        g.strokeStyle = 'rgba(40,36,30,.85)'; g.lineWidth = 1.6; g.beginPath(); st.forEach((q, i) => i ? g.lineTo(q[0] * W, q[1] * H) : g.moveTo(q[0] * W, q[1] * H)); g.stroke();
        g.strokeStyle = 'rgba(80,72,60,.35)'; g.lineWidth = 0.7; g.stroke(); }); };
    let st = null, counted = false;
    const pt = e => { const r = cv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); st = [pt(e)]; entry.sketch.push(st); if (!counted) { counted = true; tick(10); Audio_.play('pencil_write', 0.35); } });
    cv.addEventListener('pointermove', e => { if (!st) return; const q = pt(e), l = st[st.length - 1]; if (Math.hypot((q[0] - l[0]) * W, (q[1] - l[1]) * H) > 1.5) { st.push(q); draw(); } });
    const up = () => { if (st) { st = null; save(); } }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    draw();
  }
  function logbook(pageIdx) {
    const root = scene(); hud('Logbook'); nav(); S.loc = 'logbook';
    root.innerHTML = ''; const pic = el('div', 'picture dim'); pic.style.backgroundImage = 'url(assets/img/desk.jpg)'; root.appendChild(pic);
    const pages = notebookPages(); const last = pages.length - 1;
    let left = pageIdx ?? (last % 2 ? last - 1 : last); left = Math.max(0, Math.min(left - left % 2, last - last % 2));
    const page = (i, side) => { const pg = el('div', 'page ' + side); if (i > last) { pg.classList.add('blank'); return pg; }
      pg.innerHTML = `<div class="pno">${i + 1}</div>` + pages[i].map((e, k) => e.kind === 'sketch' ? `<div class="entry sketch"><span class="d">${e.d}</span><br><canvas class="sk" data-i="${e.i}" width="352" height="${28 * SKETCH_LINES - 4}"></canvas></div>` : `<div class="entry${e.kind === 'plate' ? ' plate' : ''}"><span class="d">${e.d}</span><br>${e.text}</div>`).join('');
      if (i === last) { pg.innerHTML += `<div class="entry write"><span class="d">${Astro.fmt(S.t)}, ${hhmm(S.clock)}</span><br><textarea rows="2" placeholder="write…"></textarea></div><button id="lb-save" class="primary">Write</button> <button id="lb-sketch">Sketch</button>`; }
      pg.querySelectorAll('canvas.sk').forEach(cv => sketchPad(cv, S.log[+cv.dataset.i]));
      return pg; };
    const book = el('div', 'notebook fade'); book.appendChild(page(left, 'left')); book.appendChild(page(left + 1, 'right')); root.appendChild(book);
    const ctl = el('div', 'book-ctl', `<button id="pg-prev" ${left === 0 ? 'disabled' : ''}>Earlier pages</button><span>pages ${left + 1} and ${left + 2} of ${last + 1}</span><button id="pg-next" ${left + 2 > last ? 'disabled' : ''}>Later pages</button><button id="pg-cal">Calendar</button>`); root.appendChild(ctl);
    $('#pg-cal').onclick = () => goTo('calendar');
    const flip = i => { Audio_.play('page_turn', 0.4, 3); logbook(i); };
    $('#pg-prev').onclick = () => flip(left - 2); $('#pg-next').onclick = () => flip(left + 2);
    const o = order();
    const stats = el('div', 'expose-info'); stats.innerHTML = `plates <b>${S.plates.filter(p => !p.ruined).length}</b> · pairs blinked <b>${Object.keys(S.blinked).length}</b> · suspects open <b>${o.open}</b><br>discoveries <b>${S.found_ids.length}</b>${S.found_ids.length ? ': ' + S.found_ids.map(id => FINDS.list.find(f => f.id === id).name).join(', ') : ''}<br>order: <b>${o.label}</b>${o.silent > 7 ? ` · nothing written for ${Math.round(o.silent)} days` : ''}`; root.appendChild(stats);
    const unl = S.plates.filter(p => !p.label && !p.ruined);
    if (unl.length) { const u = el('div', 'unlabelled', `<b>Unlabelled plates</b> ` + unl.map(p => `<label>No. ${p.id}, ${Astro.fmtShort(p.t)} <input data-id="${p.id}" placeholder="7h 20m +22°" autocomplete="off"></label>`).join('')); root.appendChild(u);
      u.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => { const m = inp.value.trim().match(/^(.+?)\s+([+\-−]\d.*)$/); const r = m && Astro.parseRA(m[1]), d = m && Astro.parseDec(m[2]);
        if (r == null || d == null) { toast('Write it as RA then Dec, e.g. 7h 20m +22°', 2500); return; } const p = S.plates.find(x => x.id === +inp.dataset.id); p.label = { ra: r, dec: d }; S.lastNote = S.t; chronicle(`Plate ${p.id} labelled from memory: ${Astro.fieldStr(r, d)}. If memory serves.`); save(); logbook(); })); }
    const ta = book.querySelector('textarea');
    if (ta) { $('#lb-sketch').onclick = () => { S.log.push({ d: `${Astro.fmt(S.t)}, ${hhmm(S.clock)}`, text: '', sketch: [] }); S.lastNote = S.t; tick(15); Audio_.play('pencil_write', 0.4); save(); logbook(); };
      $('#lb-save').onclick = () => { const v = ta.value.trim();
        if (v) { const words = v.split(/\s+/).length, min = Math.max(15, Math.ceil(words / 20)); addLog(v); S.lastNote = S.t; tick(min); S.energy = clamp(S.energy - 0.01, 0, 1); Audio_.play('pencil_write', 0.5); toast(`Writing took ${min} minutes.`, 2200); }
        save(); logbook(); };
      if (pageIdx == null) ta.focus({ preventScroll: true }); }
    if (pageIdx == null) Audio_.play('page_turn', 0.4, 3);
  }

  // ---------- calendar: moon, plates, second-plate windows, dated notes ----------
  function calendar(monthT) {
    const base = monthT ?? S.t, x = new Date(base), y = x.getUTCFullYear(), m = x.getUTCMonth();
    hud('Calendar'); nav(); S.loc = 'calendar';
    const root = scene(); root.innerHTML = ''; const pic = el('div', 'picture dim'); pic.style.backgroundImage = 'url(assets/img/desk.jpg)'; root.appendChild(pic);
    S.cal ??= {};
    const first = Date.UTC(y, m, 1), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), startDow = (new Date(first).getUTCDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div class="cell empty"></div>');
    for (let d = 1; d <= days; d++) {
      const t = Date.UTC(y, m, d), k = Astro.key(t), today = k === Astro.key(S.t), past = t < S.t - Astro.DAY / 2;
      const ill = Astro.moonIllum(t), plates = S.plates.filter(p => Astro.key(p.t) === k);
      const dev = S.plates.filter(p => p.devT && Astro.key(p.devT) === k).length;
      const blinked = Object.entries(S.blinked).filter(([, bt]) => bt !== true && Astro.key(bt) === k).map(([key]) => key.replace('-', '+'));
      const notes = S.log.filter(e => e.d.startsWith(Astro.fmt(t))).length;
      const note = S.cal[k] || '';
      const done = plates.map(p => `<span class="pl">${p.ruined ? 'lost' : 'No. ' + p.id}${p.label ? ' · ' + Astro.fieldStr(p.label.ra, p.label.dec) : p.ruined ? '' : ' · no label'}</span>`).join('')
        + (dev ? `<span class="dv">developed ${dev}</span>` : '') + (blinked.length ? `<span class="bl">blinked ${blinked.join(', ')}</span>` : '') + (notes ? `<span class="nt">${notes} note${notes > 1 ? 's' : ''}</span>` : '')
        + (S.foundDate && Astro.key(S.foundDate) === k ? '<span class="found">Planet X</span>' : '');
      cells.push(`<div class="cell${today ? ' today' : ''}${past ? ' past' : ''}" data-k="${k}">
        <span class="n">${d}</span><span class="moon" style="--ill:${ill.toFixed(2)}" title="moon ${Math.round(ill * 100)}%"></span>
        ${done}${note ? `<span class="note">${note}</span>` : ''}</div>`);
    }
    const dark = (() => { let n = 0; for (let d = 1; d <= days; d++) if (Astro.moonDark(Date.UTC(y, m, d))) n++; return n; })();
    const cal = el('div', 'calendar fade', `<div class="cal-head"><button id="cal-prev">Earlier</button><h2>${Astro.FI_MONTHS[m]} ${y}</h2><button id="cal-next">Later</button><button id="cal-book">Notebook pages</button></div>
      <div class="cal-sub">${dark} moonless nights this month. Dark discs are dark of the moon. Each day shows what was exposed, developed and blinked. Click a day to write a plan.</div>
      <div class="grid"><div class="dow">Mon</div><div class="dow">Tue</div><div class="dow">Wed</div><div class="dow">Thu</div><div class="dow">Fri</div><div class="dow">Sat</div><div class="dow">Sun</div>${cells.join('')}</div>`);
    root.appendChild(cal);
    $('#cal-prev').onclick = () => calendar(Date.UTC(y, m - 1, 1)); $('#cal-next').onclick = () => calendar(Date.UTC(y, m + 1, 1)); $('#cal-book').onclick = () => goTo('logbook');
    cal.querySelectorAll('.cell[data-k]').forEach(c => c.addEventListener('click', () => {
      if (c.querySelector('input')) return; const k = c.dataset.k; const inp = el('input'); inp.value = S.cal[k] || ''; inp.placeholder = 'plan…'; inp.maxLength = 48; c.appendChild(inp); inp.focus();
      const done = () => { const v = inp.value.trim(); if (v !== (S.cal[k] || '')) { if (v) S.cal[k] = v; else delete S.cal[k]; tick(5); Audio_.play('pencil_write', 0.4); S.lastNote = S.t; } save(); calendar(Date.UTC(y, m, 1)); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') calendar(Date.UTC(y, m, 1)); }); inp.addEventListener('blur', done); }));
  }

  // ---------- dome ----------
  function dome() {
    if (dawn()) return panelScene('walk.jpg', 'Dome', ['Grey in the east. The stars are going.'], [{ label: 'Sleep', primary: true, sub: 'Until the afternoon.', fn: () => sleep(1) }], { task: 'Dawn. Shut the slit.' });
    S.hour = isDark() ? hourOf(S.clock) : 21;
    if (S.slewTo) { const tgt = S.slewTo; for (const h of [21, 23, 1, 3]) { if (HOUR_CLOCK[h] < S.clock) continue; const alt = Astro.altitude(tgt.ra, tgt.dec, Astro.lst(S.t, h + (h < 12 ? 24 : 0))); if (alt >= 28) { if (HOUR_CLOCK[h] > S.clock) { S.clock = HOUR_CLOCK[h]; tick(0); toast(`Waited until ${String(h).padStart(2, '0')}:00 for the field to rise.`, 3500); } S.hour = h; break; } } }
    const w = Astro.weather(S.t, S.hour), dark = Astro.moonDark(S.t);
    if (!isDark()) return panelScene('walk.jpg', 'Dome', ['Daylight. The slit is shut, the tube covered.', `Tonight: ${wxLine(S.t, 23)}`], [{ label: 'Wait for dark', sub: 'Up here, in the cold.', primary: true, fn: () => { S.clock = Math.max(S.clock, 1155); tick(0); dome(); } }, { label: 'Blink', sub: unblinked().length ? `${unblinked().length} pair${unblinked().length > 1 ? 's' : ''} waiting.` : 'Nothing waits at the comparator.', fn: () => goTo('comparator') }], { task: 'Nothing to expose until dark.' });
    const flatPref = Prefs.get('flatChart') || !Dome3D.available();
    const prs = pairs(); const labelled = S.plates.filter(p => !p.ruined).map(p => { const pr = prs.find(x => x.a === p || x.b === p); return { ra: p.ra, dec: p.dec, id: p.id, labelled: !!p.label, paired: !!pr, partner: pr ? (pr.a === p ? pr.b.id : pr.a.id) : null }; });
    const note = !w.ok ? `${wxLine(S.t, S.hour)} Nothing to expose.` : !dark ? 'The moon lights the sky. Faint objects drown in it.' : '';
    const panel = panelScene('plate_loading.jpg', 'Dome', [`${Astro.tempC(S.t)} °C. ${wxLine(S.t, S.hour)}`, note || 'Every frame is a plate you exposed. Red ones have labels. Double frames are pairs.'],
      note ? [{ label: 'Sleep', primary: true, sub: unblinked().length || undeveloped().length ? 'Sleep. Tomorrow, the darkroom and the comparator.' : 'Sleep until the next clear, dark evening.', fn: () => sleep(1) },
              { label: 'Blink', sub: unblinked().length ? `${unblinked().length} pair${unblinked().length > 1 ? 's' : ''} waiting.` : 'Nothing waits at the comparator.', fn: () => goTo('comparator') }]
           : [{ label: flatPref ? 'Click a field on the chart' : 'Expose', primary: true, sub: flatPref ? 'One frame is one plate.' : 'Turn the telescope first.', disabled: flatPref, fn: () => Dome3D.pick() },
              { label: 'Blink', sub: unblinked().length ? `${unblinked().length} pair${unblinked().length > 1 ? 's' : ''} waiting.` : 'Nothing waits at the comparator.', fn: () => goTo('comparator') }], { region: '', task: note ? 'No exposures tonight.' : flatPref ? 'Pick a field on the chart.' : 'Turn the telescope, then expose.' });
    if (note) { if (!w.ok && Astro.weather(S.t, 2).ok && dark && S.hour < 12 === false) panel.querySelector('.menu').prepend(Object.assign(el('button', 'primary', 'Wait for it to clear<small>It may open up after midnight.</small>'), { onclick: () => { S.clock = Math.max(S.clock, HOUR_CLOCK[1]); tick(0); dome(); } })); return; }
    panel.style.maxWidth = '380px'; if (!flatPref) panel.parentElement.classList.add('dome-room');
    const pick_ = (ra, dec) => { Dome3D.unmount(); expose(ra, dec); };
    const onHour = h => { S.clock = Math.max(S.clock, HOUR_CLOCK[h]); tick(0); Dome3D.unmount(); dome(); };
    if (flatPref) { SkyMap.render(scene(), { t: S.t, hour: S.hour, plates: labelled, pins: notePins(), onPick: pick_, onHour });
      if (Dome3D.available()) { const b = el('button', '', 'Dome view'); b.id = 'to-dome'; b.onclick = () => { Prefs.set('flatChart', false); dome(); }; $('#skymap-wrap .hours').appendChild(b); } }
    else { const btn = [...panel.querySelectorAll('.menu button')].find(b => b.textContent.startsWith('Expose')), sm = btn && btn.querySelector('small');
      Dome3D.mount(scene(), { t: S.t, hour: S.hour, plates: labelled, pins: notePins(), hazy: w.state === 'haze', onPick: pick_, onHour, onFlat: () => { Dome3D.unmount(); Prefs.set('flatChart', true); dome(); },
        onPointing: (cur, ok) => { if (!sm) return; const sf = ok && sameField(cur.ra, cur.dec);
          sm.textContent = !ok ? 'Too low. Point above the pines.' : sf ? (Astro.key(sf.t) === Astro.key(S.t) ? `Field of plate No. ${sf.id}, exposed tonight. A pair needs another night.` : `Field of plate No. ${sf.id}, ${Astro.fmtShort(sf.t)}. Same label makes a pair.`) : `${Astro.fieldStr(cur.ra, cur.dec)} · ${Astro.nearestRegion(cur.ra, cur.dec).name} · new field`; btn.disabled = !ok; } }); }
    if (S.slewTo && !flatPref) { const tgt = S.slewTo; setTimeout(() => Dome3D.slewTo(tgt.ra, tgt.dec), 600); } S.slewTo = null;
    Audio_.play('dome_slit_open', 0.5); Audio_.loop('amb_dome', 0.3, 4);
  }
  async function expose(ra, dec) {
    const name = `${Astro.fieldStr(ra, dec)} · ${Astro.nearestRegion(ra, dec).name}`;
    hud('Dome', name); $('#hud-nav').classList.add('hidden'); $('#flow').classList.add('hidden');
    Audio_.play('dome_rotate', 0.4); await wait(1200); Audio_.play('glass_plate_set', 0.5);
    const w = Astro.weather(S.t, S.hour);
    live = false;
    const res = await Expose.run({ regionName: name, ra, dec, planets: Astro.planets(S.t), minutes: 60, tempC: Astro.tempC(S.t), wind: w.wind, haze: w.state === 'haze', tired: S.energy < 0.33 });
    const plate = { id: S.nextId++, ra, dec, label: null, t: S.t, ruined: res.ruined, developed: false, haze: w.state === 'haze', wind: w.wind };
    live = true; S.plates.push(plate);
    tick(res.minutes + 15);
    if (S.energy - 0.1 <= 0.05) { plate.ruined = true; S.energy = 0; save(); return collapse('dome'); }
    S.energy = clamp(S.energy - 0.1, 0, 1);
    chronicle(res.ruined ? TEXT.logAuto.ruined(name) : TEXT.logAuto.exposed(name, res.minutes));
    Audio_.stop('amb_dome', 3); save();
    await wait(1500);
    if (res.ruined) return panelScene('walk.jpg', 'Dome', ['The plate is ruined. The stars trailed into lines.'], [{ label: 'Expose again', primary: !dawn(), disabled: dawn(), fn: dome }, { label: 'Sleep', primary: dawn(), sub: 'Until the afternoon.', fn: () => sleep(1) }], { task: 'Plate lost.' });
    labelPlate(plate);
  }
  // the plate sleeve is labelled by hand; what is written is what the plate will be known by
  function labelPlate(plate) {
    const twin = sameField(plate.ra, plate.dec), und = undeveloped().length;
    const panel = panelScene('plate_loading.jpg', 'Dome', [`The setting circles read <b>${Astro.fieldStr(plate.ra, plate.dec)}</b>.`,
      twin ? `The field of plate No. ${twin.id}, labelled ${Astro.fieldStr(twin.label.ra, twin.label.dec)}. Same label, same pair.` : 'One plate finds nothing. Expose this field again on another night, within two weeks, with the same label.'],
      [], { task: `Label plate No. ${plate.id}.` });
    $('#hud-nav').classList.add('hidden'); $('#flow').classList.add('hidden');
    const twinL = twin ? twin.label : null, pre = { ra: Astro.raStr(twinL ? twinL.ra : plate.ra), dec: Astro.decStr(twinL ? twinL.dec : plate.dec).replace('−', '-') };
    const form = el('div', 'label-form', `<label>RA <input id="lb-ra" value="${pre.ra}" autocomplete="off"></label><label>Dec <input id="lb-dec" value="${pre.dec}" autocomplete="off"></label>`);
    panel.insertBefore(form, panel.querySelector('.menu'));
    const menu = panel.querySelector('.menu');
    const dev = el('button', 'primary', `Label, develop<small>${und} plate${und === 1 ? '' : 's'} to the darkroom.</small>`);
    const again = el('button', '', `Label, expose again<small>${dawn() ? 'Dawn is coming.' : `It is ${hhmm(S.clock)}. The night is long.`}</small>`); again.disabled = dawn();
    menu.appendChild(dev); menu.appendChild(again);
    const ra = $('#lb-ra'), dec = $('#lb-dec'); ra.focus(); ra.select();
    const write = () => { const r = Astro.parseRA(ra.value), d = Astro.parseDec(dec.value); if (r == null || d == null) { toast('Write RA as hours and minutes, Dec as degrees.', 2500); return false; }
      plate.label = { ra: r, dec: d }; S.lastNote = S.t; Audio_.play('pencil_write', 0.5); tick(5); save(); return true; };
    again.onclick = () => { if (write()) dome(); };
    dev.onclick = () => { if (write()) goTo('darkroom'); };
    [ra, dec].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') dev.click(); }));
  }

  // ---------- discovery & epilogue ----------
  async function discovery(pr) {
    S.found = true; S.foundDate = S.t; S.done = true; save();
    chronicle(`${pairName(pr)}: object moved only a few millimetres in ${pr.days} days. Third plate agrees. That’s it.`);
    hideHud();
    await slides([{ img: 'closeup.jpg', lines: TEXT.discovery.lines },
      { img: 'discovery_plates.jpg', fit: 'contain', lines: ['The real discovery plates, 23 and 29 January 1930. Lowell Observatory Archives.'] }]);
    const histLine = Astro.key(S.t) === '1930-02-18' ? 'The same day as in history: 18 February 1930, around four in the afternoon.' : `In history, Tombaugh found it on 18 February 1930. You found it on ${Astro.fmt(S.t)}, after ${S.sessions} sessions and ${S.plates.length} plates.`;
    Audio_.loop('amb_epilogue', 0.3, 6);
    const findsLine = S.found_ids.length ? [`Along the way you also found ${S.found_ids.map(id => { const f = FINDS.list.find(x => x.id === id); return `${f.name} (${f.kind})`; }).join(', ')}. All of them real discoveries of Tombaugh’s.`] : [];
    await slides([{ img: 'comparator.jpg', lines: [histLine, ...findsLine] }, ...TEXT.epilogue]);
    Audio_.stop('amb_epilogue', 5);
    title();
  }

  // the whole mechanic on one screen
  function howTo(then) {
    const box = el('div', 'howto fade', `<div class="inner"><h1>How the search works</h1><ol>
      <li><b>Expose.</b> In the dome, turn the telescope to a field above the pines and expose a plate. One frame is one plate. An hour of guiding passes in seconds.</li>
      <li><b>Label.</b> Write the field on the sleeve. Only the label is remembered. Every exposed plate stays on the sky as a frame, red once labelled.</li>
      <li><b>Second plate.</b> Expose the same field again on another night, within two weeks, with the same label. Two plates of one field are a pair.</li>
      <li><b>Develop.</b> In the darkroom, pull each plate from the bath when the marker sits in the middle.</li>
      <li><b>Blink.</b> At the comparator, switch between plate A and B with the arrow keys. Stars stay. Anything that jumps gets a pencil ring and your guess.</li>
      <li><b>Check.</b> A third plate of the field settles every ring. Asteroids jump far, flaws vanish, Planet X creeps a few millimetres.</li></ol>
      <p>Coffee sharpens, sleep restores, and the notebook is the only memory. The moon ruins plates when it is bright.</p>
      <button id="howto-ok" class="primary">Got it</button></div>`);
    document.body.appendChild(box); $('#howto-ok').onclick = () => { box.remove(); if (then) then(); };
  }
  // light settings: sound, music, dome view
  function settings() {
    const old = $('#settings'); if (old) { old.remove(); return; }
    const box = el('div', '', ''); box.id = 'settings';
    const row = (label, get, set) => { const b = el('button', 'row', `<span>${label}</span><small>${get() ? 'On' : 'Off'}</small>`); b.onclick = () => { set(!get()); b.querySelector('small').textContent = get() ? 'On' : 'Off'; }; return b; };
    box.appendChild(el('h3', '', 'Settings'));
    box.appendChild(row('Sound', () => !Prefs.get('muted'), v => { if (!!Prefs.get('muted') === v) Audio_.toggleMute(); }));
    box.appendChild(row('Music', () => Prefs.get('music') !== false, v => { Prefs.set('music', v); Audio_.setMusic(v); }));
    box.appendChild(row('3D dome view', () => !Prefs.get('flatChart'), v => Prefs.set('flatChart', !v)));
    const ht = el('button', '', 'How the search works'); ht.onclick = () => { box.remove(); howTo(); }; box.appendChild(ht);
    const cr = el('button', '', 'Credits'); cr.onclick = () => { box.remove(); Dome3D.unmount(); credits(); }; box.appendChild(cr);
    const close = el('button', 'primary', 'Close'); close.onclick = () => box.remove(); box.appendChild(close);
    document.body.appendChild(box);
  }
  document.addEventListener('DOMContentLoaded', () => { title(); $('#audio-hint').textContent = 'Settings'; $('#audio-hint').onclick = () => { Audio_.init(); settings(); }; });
  return { get S() { return S; }, pairs, specFor };
})();
