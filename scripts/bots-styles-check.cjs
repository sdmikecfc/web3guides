// Local fixtures only. This runner never reads environment files or live credentials.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tests = ['bots-v5-check.ts', 'bots-v5-balance-check.ts', 'bots-styles-ui-check.ts', 'bots-styles-server-check.ts', 'bots-v5-compatibility-check.ts', 'bots-v5-damage-check.ts'];
const selected = process.argv[2];
if (!selected) {
  for (const test of tests) {
    const result = spawnSync(process.execPath, [...process.execArgv, __filename, test], { cwd: root, stdio: 'inherit', env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
} else {
  if (!tests.includes(selected)) throw new Error('Choose one of: ' + tests.join(', '));
  const ts = require('typescript'), load = Module._load, resolve = Module._resolveFilename;
  Module._load = function (request, parent, isMain) { return request === 'server-only' ? {} : load.call(this, request, parent, isMain); };
  Module._resolveFilename = function (request, parent, isMain, options) { return resolve.call(this, request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : request, parent, isMain, options); };
  require.extensions['.ts'] = function (mod, filename) {
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
    mod._compile(result.outputText, filename);
  };
  process.chdir(root);
  require(path.join(__dirname, selected));
}
