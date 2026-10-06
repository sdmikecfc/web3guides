// Read-only release projection checks; no Vercel call or generated artifacts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { RENDERER_SOURCES, projectRendererHeaders } = require('./lib/renderer-headers.cjs');
const root = path.resolve(__dirname, '../..');
const base = JSON.parse(cp.execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'show', 'HEAD:vercel.json'], { cwd: root, encoding: 'utf8' }));
const current = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const projected = projectRendererHeaders(base, current);
const framePolicy = (config, pathname) => {
  let policy;
  for (const rule of config.headers ?? []) {
    if (!new RegExp(`^${rule.source}$`).test(pathname)) continue;
    for (const header of rule.headers ?? []) if (header.key.toLowerCase() === 'x-frame-options') policy = header.value;
  }
  return policy;
};
for (const pathname of ['/bots-playtest/index.html', '/bots-playtest/releases/old/index.html', '/bots-display/v2/index.html']) {
  assert.equal(framePolicy(projected, pathname), 'SAMEORIGIN');
  assert.equal(framePolicy(current, pathname), 'SAMEORIGIN');
}
for (const pathname of ['/', '/bots/start', '/bots/workshop', '/chef', '/bots-display-other/index.html']) assert.equal(framePolicy(projected, pathname), 'DENY');
assert.deepEqual(projectRendererHeaders(projected, current), projected);
console.log('PASS only Model Kombat renderer paths allow same-origin framing; ordinary pages remain DENY; projection is repeat-safe');

const unrelated = structuredClone(current);
unrelated.crons = [{ path: '/unreviewed', schedule: '* * * * *' }];
unrelated.buildCommand = 'unreviewed-build';
unrelated.headers.push({ source: '/chef/(.*)', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] });
assert.deepEqual(projectRendererHeaders(base, unrelated), projected);
for (const key of Object.keys(base).filter(key => key !== 'headers')) assert.deepEqual(projected[key], base[key]);
assert.deepEqual(projected.headers.filter(rule => !RENDERER_SOURCES.includes(rule.source)), (base.headers ?? []).filter(rule => !RENDERER_SOURCES.includes(rule.source)));
console.log('PASS unrelated working-tree deployment settings are excluded; committed cron/build/headers are preserved');

const missing = structuredClone(current);
missing.headers = missing.headers.filter(rule => rule.source !== RENDERER_SOURCES[1]);
assert.throws(() => projectRendererHeaders(base, missing), /Missing reviewed/);
const changed = structuredClone(current);
changed.headers.find(rule => rule.source === RENDERER_SOURCES[0]).headers[0].value = 'ALLOWALL';
assert.throws(() => projectRendererHeaders(base, changed), /Missing reviewed/);
const before = structuredClone(base);
projectRendererHeaders(base, current);
assert.deepEqual(base, before);
console.log('PASS missing or weakened source exceptions stop release projection, and source objects stay unchanged');
