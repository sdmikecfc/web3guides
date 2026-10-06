/** Run local TypeScript checks without installing a second runtime.
 * Usage: node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-harness.mts
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../node_modules/typescript/lib/typescript.js");
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...options) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.resolve(__dirname, "../src", request.slice(2)) : request, parent, ...options);
};
for (const ext of [".ts", ".mts", ".tsx"]) {
  require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename.replace(/\.mts$/, ".ts"),
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
}
const script = process.argv[2];
if (!script) throw new Error("Pass the path of a TypeScript check to run.");
process.argv.splice(1, 1);
require(path.resolve(process.cwd(), script));
