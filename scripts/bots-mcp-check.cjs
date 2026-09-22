// Local-only MCP regression runner. No environment files or live credentials are loaded.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tests = ['bots-mcp-intake-check.ts', 'bots-mcp-sql-check.ts', 'bots-mcp-api-sql-check.ts'];
const selected = process.argv[2];

if (!selected) {
  for (const test of tests) {
    const result = spawnSync(process.execPath, [...process.execArgv, __filename, test], { cwd: root, stdio: 'inherit', env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
} else {
  if (!tests.includes(selected)) throw new Error('Choose one of: ' + tests.join(', '));
  const ts = require('typescript');
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'server-only') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith('@/')) request = path.join(root, 'src', request.slice(2));
    return originalResolve.call(this, request, parent, isMain, options);
  };
  require.extensions['.ts'] = function (mod, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
    mod._compile(result.outputText, filename);
  };
  require(path.join(__dirname, selected));
}
