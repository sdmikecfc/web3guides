/* Offline checks against the installed RainbowKit wallet factories. No wallet
 * connection, authentication, project credentials or generated repo files. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const names = ['@rainbow-me/rainbowkit', '@rainbow-me/rainbowkit/wallets', 'wagmi', 'wagmi/chains', 'wagmi/connectors'];
  const imports = new Map(await Promise.all(names.map(async name => [name, await import(name)])));
  const file = path.join(root, 'src/app/bots/_game/ModelKombatWalletProviders.tsx');
  const fixture = new Module(file, module);
  fixture.filename = file;
  fixture.paths = Module._nodeModulePaths(path.dirname(file));
  const load = Module._load;
  try {
    Module._load = function(name, ...args) {
      if (name.endsWith('.css')) return {};
      return imports.has(name) ? imports.get(name) : load.call(this, name, ...args);
    };
    fixture._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, file);
  } finally { Module._load = load; }
  const { modelKombatWalletList, validWalletConnectProjectId } = fixture.exports;
  const windowDescriptor = Object.getOwnPropertyDescriptor(global, 'window');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
  const oldFetch = global.fetch;
  let requests = 0;
  const provider = flags => ({ ...flags, request: async () => { requests++; throw Error('No wallet requests allowed'); } });
  const browser = (ethereum, userAgent = 'Desktop test browser', platform = 'Win32', maxTouchPoints = 0) => {
    Object.defineProperty(global, 'window', { configurable: true, value: { location: { origin: 'https://offline-fixture.invalid' }, ...(ethereum ? { ethereum } : {}) } });
    Object.defineProperty(global, 'navigator', { configurable: true, value: { userAgent, platform, maxTouchPoints } });
  };
  const wallets = id => modelKombatWalletList(id)[0].wallets.map(factory => factory({ appName: 'Offline fixture', projectId: validWalletConnectProjectId(id) ?? '' }));
  const find = (list, id) => { const wallet = list.find(item => item.id === id); assert(wallet, `${id} missing`); return wallet; };
  const visible = list => list.filter(wallet => !wallet.hidden?.()).map(wallet => wallet.id);
  try {
    global.fetch = async () => { throw Error('No network allowed'); };
    browser();
    for (const invalid of [undefined, '', ' ', 'YOUR_PROJECT_ID', '0'.repeat(32), 'x'.repeat(32)]) {
      assert.equal(validWalletConnectProjectId(invalid), undefined);
      const list = wallets(invalid);
      assert.deepEqual(visible(list), ['metaMask', 'rabby', 'coinbase', 'brave', 'phantom']);
      const metamask = find(list, 'metaMask');
      assert.equal(metamask.installed, false);
      assert.equal(metamask.qrCode, undefined);
      assert.equal(metamask.mobile, undefined);
      assert.match(metamask.downloadUrls.browserExtension, /^https:\/\/metamask\.io\//);
      assert.deepEqual(metamask.extension.instructions.steps.map(step => step.step), ['install', 'create', 'refresh']);
      // Materialize the real RainbowKit connector factories as well: an empty
      // project ID must never reach its throwing WalletConnect factory.
      assert(imports.get('@rainbow-me/rainbowkit').connectorsForWallets(modelKombatWalletList(invalid), { appName: 'Offline fixture', projectId: '' }).length >= 5);
    }
    assert.match(find(wallets(), 'brave').downloadUrls.desktop, /^https:\/\/brave\.com\//);
    assert.match(find(wallets(), 'brave').downloadUrls.browserExtension, /^https:\/\/brave\.com\//);
    assert.match(find(wallets(), 'phantom').downloadUrls.browserExtension, /^https:\/\/phantom\.app\//);
    console.log('PASS missing/invalid ID: five named choices, usable install guidance, no remote connector or QR');

    // This synthetic, correctly shaped ID is only passed to factory functions;
    // no config, connection, RPC or project authentication is performed.
    const fixtureId = 'abcdef0123456789abcdef0123456789';
    assert.equal(validWalletConnectProjectId(` ${fixtureId} `), fixtureId);
    const remote = wallets(fixtureId);
    assert.deepEqual(visible(remote), ['metaMask', 'rabby', 'coinbase', 'brave', 'phantom', 'rainbow', 'walletConnect', 'trust', 'okx']);
    assert.equal(typeof find(remote, 'metaMask').qrCode.getUri, 'function');
    console.log('PASS configured-ID factory path includes MetaMask QR, Rainbow, WalletConnect, Trust and OKX');

    for (const [userAgent, platform, touches] of [['Android', 'Linux', 0], ['iPhone', 'iPhone', 1], ['Safari', 'MacIntel', 5]]) {
      browser(undefined, userAgent, platform, touches);
      const metamask = find(wallets(), 'metaMask');
      assert.equal(typeof metamask.mobile.getUri, 'function');
      assert.equal(metamask.qrCode, undefined);
    }
    console.log('PASS external Android/iPhone/iPad MetaMask uses the official mobile SDK factory without a WC project');

    const metamaskProvider = provider({ isMetaMask: true });
    const rabby = provider({ isMetaMask: true, isRabby: true });
    browser({ ...rabby, providers: [rabby, metamaskProvider] });
    for (const id of [undefined, fixtureId]) {
      const metamask = find(wallets(id), 'metaMask');
      assert.equal(metamask.installed, true);
      assert.equal(metamask.qrCode, undefined);
      assert.equal(metamask.mobile, undefined);
      const connector = metamask.createConnector({ rkDetails: { id: 'metaMask' } })({ chains: [], emitter: { emit() {} } });
      assert.equal(await connector.getProvider(), metamaskProvider);
    }
    browser(rabby);
    assert.equal(find(wallets(), 'metaMask').installed, false);
    assert.equal(find(wallets(), 'rabby').installed, true);
    assert(visible(wallets()).includes('injected'));
    browser(metamaskProvider, 'iPhone', 'iPhone', 1);
    assert.equal(find(wallets(), 'metaMask').mobile, undefined);
    assert.equal(requests, 0);
    console.log('PASS installed MetaMask targets its own provider, ignores Rabby masquerading, and makes no account/signature requests during setup');
  } finally {
    for (const [key, descriptor] of [['window', windowDescriptor], ['navigator', navigatorDescriptor]]) {
      if (descriptor) Object.defineProperty(global, key, descriptor); else delete global[key];
    }
    global.fetch = oldFetch;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
