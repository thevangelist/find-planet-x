'use strict';
// Real discoveries Tombaugh made with the 13-inch astrograph and the blink comparator.
// Dates are the historical discovery dates; each find sits on plates of its region for a window around them.
const FINDS = (() => {
  const d = (y, m, dd) => Date.UTC(y, m - 1, dd);
  const list = [
    { id: 'annette', kind: 'asteroid', prov: '1929 TP', name: '2839 Annette', note: 'named for his daughter', t: d(1929, 10, 5), mag: 14.6 },
    { id: 'burdett', kind: 'asteroid', prov: '1929 TQ', name: '3583 Burdett', note: 'named for his home town in Kansas', t: d(1929, 10, 5), mag: 15.0 },
    { id: 'brendalee', kind: 'asteroid', prov: '1929 TK', name: '3824 Brendalee', note: 'named for his granddaughter', t: d(1929, 10, 5), mag: 15.3 },
    { id: 'mckellar', kind: 'asteroid', prov: '1929 UA', name: '7150 McKellar', note: 'named for astronomer Andrew McKellar', t: d(1929, 10, 11), mag: 15.4 },
    { id: 'baltuck', kind: 'asteroid', prov: '1929 VD', name: '5701 Baltuck', note: 'named for a family friend', t: d(1929, 11, 3), mag: 15.6 },
    { id: 'haritina', kind: 'asteroid', prov: '1930 UB', name: '7101 Haritina', note: 'numbered only in the 1990s', t: d(1930, 10, 17), mag: 15.2 },
    { id: 'shawna', kind: 'asteroid', prov: '1930 XK', name: '4510 Shawna', note: 'named for a granddaughter', t: d(1930, 12, 13), mag: 15.1 },
    { id: 'alden', kind: 'asteroid', prov: '1930 YV', name: '2941 Alden', note: 'named for his son', t: d(1930, 12, 24), mag: 14.9 },
    { id: 'patsy', kind: 'asteroid', prov: '1931 TS2', name: '3310 Patsy', note: 'named for his wife Patricia', t: d(1931, 10, 9), mag: 15.3 },
    { id: 'kathleen', kind: 'asteroid', prov: '1931 FM', name: '3754 Kathleen', note: 'named for a family member', t: d(1931, 3, 16), mag: 15.5 },
    { id: 'ellenbeth', kind: 'asteroid', prov: '1931 TC2', name: '3775 Ellenbeth', note: 'named for a family member', t: d(1931, 10, 6), mag: 15.6 },
    { id: 'nicky', kind: 'asteroid', prov: '1931 TM3', name: '4755 Nicky', note: 'named for a family member', t: d(1931, 10, 6), mag: 15.7 },
    { id: 'td3', kind: 'asteroid', prov: '1931 TD3', name: '8778 (1931 TD3)', note: 'numbered only decades later', t: d(1931, 10, 10), mag: 15.9 },
    { id: 'comet1931', kind: 'comet', prov: 'C/1931 AN1', name: 'Comet Tombaugh', note: 'his only comet, a faint diffuse smudge with a short tail', t: d(1931, 1, 25), mag: 13.5 },
    { id: 'tvcrv', kind: 'variable', prov: 'Tombaugh’s Star', name: 'TV Corvi', note: 'a dwarf nova: the same star, three magnitudes brighter on one plate', t: d(1931, 3, 23), mag: 16.5, region: 'crv', ra: 12.34, dec: -18.45 },
  ];
  const WINDOW = 18 * Astro.DAY;
  // region: the ecliptic region at opposition on the discovery date, unless fixed
  list.forEach(f => { if (!f.region) { const opp = Astro.oppositionRA(f.t); f.region = Astro.REGIONS.map(r => ({ r, d: Math.min(Math.abs(r.ra - opp), 24 - Math.abs(r.ra - opp)) })).sort((a, b) => a.d - b.d)[0].r.id; } });
  // sky position: real where known, otherwise a deterministic spot inside the region's field
  list.forEach(f => { if (f.ra == null) { const r = rng(hashStr('find' + f.id)), reg = Astro.REGIONS.find(x => x.id === f.region); f.ra = reg.ra + (r() - 0.5) * 0.7; f.dec = reg.dec + (r() - 0.5) * 8; } });
  const onPlates = (raH, dec, tA, tB) => list.filter(f => Astro.covers(raH, dec, f.ra, f.dec) && tA > f.t - WINDOW && tB < f.t + WINDOW);
  return { list, onPlates };
})();
