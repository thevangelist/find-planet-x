'use strict';
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Mulberry32: deterministic plates from a seed
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = r => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const hashStr = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// waits for click / space / enter; resolves with the key or 'click'
function nextInput(target = document) {
  return new Promise(res => {
    const done = v => { target.removeEventListener('keydown', k); target.removeEventListener('pointerdown', c); res(v); };
    const k = e => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); done(e.key); } };
    const c = e => { if (!e.target.closest('button,textarea,a')) done('click'); };
    target.addEventListener('keydown', k); target.addEventListener('pointerdown', c);
  });
}

let toastTimer;
function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// small persistent preferences (sound, negative view)
const Prefs = (() => { const K = 'tombaugh-prefs'; let p = {}; try { p = JSON.parse(localStorage.getItem(K)) || {}; } catch (e) {}
  return { get: k => p[k], set: (k, v) => { p[k] = v; try { localStorage.setItem(K, JSON.stringify(p)); } catch (e) {} } }; })();
