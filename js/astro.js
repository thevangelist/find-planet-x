'use strict';
// Dates, moon, weather, sky regions. All astronomy is approximate but historically oriented.
const Astro = (() => {
  const FI_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const d = (y, m, day) => Date.UTC(y, m - 1, day);
  const DAY = 86400000;
  const key = t => new Date(t).toISOString().slice(0, 10);
  const fmt = t => { const x = new Date(t); return `${x.getUTCDate()} ${FI_MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
  const fmtShort = t => { const x = new Date(t); return `${x.getUTCDate()} ${FI_MONTHS[x.getUTCMonth()].slice(0, 3)}`; };

  // moon illumination 0..1; reference new moon 1930-01-29 19:07 UT (close to the Pluto plates)
  const NEW_MOON = Date.UTC(1930, 0, 29, 19, 7), SYNODIC = 29.530589 * DAY;
  function moonIllum(t) { const ph = (((t - NEW_MOON) % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC; return (1 - Math.cos(ph * 2 * Math.PI)) / 2; }
  const moonDark = t => moonIllum(t) < 0.45;

  // opposition RA in hours for a date (sun RA + 12h)
  function oppositionRA(t) {
    const x = new Date(t); const doy = (t - Date.UTC(x.getUTCFullYear(), 0, 1)) / DAY;
    const sunRA = (((doy - 79) / 365.25) * 24 + 24) % 24; return (sunRA + 12) % 24;
  }
  const raDiff = (a, b) => { let x = Math.abs(a - b) % 24; return x > 12 ? 24 - x : x; };

  // ecliptic regions Tombaugh's program worked through; ra in hours
  const REGIONS = [
    { id: 'cnc', name: 'Cancer', ra: 8.7, dec: 19 },
    { id: 'leo', name: 'Leo', ra: 10.3, dec: 12 },
    { id: 'crv', name: 'Corvus', ra: 12.3, dec: -18 },
    { id: 'vir', name: 'Virgo', ra: 13.0, dec: -4 },
    { id: 'lib', name: 'Libra', ra: 15.0, dec: -14 },
    { id: 'sco', name: 'Scorpius', ra: 16.4, dec: -20 },
    { id: 'sgr', name: 'Sagittarius', ra: 18.6, dec: -23 },
    { id: 'cap', name: 'Capricornus', ra: 20.6, dec: -18 },
    { id: 'aqr', name: 'Aquarius', ra: 22.2, dec: -9 },
    { id: 'psc', name: 'Pisces', ra: 0.6, dec: 5 },
    { id: 'ari', name: 'Aries', ra: 2.5, dec: 15 },
    { id: 'tau', name: 'Taurus', ra: 4.4, dec: 20 },
    { id: 'gem', name: 'Delta Geminorum', ra: 7.33, dec: 22, pluto: true },
    { id: 'gem2', name: 'Gemini, eastern part', ra: 7.9, dec: 24 },
  ];
  const raStr = ra => { const h = Math.floor(ra), m = Math.round((ra - h) * 60); return `${h}h ${String(m).padStart(2, '0')}m`; };
  function regionsFor(t) {
    const opp = oppositionRA(t);
    return REGIONS.map(r => ({ ...r, dist: raDiff(r.ra, opp) })).filter(r => r.dist < 4.2).sort((a, b) => a.dist - b.dist);
  }

  // Weather: a slow pressure-like random walk, thresholded by Flagstaff's monthly clear-night fraction.
  // Dry May–June, monsoon evenings in July–August that often clear after midnight, winter storms that last days.
  const CLEAR_FRAC = [0.90, 0.90, 0.91, 0.92, 0.95, 0.96, 0.88, 0.88, 0.93, 0.95, 0.93, 0.90];   // 4 to 12 percent of nights lost, by season
  const WX_START = Date.UTC(1928, 11, 1), wx = [];
  const invNorm = p => { const t = Math.sqrt(-2 * Math.log(p < .5 ? p : 1 - p)); const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t); return p < .5 ? -z : z; };
  function wxAt(t) {
    const n = Math.floor((t - WX_START) / DAY); if (n < 0) return { x: 1, gust: 0 };
    while (wx.length <= n) { const i = wx.length, r = rng(hashStr('wx' + i)); const prev = i ? wx[i - 1].x : 0.5; const g = gauss(r); wx.push({ x: 0.8 * prev + 0.6 * g, gust: Math.abs(g) }); }
    return wx[n];
  }
  const FORCED_CLEAR = ['1929-04-06', '1929-04-07', '1929-04-13', '1930-01-21', '1930-01-23', '1930-01-29'];
  // state for a date and local hour: clear | haze | cloud | storm, plus wind
  function weather(t, hour = 23) {
    const k = key(t), m = new Date(t).getUTCMonth(), w = wxAt(t), q = invNorm(1 - CLEAR_FRAC[m]);
    let x = w.x; if (m === 6 || m === 7) x += hour >= 1 && hour < 12 ? 0.45 : -0.35;   // monsoon: evening cells, clearing late
    let state = x > q + 0.35 ? 'clear' : x > q ? 'haze' : x > q - 1.1 ? 'cloud' : 'storm';
    if (FORCED_CLEAR.includes(k)) state = 'clear';
    const wind = w.gust > 1.1 || (x < q + 0.6 && x > q - 0.4 && w.gust > 0.6);
    return { state, wind, summer: m >= 5 && m <= 8, ok: state === 'clear' || state === 'haze' };
  }
  const clearNight = t => weather(t, 23).ok;
  const tempC = t => { const x = new Date(t), m = x.getUTCMonth(); const base = [-9, -7, -4, 0, 4, 9, 12, 11, 6, 0, -5, -9][m];
    return Math.round(base + gauss(rng(hashStr('t' + key(t)))) * 2 - (wxAt(t).x < 0 ? 2 : 0)); };

  // Flagstaff, Mars Hill: 35.20 N, 111.66 W, MST = UTC-7. Local sidereal time in hours for a local clock hour.
  const LAT = 35.2, LON = -111.66;
  function lst(t, localHour) { const ut = t + (localHour + 7) * 3600000; const D = (ut - Date.UTC(2000, 0, 1, 12)) / DAY;
    const gmst = (18.697374558 + 24.06570982441908 * D) % 24; return ((gmst + LON / 15) % 24 + 24) % 24; }
  function altitude(raH, decDeg, lstH) { const H = (lstH - raH) * 15 * Math.PI / 180, d = decDeg * Math.PI / 180, l = LAT * Math.PI / 180;
    return Math.asin(Math.sin(l) * Math.sin(d) + Math.cos(l) * Math.cos(d) * Math.cos(H)) * 180 / Math.PI; }
  const decStr = dec => `${dec >= 0 ? '+' : '−'}${Math.abs(dec).toFixed(0)}°`;
  const fieldStr = (raH, dec) => `${raStr(raH)} ${decStr(dec)}`;
  const nearestRegion = (raH, dec) => REGIONS.map(r => ({ r, d: Math.hypot(raDiff(r.ra, raH) * 15 * Math.cos(dec * Math.PI / 180), r.dec - dec) })).sort((x, y) => x.d - y.d)[0].r;
  // angular separation in degrees on a small field; ra in hours
  const sep = (ra1, dec1, ra2, dec2) => Math.hypot(raDiff(ra1, ra2) * 15 * Math.cos((dec1 + dec2) / 2 * Math.PI / 180), dec1 - dec2);
  const PLATE_RA_DEG = 14.7, PLATE_DEC_DEG = 12.2;
  const covers = (raH, dec, raH2, dec2) => Math.abs(raDiff(raH, raH2) * 15 * Math.cos(dec * Math.PI / 180)) < PLATE_RA_DEG / 2 - 0.3 && Math.abs(dec - dec2) < PLATE_DEC_DEG / 2 - 0.3;
  // parse hand-written labels: "7h 20m", "7 20", "7.33" ; "+22", "22°", "-14.5"
  function parseRA(s) { const m = String(s).trim().match(/^(\d{1,2})(?:[h\s:]+(\d{1,2}(?:\.\d+)?)m?)?$/); if (m) return (+m[1] + (m[2] ? +m[2] / 60 : 0)) % 24; const f = parseFloat(s); return isNaN(f) ? null : f % 24; }
  function parseDec(s) { const f = parseFloat(String(s).replace('−', '-').replace('°', '')); return isNaN(f) || f < -40 || f > 50 ? null : f; }

  // Planet positions (Schlyter's low-precision elements, ~1 degree), geocentric RA/Dec
  const EL = {
    Mercury: [48.3313, 3.24587e-5, 7.0047, 5e-8, 29.1241, 1.01444e-5, 0.387098, 0, 0.205635, 5.59e-10, 168.6562, 4.0923344368],
    Venus: [76.6799, 2.4659e-5, 3.3946, 2.75e-8, 54.891, 1.38374e-5, 0.72333, 0, 0.006773, -1.302e-9, 48.0052, 1.6021302244],
    Mars: [49.5574, 2.11081e-5, 1.8497, -1.78e-8, 286.5016, 2.92961e-5, 1.523688, 0, 0.093405, 2.516e-9, 18.6021, 0.5240207766],
    Jupiter: [100.4542, 2.76854e-5, 1.303, -1.557e-7, 273.8777, 1.64505e-5, 5.20256, 0, 0.048498, 4.469e-9, 19.895, 0.0830853001],
    Saturn: [113.6634, 2.3898e-5, 2.4886, -1.081e-7, 339.3939, 2.97661e-5, 9.55475, 0, 0.055546, -9.499e-9, 316.967, 0.0334442282],
    Uranus: [74.0005, 1.3978e-5, 0.7733, 1.9e-8, 96.6612, 3.0565e-5, 19.18171, -1.55e-8, 0.047318, 7.45e-9, 142.5905, 0.011725806],
    Neptune: [131.7806, 3.0173e-5, 1.77, -2.55e-7, 272.8461, -6.027e-6, 30.05826, 3.313e-8, 0.008606, 2.15e-9, 260.2471, 0.005995147],
  };
  const R = Math.PI / 180;
  function helio(e, dd) { const N = (e[0] + e[1] * dd) * R, i = (e[2] + e[3] * dd) * R, w = (e[4] + e[5] * dd) * R, a = e[6] + e[7] * dd, ec = e[8] + e[9] * dd, M = ((e[10] + e[11] * dd) % 360) * R;
    let E = M + ec * Math.sin(M) * (1 + ec * Math.cos(M)); for (let k = 0; k < 6; k++) E = E - (E - ec * Math.sin(E) - M) / (1 - ec * Math.cos(E));
    const xv = a * (Math.cos(E) - ec), yv = a * Math.sqrt(1 - ec * ec) * Math.sin(E), v = Math.atan2(yv, xv), r = Math.hypot(xv, yv);
    return { x: r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i)), y: r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i)), z: r * Math.sin(v + w) * Math.sin(i), r }; }
  function planets(t) {
    const dd = (t - Date.UTC(1999, 11, 31)) / DAY, ecl = (23.4393 - 3.563e-7 * dd) * R;
    const ws = (282.9404 + 4.70935e-5 * dd) * R, es = 0.016709 - 1.151e-9 * dd, Ms = ((356.047 + 0.9856002585 * dd) % 360) * R;
    const Es = Ms + es * Math.sin(Ms) * (1 + es * Math.cos(Ms)), xs0 = Math.cos(Es) - es, ys0 = Math.sqrt(1 - es * es) * Math.sin(Es);
    const vs = Math.atan2(ys0, xs0), rs = Math.hypot(xs0, ys0), xs = rs * Math.cos(vs + ws), ys = rs * Math.sin(vs + ws);
    return Object.entries(EL).map(([name, e]) => { const h = helio(e, dd); const xg = h.x + xs, yg = h.y + ys, zg = h.z;
      const xe = xg, ye = yg * Math.cos(ecl) - zg * Math.sin(ecl), ze = yg * Math.sin(ecl) + zg * Math.cos(ecl);
      let ra = Math.atan2(ye, xe) * 12 / Math.PI; if (ra < 0) ra += 24; const dec = Math.atan2(ze, Math.hypot(xe, ye)) / R;
      return { name, ra, dec, dist: Math.hypot(xg, yg, zg) }; });
  }
  return { d, DAY, key, fmt, fmtShort, moonIllum, moonDark, oppositionRA, regionsFor, REGIONS, raStr, decStr, fieldStr, nearestRegion, sep, covers, clearNight, weather, tempC, FI_MONTHS, planets,
    lst, altitude, parseRA, parseDec, PLATE_RA_DEG, PLATE_DEC_DEG, raDiff };
})();
