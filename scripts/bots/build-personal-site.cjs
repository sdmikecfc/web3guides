// Rebuild the committed, self-contained playtest. No accounts, deployment or paid services.
require('./personal-native-path.cjs');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const repo = path.resolve(__dirname, '../..');
const source = path.join(repo, 'art-src/bots/personal-v8');
const site = path.join(repo, 'public/bots-playtest');
const prefix = '/bots-playtest/';
function hosted(text) {
  return text.replaceAll('/assets/', prefix + 'assets/')
    .replaceAll('/?view=', prefix + 'index.html?view=')
    .replaceAll('/concept.png', prefix + 'concept.png')
    .replaceAll('/styles.css', prefix + 'styles.css')
    .replaceAll('/viewer.js', prefix + 'viewer.js');
}
async function main() {
  const ts = require('typescript');
  const program = ts.createProgram([path.join(source, 'main.ts')], {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true,
    skipLibCheck: true, esModuleInterop: true, lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'], types: [],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: f => f, getCurrentDirectory: () => repo, getNewLine: () => '\n',
  }));
  const receipt = JSON.parse(fs.readFileSync(path.join(source, 'source-receipt.json'), 'utf8'));
  for (const asset of receipt.assets) {
    const file = path.join(site, asset.path);
    // Manifests are namespaced below; binary models, textures and videos stay byte-identical.
    if (!asset.path.endsWith('manifest.json') && crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== asset.sha256)
      throw Error('Asset changed: ' + asset.path);
  }
  const wp = require('next/dist/compiled/webpack/webpack'); wp.init();
  await new Promise((resolve, reject) => {
    const compiler = wp.webpack({ mode: 'production', optimization: { minimize: false }, devtool: false,
      target: 'web', entry: path.join(source, 'main.ts'),
      output: { path: site, filename: 'viewer.js', chunkFilename: 'chunk-[id].js', publicPath: prefix },
      resolve: { extensions: ['.ts', '.js', '.json'], modules: [path.join(repo, 'node_modules')] },
      module: { rules: [{ test: /\.ts$/, use: path.join(__dirname, 'personal-loader.cjs') }] },
      plugins: [new wp.webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('production') })],
    });
    compiler.run((error, stats) => compiler.close(closeError => {
      if (error || closeError || stats.hasErrors()) reject(error || closeError || Error(stats.toString({ all: false, errors: true })));
      else resolve();
    }));
  });
  const terser = require('next/dist/compiled/terser');
  for (const name of fs.readdirSync(site).filter(n => n.endsWith('.js'))) {
    const result = await terser.minify(hosted(fs.readFileSync(path.join(site, name), 'utf8')), {
      compress: true, mangle: true, format: { comments: false },
    });
    fs.writeFileSync(path.join(site, name), result.code);
  }
  for (const name of ['catalogue-2', 'weapon-kits-1']) {
    const file = path.join(site, 'assets', name, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const entry of manifest.entries) {
      for (const field of ['url', 'thumbnailRoot']) {
        if (entry[field]?.startsWith('/assets/')) entry[field] = prefix + entry[field].slice(1);
      }
    }
    fs.writeFileSync(file, JSON.stringify(manifest));
  }
  let html = hosted(fs.readFileSync(path.join(source, 'index.html'), 'utf8'))
    .replace('<title>Warden — Model Kombat</title>', '<title>Model Kombat — Playtest</title><meta name="robots" content="noindex,nofollow">')
    .replace('href="/"', 'href="' + prefix + 'index.html?view=practice"');
  html = html.replace('<script src=', '<script>if(!new URLSearchParams(location.search).has("view")){const u=new URL(location.href);u.searchParams.set("view","practice");history.replaceState(null,"",u)}</script><script src=');
  fs.writeFileSync(path.join(site, 'index.html'), html);
  fs.writeFileSync(path.join(site, 'styles.css'), hosted(fs.readFileSync(path.join(source, 'styles.css'), 'utf8')));
  fs.writeFileSync(path.join(site, 'release.json'), JSON.stringify({
    scope: 'Version 8 practice and parts workbench. No accounts, rewards or ranked fights.',
    versions: fs.readFileSync(path.join(source, 'asset-versions.ts'), 'utf8'),
  }, null, 2));
  console.log('Playtest built: strict TypeScript passed; ' + receipt.assets.length + ' assets checked; /bots/playtest ready.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
