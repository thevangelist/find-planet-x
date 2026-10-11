'use strict';
// Loads the game's plain-script modules into one sandbox, as the browser's script tags do, without a DOM.
// They are concatenated so their top-level const bindings see each other, then handed back as one object.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ctx = vm.createContext({ console, Math, Date, JSON, location: { search: '' }, window: {}, performance });
const src = ['util', 'astro', 'stars', 'finds', 'model', 'sky'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', `${f}.js`), 'utf8').replace(/^'use strict';/, '')).join('\n');
module.exports = vm.runInContext(`'use strict';\n${src}\n;({ Astro, Model, Sky, FINDS, rng, hashStr, clamp })`, ctx, { filename: 'game-modules.js' });
