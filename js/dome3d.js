'use strict';
// First-person pointing on Mars Hill: the real sky for the night and hour, the dome and the pines, a plate frame
// in the middle of the view. Drag to turn, wheel to zoom, click "Expose here" or press Enter.
const Dome3D = (() => {
  const R = Math.PI / 180, LAT = 35.2 * R, SKY = 900;
  let renderer, scene, camera, raf, frame, state, overlay, onKey, onKeyUp, dome, domeYaw, rumbling = false, lastT = 0;
  const dir = (alt, az) => new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az));
  function altAz(raH, decDeg, lst) { const H = (lst - raH) * 15 * R, d = decDeg * R;
    const alt = Math.asin(Math.sin(LAT) * Math.sin(d) + Math.cos(LAT) * Math.cos(d) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT) - Math.tan(d) * Math.cos(LAT)) + Math.PI; return { alt, az }; }
  function raDec(alt, az, lst) { const sd = Math.sin(LAT) * Math.sin(alt) + Math.cos(LAT) * Math.cos(alt) * Math.cos(az), dec = Math.asin(sd);
    const H = Math.atan2(-Math.sin(az) * Math.cos(alt) / Math.cos(dec), (Math.sin(alt) - Math.sin(LAT) * sd) / (Math.cos(LAT) * Math.cos(dec)));
    let ra = lst - H * 12 / Math.PI; ra = ((ra % 24) + 24) % 24; return { ra, dec: dec / R }; }
  const galRaDec = (l, b) => { const aG = 192.859 * R, dG = 27.128 * R, lN = 122.932 * R, L = l * R, B = b * R;
    const sd = Math.sin(B) * Math.sin(dG) + Math.cos(B) * Math.cos(dG) * Math.cos(lN - L);
    const da = Math.atan2(Math.cos(B) * Math.sin(lN - L), Math.sin(B) * Math.cos(dG) - Math.cos(B) * Math.sin(dG) * Math.cos(lN - L));
    let ra = (aG + da) * 12 / Math.PI; return { ra: ((ra % 24) + 24) % 24, dec: Math.asin(sd) / R }; };
  const eclRaDec = lon => { const EPS = 23.44 * R, l = lon * R; let ra = Math.atan2(Math.cos(EPS) * Math.sin(l), Math.cos(l)) * 12 / Math.PI; if (ra < 0) ra += 24; return { ra, dec: Math.asin(Math.sin(EPS) * Math.sin(l)) / R }; };

  // galactic coordinates from equatorial (J2000 pole and node)
  const galactic = (raH, decDeg) => { const aG = 192.859 * R, dG = 27.128 * R, lN = 122.932 * R, a = raH * 15 * R, dd = decDeg * R;
    const sb = Math.sin(dd) * Math.sin(dG) + Math.cos(dd) * Math.cos(dG) * Math.cos(a - aG);
    const l = lN - Math.atan2(Math.cos(dd) * Math.sin(a - aG), Math.sin(dd) * Math.cos(dG) - Math.cos(dd) * Math.sin(dG) * Math.cos(a - aG));
    return { l: ((l / R) % 360 + 360) % 360, b: Math.asin(sb) / R }; };
  // value noise for the cloud structure of the band
  const vhash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = vhash(xi, yi), b = vhash(xi + 1, yi), c = vhash(xi, yi + 1), dd = vhash(xi + 1, yi + 1); return (a + (b - a) * sx) + ((c + (dd - c) * sx) - (a + (b - a) * sx)) * sy; }
  const fbm = (x, y) => 0.5 * vnoise(x, y) + 0.3 * vnoise(x * 2.1 + 7, y * 2.1 + 3) + 0.2 * vnoise(x * 4.3 + 11, y * 4.3 + 5);
  // the Milky Way for this night, painted in horizontal coordinates onto the sky sphere
  let lastMW = null;
  function milkyWayTexture(lst) {
    const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H), px = img.data;
    for (let j = 0; j < H; j++) { const alt = ((j + 0.5) / H - 0.5) * Math.PI; if (alt < -0.12) continue;
      for (let i = 0; i < W; i++) { const az = (270 - 360 * (i + 0.5) / W) * R; const rd = raDec(alt, az, lst); const gal = galactic(rd.ra, rd.dec);
        if (Math.abs(gal.b) > 28) continue;
        const dl = Math.min(Math.abs(gal.l), 360 - Math.abs(gal.l)), sig = 5.5 + 5 * Math.exp(-(dl * dl) / (2 * 55 * 55));
        let I = Math.exp(-(gal.b * gal.b) / (2 * sig * sig)) * (0.5 + 0.9 * Math.exp(-(dl * dl) / (2 * 50 * 50)));
        const n = fbm(gal.l / 7, gal.b / 4); I *= 0.45 + 1.1 * n;
        const rift = Math.exp(-((gal.b - 2) * (gal.b - 2)) / (2 * 2.2 * 2.2)) * Math.exp(-((gal.l - 32) * (gal.l - 32)) / (2 * 28 * 28)); I *= 1 - 0.75 * rift;
        I = Math.min(1, I); if (I < 0.02) continue;
        const k = (j * W + i) * 4, warm = Math.exp(-(dl * dl) / (2 * 30 * 30));
        px[k] = 185 + 45 * warm; px[k + 1] = 190 + 20 * warm; px[k + 2] = 215 - 25 * warm; px[k + 3] = Math.round(I * 120); } }
    g.putImageData(img, 0, 0); lastMW = c; const t = new THREE.CanvasTexture(c); t.flipY = false; t.wrapS = THREE.RepeatWrapping; return t;   // row 0 is the horizon below, no flip
  }
  // star colour from B-V: blue-white at -0.2, white near 0.4, yellow at 0.8, orange past 1.3. Subtle, as the eye sees it.
  const bvColor = ci => { const t = clamp((ci + 0.2) / 1.7, 0, 1); return [0.78 + 0.22 * t, 0.86 + 0.08 * (1 - Math.abs(t - 0.4) * 1.5), 1.0 - 0.32 * t]; };
  function pointCloud(items, color, lst, { sizeOf, alphaOf, colorOf }) {
    const pos = [], size = [], alpha = [], cols = [];
    items.forEach(it => { const p = altAz(it.ra, it.dec, lst); const v = dir(p.alt, p.az).multiplyScalar(SKY); pos.push(v.x, v.y, v.z); size.push(sizeOf(it)); alpha.push(alphaOf(it)); const c = colorOf ? colorOf(it) : null; cols.push(...(c || [1, 1, 1])); });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1)); geo.setAttribute('alpha', new THREE.Float32BufferAttribute(alpha, 1)); geo.setAttribute('tint', new THREE.Float32BufferAttribute(cols, 3));
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { col: { value: new THREE.Color(color) } },
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 tint; varying float vA; varying vec3 vT; void main(){ vA = alpha; vT = tint; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 col; varying float vA; varying vec3 vT; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float a = (1.0 - d * d) * vA; gl_FragColor = vec4(col * vT, a); }' });
    return new THREE.Points(geo, mat);
  }
  // a soft glow sprite: nebulae, galaxies, moonlight, planet halos
  function glowSprite(w, h, rgb, alpha, core = 0.1) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
    g.translate(128, 128); g.scale(1, h / w);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 120); gr.addColorStop(0, `rgba(${rgb},${alpha})`); gr.addColorStop(core, `rgba(${rgb},${alpha * 0.8})`); gr.addColorStop(0.5, `rgba(${rgb},${alpha * 0.3})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 120, 0, 7); g.fill();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.set(w, w, 1); return sp;
  }
  // the moon with its phase drawn, and its light on the sky
  function moonSprite(ill, waxing, size) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#1a1b20'; g.beginPath(); g.arc(64, 64, 40, 0, 7); g.fill();
    g.fillStyle = '#e8e4d8'; g.beginPath(); const k = Math.cos(ill * Math.PI);   // terminator as an ellipse
    g.save(); g.translate(64, 64); if (waxing) g.scale(-1, 1); g.beginPath(); g.arc(0, 0, 40, -Math.PI / 2, Math.PI / 2, true); g.ellipse(0, 0, 40 * Math.abs(k), 40, 0, Math.PI / 2, -Math.PI / 2, k < 0); g.fill(); g.restore();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); sp.scale.set(size, size, 1); return sp;
  }
  function labelSprite(text, color, dot = true) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    if (dot) { g.fillStyle = color; g.beginPath(); g.arc(40, 64, 10, 0, 7); g.fill(); }
    g.font = '600 54px "IBM Plex Sans", sans-serif'; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, dot ? 64 : 10, 64);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); sp.scale.set(200, 50, 1); sp.center.set(dot ? 0.08 : 0, 0.5); return sp;
  }
  function skyLine(points, color, dashed) { const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 8, gapSize: 8, transparent: true, opacity: .7 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity: .9 });
    const l = new THREE.Line(geo, mat); if (dashed) l.computeLineDistances(); return l; }
  function plateFrame(ra, dec, lst, color, scale = 1) { const w = Astro.PLATE_RA_DEG / 15 / Math.max(0.4, Math.cos(dec * R)) / 2 * scale, h = Astro.PLATE_DEC_DEG / 2 * scale;
    const pts = [[ra + w, dec + h], [ra - w, dec + h], [ra - w, dec - h], [ra + w, dec - h], [ra + w, dec + h]].map(([a, d]) => { const p = altAz(a, d, lst); return dir(p.alt, p.az).multiplyScalar(SKY - 5); });
    return skyLine(pts, color, false); }
  // painted, riveted sheet metal with seams and grime for the astrograph tubes
  function tubeTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d'), r = rng(13);
    g.fillStyle = '#4b4740'; g.fillRect(0, 0, 512, 512);
    const img = g.getImageData(0, 0, 512, 512), px = img.data;
    for (let i = 0; i < px.length; i += 4) { const n = (r() - 0.5) * 22; px[i] += n; px[i + 1] += n; px[i + 2] += n - 2; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 40; i++) { const x = r() * 512, y = r() * 512, w = 30 + r() * 120, h = 6 + r() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, w);
      gr.addColorStop(0, `rgba(20,18,14,${0.1 + r() * 0.2})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - w, y - h, w * 2, h * 2); }
    // seams along the length with rivets either side
    [0, 128, 256, 384].forEach(y => { g.strokeStyle = 'rgba(15,13,10,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(512, y + 0.5); g.stroke();
      g.strokeStyle = 'rgba(120,114,100,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y + 2.5); g.lineTo(512, y + 2.5); g.stroke();
      for (let x = 8; x < 512; x += 24) [y - 7, y + 9].forEach(yy => { g.fillStyle = '#2a2722'; g.beginPath(); g.arc(x, yy, 2.6, 0, 7); g.fill(); g.fillStyle = 'rgba(160,150,130,.5)'; g.beginPath(); g.arc(x - 0.8, yy - 0.8, 1.1, 0, 7); g.fill(); }); });
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
  }
  // riveted steel plates of the dome, with vertical ribs and grime
  function domeTexture() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d'), r = rng(31);
    g.fillStyle = '#5a5146'; g.fillRect(0, 0, 1024, 512);
    const img = g.getImageData(0, 0, 1024, 512), px = img.data;
    for (let i = 0; i < px.length; i += 4) { const n = (r() - 0.5) * 26; px[i] += n; px[i + 1] += n; px[i + 2] += n - 3; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 60; i++) { const x = r() * 1024, y = r() * 512, w = 40 + r() * 160; const gr = g.createRadialGradient(x, y, 0, x, y, w);
      gr.addColorStop(0, `rgba(25,20,14,${0.12 + r() * 0.25})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - w, y - w, w * 2, w * 2); }
    for (let x = 0; x < 1024; x += 128) { g.fillStyle = '#2e2922'; g.fillRect(x, 0, 10, 512); g.fillStyle = 'rgba(150,140,120,.35)'; g.fillRect(x + 10, 0, 2, 512); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 2, 0, 2, 512);
      for (let y = 12; y < 512; y += 28) { g.fillStyle = '#1f1b16'; g.beginPath(); g.arc(x + 5, y, 2.6, 0, 7); g.fill(); g.fillStyle = 'rgba(190,180,160,.45)'; g.beginPath(); g.arc(x + 4.2, y - 0.8, 1, 0, 7); g.fill(); } }
    [128, 256, 384].forEach(y => { g.fillStyle = 'rgba(15,13,10,.6)'; g.fillRect(0, y, 1024, 2); g.fillStyle = 'rgba(150,140,120,.25)'; g.fillRect(0, y + 2, 1024, 1); });
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 2); return t;
  }
  function pineTexture() { const c = document.createElement('canvas'); c.width = 2048; c.height = 256; const g = c.getContext('2d'); const r = rng(7);
    g.fillStyle = '#020306'; let x = 0; while (x < 2048) { const w = 18 + r() * 40, h = 90 + r() * 150; g.beginPath(); g.moveTo(x, 256); g.lineTo(x + w / 2, 256 - h); g.lineTo(x + w, 256); g.fill();
      for (let k = 1; k < 4; k++) { const y = 256 - h * k / 4; g.beginPath(); g.moveTo(x - w * 0.15 * k / 3, y); g.lineTo(x + w / 2, y - h * 0.25); g.lineTo(x + w + w * 0.15 * k / 3, y); g.fill(); } x += w * 0.7; }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); return t; }

  function build(container, opts) {
    state = { yaw: 180 * R, pitch: 40 * R, fov: 60, lst: Astro.lst(opts.t, opts.hour + (opts.hour < 12 ? 24 : 0)), opts };
    scene = new THREE.Scene(); scene.background = new THREE.Color('#05060b');
    camera = new THREE.PerspectiveCamera(state.fov, 1, 0.5, 3000); scene.add(camera);
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.domElement.id = 'dome3d'; container.appendChild(renderer.domElement);
    const lst = state.lst;
    // stars: catalogue, faint filler, Milky Way
    scene.add(pointCloud(BRIGHT_STARS.map(s => ({ ra: s[0], dec: s[1], m: s[2], ci: s[3] ?? 0.6 })), '#f4f1ea', lst, { sizeOf: s => Math.max(2, (6 - s.m) * 1.7), alphaOf: s => Math.min(1, 0.35 + (5.6 - s.m) * 0.2), colorOf: s => bvColor(s.ci) }));
    const r = rng(1930), faint = [], mw = [];
    for (let i = 0; i < 7000; i++) faint.push({ ra: r() * 24, dec: Math.asin(r() * 2 - 1) / R });
    for (let i = 0; i < 9000; i++) { const p = galRaDec(r() * 360, gauss(r) * 6); mw.push(p); }
    scene.add(pointCloud(faint, '#d8d5cc', lst, { sizeOf: () => 1.6, alphaOf: () => 0.35 }));
    scene.add(pointCloud(mw, '#cfd3e0', lst, { sizeOf: () => 2.2, alphaOf: () => 0.12 }));
    const mwSphere = new THREE.Mesh(new THREE.SphereGeometry(SKY - 40, 64, 32), new THREE.MeshBasicMaterial({ map: milkyWayTexture(lst), transparent: true, opacity: 0.55, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(mwSphere);
    // ecliptic
    scene.add(skyLine(Array.from({ length: 181 }, (_, i) => { const e = eclRaDec(i * 2); const p = altAz(e.ra, e.dec, lst); return dir(p.alt, p.az).multiplyScalar(SKY - 10); }), '#d6685c', true));
    // nebulae, galaxies and clusters at their catalogue size and place
    Sky.DSO.forEach(o => { const a = altAz(o[0], o[1], lst); if (a.alt < -0.05) return; const pos = dir(a.alt, a.az).multiplyScalar(SKY - 35);
      const w = Math.max(6, o[2] / 60 * (SKY / 57.3) * 1.3), h = Math.max(6, o[3] / 60 * (SKY / 57.3) * 1.3), k = o[6];
      if (o[5] === 'gal' || o[5] === 'neb') { const sp = glowSprite(w, h, o[5] === 'neb' ? '214,196,200' : '200,205,220', 0.42 * k, 0.12); sp.position.copy(pos); sp.material.rotation = -o[4] * R; scene.add(sp); }
      else { const rr = rng(hashStr('cl' + o[7])); const n = o[5] === 'glob' ? 120 : 40; const pts = []; for (let i = 0; i < n; i++) { const rad = (o[5] === 'glob' ? Math.abs(gauss(rr)) * 0.3 : Math.sqrt(rr())) * o[2] / 60 / 2, ang = rr() * Math.PI * 2; pts.push({ ra: o[0] + rad * Math.cos(ang) / 15 / Math.cos(o[1] * R), dec: o[1] + rad * Math.sin(ang) }); }
        scene.add(pointCloud(pts, '#eef0ff', lst, { sizeOf: () => 1.8, alphaOf: () => 0.5 * k }));
        if (o[5] === 'glob') { const sp = glowSprite(w * 0.8, w * 0.8, '225,222,215', 0.5 * k, 0.15); sp.position.copy(pos); scene.add(sp); } } });
    // planets, moon, landmarks
    const PCOL = { Mercury: '220,210,190', Venus: '245,240,220', Mars: '235,160,120', Jupiter: '240,225,190', Saturn: '235,220,180', Uranus: '180,220,220', Neptune: '160,180,240' }, PMAG = { Mercury: 0.2, Venus: -4, Mars: 0.5, Jupiter: -2.3, Saturn: 0.7, Uranus: 5.7, Neptune: 7.8 };
    Astro.planets(opts.t).forEach(p => { const a = altAz(p.ra, p.dec, lst); if (a.alt < -0.05) return; const pos = dir(a.alt, a.az).multiplyScalar(SKY - 20);
      const bright = clamp((6 - PMAG[p.name]) / 10, 0.12, 1); const halo = glowSprite(6 + bright * 26, 6 + bright * 26, PCOL[p.name], 0.9, 0.18); halo.position.copy(pos); scene.add(halo);
      const s = labelSprite(p.name, '#f0d9a0', false); s.position.copy(pos.clone().multiplyScalar(0.99)); s.position.y += 10; scene.add(s); });
    const ill = Astro.moonIllum(opts.t); if (ill > 0.03) { const NEW_MOON = Date.UTC(1930, 0, 29, 19, 7), SYN = 29.530589 * Astro.DAY, ph = ((((opts.t - NEW_MOON) % SYN) + SYN) % SYN) / SYN;
      const x = new Date(opts.t), doy = (opts.t - Date.UTC(x.getUTCFullYear(), 0, 1)) / Astro.DAY, sl = ((doy - 79.5) / 365.25) * 360, mp = eclRaDec(sl + ph * 360), a = altAz(mp.ra, mp.dec, lst);
      if (a.alt > -0.05) { const pos = dir(a.alt, a.az).multiplyScalar(SKY - 20), waxing = ph < 0.5; const m = moonSprite(ill, waxing, 16); m.position.copy(pos); scene.add(m);
        const hazy = opts.hazy ? 2.2 : 1; const gl = glowSprite(60 + ill * 160 * hazy, 60 + ill * 160 * hazy, '200,205,225', 0.18 + ill * 0.35, 0.05); gl.position.copy(pos.clone().multiplyScalar(0.98)); scene.add(gl);
        const s = labelSprite(`Moon ${Math.round(ill * 100)}%`, '#e6e2d6', false); s.position.copy(pos.clone().multiplyScalar(0.97)); s.position.y -= 14; scene.add(s); } }
    [[0.712, 41.27, 'M31'], [5.588, -5.39, 'M42'], [3.79, 24.1, 'Pleiades'], [8.67, 19.98, 'M44'], [6.15, 24.33, 'M35'], [16.69, 36.46, 'M13'], [18.06, -24.38, 'M8'], [1.56, 30.66, 'M33'], [4.47, 15.87, 'Hyades']].forEach(([ra, dec, n]) => {
      const a = altAz(ra, dec, lst); if (a.alt < 0) return; const s = labelSprite(n, '#96bedc'); s.position.copy(dir(a.alt, a.az).multiplyScalar(SKY - 20)); scene.add(s); });
    STAR_NAMES.forEach(([ra, dec, n]) => { const m = BRIGHT_STARS.find(s => s[0] === ra && s[1] === dec); if (!m || m[2] > 1.0) return; const a = altAz(ra, dec, lst); if (a.alt < 0) return;
      const s = labelSprite(n, '#a0978a', false); s.position.copy(dir(a.alt, a.az).multiplyScalar(SKY - 20)); s.scale.set(150, 38, 1); scene.add(s); });
    // hand-written labels
    // every exposed plate is a frame: red with its number when labelled, grey when not, double when paired
    const drawn = new Set();
    opts.plates.forEach(p => { const col = p.labelled ? '#c7261e' : '#6e6760'; scene.add(plateFrame(p.ra, p.dec, lst, col)); if (p.paired) scene.add(plateFrame(p.ra, p.dec, lst, col, 0.93));
      const key = `${p.ra.toFixed(1)}|${p.dec.toFixed(0)}`; if (drawn.has(key)) return; drawn.add(key);
      const a = altAz(p.ra, p.dec, lst), txt = !p.labelled ? `No. ${p.id}, no label` : p.paired ? `No. ${Math.min(p.id, p.partner)} + ${Math.max(p.id, p.partner)}, pair` : `No. ${p.id}`;
      const s = labelSprite(txt, p.labelled ? '#e6dcc4' : '#8d8578', false); s.position.copy(dir(a.alt, a.az).multiplyScalar(SKY - 25)); s.scale.set(200, 50, 1); scene.add(s); });
    // the player's own notes with a position
    (opts.pins || []).forEach(n => { const a = altAz(n.ra, n.dec, lst); if (a.alt < -0.1) return; const s = labelSprite(n.text, '#d8cdb4'); s.position.copy(dir(a.alt, a.az).multiplyScalar(SKY - 30)); s.scale.set(260, 65, 1); scene.add(s); });
    // ground, pines, buildings
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1200, 48), new THREE.MeshBasicMaterial({ color: '#0c0e16' })); ground.rotation.x = -Math.PI / 2; ground.position.y = -3; scene.add(ground);
    const pines = new THREE.Mesh(new THREE.CylinderGeometry(300, 300, 70, 96, 1, true), new THREE.MeshBasicMaterial({ map: pineTexture(), transparent: true, side: THREE.BackSide, depthWrite: false })); pines.position.y = 32; scene.add(pines);
    const domeMat = new THREE.MeshBasicMaterial({ color: '#17140f' }), domeEdge = new THREE.MeshBasicMaterial({ color: '#2a2419', wireframe: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 34, 32), domeMat); base.position.set(-150, 14, -190); scene.add(base);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); cap.position.set(-150, 31, -190); scene.add(cap);
    const capW = new THREE.Mesh(new THREE.SphereGeometry(42.3, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeEdge); capW.position.copy(cap.position); scene.add(capW);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(6, 44, 2), new THREE.MeshBasicMaterial({ color: '#07080c' })); slit.position.set(-150, 50, -150); slit.rotation.x = -0.6; scene.add(slit);
    const admin = new THREE.Mesh(new THREE.BoxGeometry(140, 26, 60), domeMat); admin.position.set(170, 10, -230); scene.add(admin);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(70, 24, 4), new THREE.MeshBasicMaterial({ color: '#1d1913' })); roof.position.set(170, 35, -230); roof.rotation.y = Math.PI / 4; scene.add(roof);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(6, 8), new THREE.MeshBasicMaterial({ color: '#8a5a2a' })); win.position.set(140, 12, -199.5); scene.add(win);
    // we stand at the eyepiece inside the dome; the dome turns to follow the tube
    scene.add(new THREE.AmbientLight(0x6b6456, 0.75)); const moon = new THREE.DirectionalLight(0x9fb0d0, 0.7); moon.position.set(30, 80, -20); scene.add(moon);
    const lamp = new THREE.PointLight(0xffd9a0, 0.35, 60); lamp.position.set(-8, 2, 6); scene.add(lamp);
    const DR = 26, HW = DR * 0.38;   // slit of constant width, horizon to just past the zenith
    dome = new THREE.Group(); scene.add(dome); domeYaw = state.yaw;
    const inner = new THREE.MeshLambertMaterial({ color: '#7a7064', emissive: '#0c0a08', map: domeTexture(), side: THREE.DoubleSide });
    const inSlit = (x, y, z) => Math.abs(x) < HW && z < DR * 0.3;
    const shell = (radius, nA, nT) => { const pos = [], idx = []; const P = (i, j) => { const a = i / nA * Math.PI * 2, t = j / nT * (Math.PI / 2 + 0.22); return [radius * Math.cos(t) === 0 ? 0 : radius * Math.sin(t) * Math.sin(a), radius * Math.cos(t), -radius * Math.sin(t) * Math.cos(a)]; };
      for (let j = 0; j <= nT; j++) for (let i = 0; i <= nA; i++) pos.push(...P(i, j));
      for (let j = 0; j < nT; j++) for (let i = 0; i < nA; i++) { const c = [P(i, j), P(i + 1, j), P(i, j + 1), P(i + 1, j + 1)].reduce((s, q) => [s[0] + q[0] / 4, s[1] + q[1] / 4, s[2] + q[2] / 4], [0, 0, 0]);
        if (inSlit(...c)) continue; const a = j * (nA + 1) + i, b = a + 1, cc = a + nA + 1, dd = cc + 1; idx.push(a, cc, b, b, cc, dd); }
      const uv = []; for (let j = 0; j <= nT; j++) for (let i = 0; i <= nA; i++) uv.push(i / nA, j / nT);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return geo; };
    dome.add(new THREE.Mesh(shell(DR, 180, 48), inner));
    // shutter rails along both edges of the slit
    [HW, -HW].forEach(x => { const rho = Math.sqrt(DR * DR - x * x), pts = []; for (let t = Math.PI / 2 + 0.2; t >= -0.3; t -= 0.04) pts.push(new THREE.Vector3(x, rho * Math.cos(t), -rho * Math.sin(t)));
      dome.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#9a8c73' }))); });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(DR, 48), new THREE.MeshLambertMaterial({ color: '#141109' })); floor.rotation.x = -Math.PI / 2; floor.position.y = -DR * 0.21; scene.add(floor);
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 5, 16), new THREE.MeshLambertMaterial({ color: '#2b2620' })); pier.position.set(0, -4.5, -1.5); scene.add(pier);
    // the astrograph: a long main tube with two guide tubes, riding with the view
    const tubeTex = tubeTexture(); const tubeMat = new THREE.MeshLambertMaterial({ color: '#a9a399', map: tubeTex }), brass = new THREE.MeshLambertMaterial({ color: '#7a6c45' });
    const tubes = new THREE.Group();
    const mk = (r, len, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, len, 32), tubeMat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); return m; };
    tubes.add(mk(0.40, 9.5, 0, -1.3, -5.4)); tubes.add(mk(0.14, 7.5, 0.62, -1.0, -4.8));
    [[-3.0], [-7.0]].forEach(([z]) => { const br = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.12), brass); br.position.set(0.32, -1.12, z); tubes.add(br); });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 8, 32), brass); ring.position.set(0, -1.3, -3.2); tubes.add(ring);
    const ring2 = ring.clone(); ring2.position.z = -8.4; tubes.add(ring2);
    const eyep = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12), brass); eyep.rotation.x = Math.PI / 2; eyep.position.set(0, -1.3, -0.55); tubes.add(eyep);
    camera.add(tubes);
    // plate frame fixed to the view
    const fw = 10 * Math.tan(Astro.PLATE_RA_DEG / 2 * R), fh = 10 * Math.tan(Astro.PLATE_DEC_DEG / 2 * R);
    frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-fw, -fh, -10), new THREE.Vector3(fw, -fh, -10), new THREE.Vector3(fw, fh, -10), new THREE.Vector3(-fw, fh, -10)]), new THREE.LineBasicMaterial({ color: '#ffffff' }));
    camera.add(frame);
    const cross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.3, 0, -10), new THREE.Vector3(0.3, 0, -10), new THREE.Vector3(0, -0.3, -10), new THREE.Vector3(0, 0.3, -10)]), new THREE.LineBasicMaterial({ color: '#d6685c' })); camera.add(cross);
  }
  function current() { const d = new THREE.Vector3(); camera.getWorldDirection(d); const alt = Math.asin(d.y), az = Math.atan2(d.x, -d.z); const rd = raDec(alt, az, state.lst); return { ...rd, alt: alt / R, az: ((az / R) % 360 + 360) % 360 }; }
  function render(now = performance.now()) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    // automatic slew to a chosen field; any hand on the controls cancels it
    if (state.target) { const tg = state.target; let dy = Math.atan2(Math.sin(tg.az - state.yaw), Math.cos(tg.az - state.yaw)), dp = tg.alt - state.pitch;
      const step = 12 * R * dt, m = Math.hypot(dy, dp); if (m < 0.002) { state.yaw = tg.az; state.pitch = tg.alt; state.target = null; } else { state.yaw += dy / m * Math.min(step, m); state.pitch += dp / m * Math.min(step, m); } }
    // slow slew while the mouse is held; slow-motion keys for fine pointing
    if (state.goal) { const gl = state.goal; let dy = Math.atan2(Math.sin(gl.yaw - state.yaw), Math.cos(gl.yaw - state.yaw)), dp = gl.pitch - state.pitch; const m = Math.hypot(dy, dp);
      const step = Math.min(m, 40 * R * dt); if (m < 0.0005) state.goal = null; else { state.yaw += dy / m * step; state.pitch += dp / m * step; } }
    const fine = 1.5 * R * dt * (state.fov / 55);
    if (state.keys.l) state.yaw -= fine; if (state.keys.r) state.yaw += fine; if (state.keys.u) state.pitch = Math.min(89 * R, state.pitch + fine); if (state.keys.d) state.pitch = Math.max(-5 * R, state.pitch - fine);
    const box = renderer.domElement.parentElement.getBoundingClientRect(); const w = Math.round(box.width), h = Math.round(box.height);
    if (renderer.domElement.width !== w || renderer.domElement.height !== h) { renderer.setSize(w, h, false); camera.aspect = w / h; }
    camera.fov = state.fov; camera.updateProjectionMatrix();
    camera.lookAt(dir(state.pitch, state.yaw));
    if (dome) { let d = state.yaw - domeYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); domeYaw += d * 0.04;
      dome.rotation.y = -domeYaw;
      const moving = Math.abs(d) > 0.004; if (moving && !rumbling) { rumbling = true; Audio_.loop('dome_rotate', 0.3, 0.4); } if (!moving && rumbling) { rumbling = false; Audio_.stop('dome_rotate', 0.8); } }
    const cur = current(); const ok = cur.alt >= 25; frame.material.color.set(ok ? '#ffffff' : '#6e6760');
    overlay.textContent = `${Astro.fieldStr(cur.ra, cur.dec)} · ${Astro.nearestRegion(cur.ra, cur.dec).name} · altitude ${Math.round(cur.alt)}° · azimuth ${Math.round(cur.az)}°${ok ? '' : ' · too low'}`;
    if (state.opts.onPointing && (!state.lastPt || now - state.lastPt > 200)) { state.lastPt = now; state.opts.onPointing(cur, ok); }
    renderer.render(scene, camera); raf = requestAnimationFrame(render);
  }
  function mount(container, opts) {
    const wrap = el('div'); wrap.id = 'dome3d-wrap'; container.appendChild(wrap);
    const view = el('div', 'view'); wrap.appendChild(view);
    const bar = el('div', 'hours'); wrap.appendChild(bar);
    [21, 23, 1, 3].forEach(h => { const b = el('button', h === opts.hour ? 'primary' : '', `${String(h).padStart(2, '0')}:00`); b.onclick = () => opts.onHour(h); bar.appendChild(b); });
    const flat = el('button', '', 'Flat chart'); flat.style.marginLeft = 'auto'; bar.appendChild(flat); flat.onclick = () => opts.onFlat();
    overlay = el('div', 'coords'); wrap.appendChild(overlay);
    const hint = el('div', 'hint', 'Drag the sky to turn the telescope. Arrows or W A S D for fine pointing. Wheel zooms.'); wrap.appendChild(hint);
    build(view, opts);
    // grab the sky and drag it: the tube follows the hand with a little mass behind it
    state.drag = null; state.keys = {}; state.goal = null;
    view.addEventListener('pointerdown', e => { state.target = null; state.drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch }; view.setPointerCapture(e.pointerId); });
    view.addEventListener('pointermove', e => { if (!state.drag) return; const k = (state.fov / 55) * 0.0022; state.goal = { yaw: state.drag.yaw + (e.clientX - state.drag.x) * k, pitch: clamp(state.drag.pitch - (e.clientY - state.drag.y) * k, -5 * R, 89 * R) }; });
    const stopDrag = () => { state.drag = null; }; view.addEventListener('pointerup', stopDrag); view.addEventListener('pointercancel', stopDrag);
    view.addEventListener('wheel', e => { e.preventDefault(); state.fov = clamp(state.fov + e.deltaY * 0.03, 20, 75); }, { passive: false });
    const pick = () => { const cur = current(); if (cur.alt < 25) { toast('Too low. Below the pines.', 2000); return; } opts.onPick(cur.ra, cur.dec); };
    state.pick = pick;
    const KEYS = { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd' };
    onKey = e => { if (e.key === 'Enter') pick(); const k = KEYS[e.key]; if (k) { e.preventDefault(); state.target = null; state.goal = null; if (!state.keys[k]) Audio_.play('telescope_click', 0.3, 5); state.keys[k] = true; } };
    onKeyUp = e => { const k = KEYS[e.key]; if (k) state.keys[k] = false; };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp);
    render();
  }
  // free every geometry, material and texture, or the GPU fills up after a few nights
  function unmount() { if (raf) cancelAnimationFrame(raf); raf = null; if (onKeyUp) window.removeEventListener('keyup', onKeyUp); if (onKey) window.removeEventListener('keydown', onKey); if (rumbling) { rumbling = false; Audio_.stop('dome_rotate', 0.5); } dome = null;
    if (scene) { scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }); scene = null; }
    if (renderer) { renderer.dispose(); if (renderer.domElement.parentElement) renderer.domElement.parentElement.remove(); renderer = null; } state = null; }
  function slewTo(ra, dec) { if (!state) return; const p = altAz(ra, dec, state.lst); state.target = { alt: p.alt, az: p.az }; }
  // test hook: sample the painted band at a sky position
  function mwSample(raH, decDeg) { if (!lastMW || !state) return null; const p = altAz(raH, decDeg, state.lst); const u = ((270 - p.az / R) / 360 % 1 + 1) % 1, v = p.alt / Math.PI + 0.5; return lastMW.getContext('2d').getImageData(Math.floor(u * 1024), Math.floor(v * 512), 1, 1).data[3]; }
  return { mount, unmount, slewTo, mwSample, pick: () => state && state.pick && state.pick(), available: () => typeof THREE !== 'undefined' };
})();
