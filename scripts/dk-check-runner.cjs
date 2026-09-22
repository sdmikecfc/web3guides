/** Run the renderer-free TypeScript checks without installing a second runtime.
 * Usage: node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-harness.mts
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../node_modules/typescript/lib/typescript.js");
for (const ext of [".ts", ".mts"]) {
  require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
}
const script = process.argv[2];
if (!script) throw new Error("Pass the path of a TypeScript check to run.");
process.argv.splice(1, 1);
require(path.resolve(process.cwd(), script));
