/** Check the host rewrite against the actual soundtrack files shipped in public/. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript/lib/typescript.js');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/middleware.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(compiled, {
  module: loaded, exports: loaded.exports, process: { env: {} }, URL,
  require: id => id === '@/lib/subdomains' ? { VALID_SUBDOMAINS: [] } : require(id),
});
const { middleware } = loaded.exports;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/diner-audio/manifest.json'), 'utf8'));
const assets = ['/diner-audio/manifest.json', ...Object.values(manifest.tracks).flatMap(track => Object.values(track.layers))];
let checked = 0;
for (const host of ['domainkitchen.xyz', 'www.domainkitchen.xyz', 'chef.web3guides.com', 'chef.localhost:3010']) {
  for (const asset of assets) {
    assert(fs.statSync(path.join(root, 'public', asset)).size > 0, `Missing shipped asset: ${asset}`);
    for (const headers of [{ host }, { host: 'preview.vercel.app', 'x-forwarded-host': host }]) {
      const request = new NextRequest(`https://${host}${asset}`, { headers });
      const response = middleware(request);
      assert.equal(response.headers.get('x-middleware-rewrite'), null, `${host}${asset} must remain a public asset`);
      assert.equal(response.headers.get('x-middleware-next'), '1');
      checked++;
    }
  }
  const response = middleware(new NextRequest(`https://${host}/diner-preview`, { headers: { host } }));
  assert.equal(new URL(response.headers.get('x-middleware-rewrite')).pathname, '/chef/diner-preview');
}
console.log(`PASS ${checked} soundtrack asset routes bypass game page rewriting; all Kitchen entrances retain their page routes.`);
