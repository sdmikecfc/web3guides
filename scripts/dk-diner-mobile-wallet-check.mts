/** Real RainbowKit/wagmi connection checks with deterministic, offline EIP-1193 wallets.
 * Run: node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-diner-mobile-wallet-check.mts
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const importEsm = new Function('name', 'return import(name)') as (name: string) => Promise<any>;
const root = process.cwd();
const source = (file: string) => readFileSync(path.join(root, file), 'utf8');
const descriptors = new Map(['window', 'document', 'navigator', 'localStorage', 'CustomEvent', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
let groups = 0;
let networkCalls = 0;

class Storage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

class BrowserEvent extends Event {
  detail: unknown;
  constructor(name: string, options: { detail?: unknown } = {}) { super(name); this.detail = options.detail; }
}

class FakeWallet extends EventEmitter {
  calls: string[] = [];
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: FakeWallet[];
  constructor(readonly address: string, flags: Record<string, boolean> = {}) { super(); Object.assign(this, flags); }
  async request({ method }: { method: string }) {
    this.calls.push(method);
    if (method === 'eth_chainId') return '0x1';
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [this.address];
    // MetaMask iOS need not implement the permissions extension. The real
    // wagmi connector must fall back to eth_requestAccounts, not stall.
    if (method === 'wallet_requestPermissions') throw Object.assign(new Error('Unsupported method'), { code: 4200 });
    if (method === 'wallet_revokePermissions') return null;
    throw new Error(`Unexpected wallet operation: ${method}`);
  }
}

function define(name: string, value: unknown) { Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); }
function browser(userAgent = 'Mozilla/5.0 (iPhone)', wallet?: FakeWallet, platform = 'iPhone', maxTouchPoints = 1) {
  const storage = new Storage();
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const win = Object.assign(new EventTarget(), {
    location: { origin: 'https://domainkitchen.xyz' }, localStorage: storage, ethereum: wallet, timers,
    setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  define('window', win);
  define('localStorage', storage);
  define('navigator', { userAgent, platform, maxTouchPoints });
  define('CustomEvent', BrowserEvent);
  return win;
}

function evaluate(file: string, imports: Record<string, unknown>) {
  const compiled = ts.transpileModule(source(file), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', compiled)((id: string) => {
    if (id in imports) return imports[id];
    if (id === 'react/jsx-runtime') return require(id);
    throw new Error(`Unmocked dependency in ${file}: ${id}`);
  }, module, module.exports);
  return module.exports;
}

async function check(name: string, callback: () => unknown | Promise<unknown>) { await callback(); groups++; console.log(`PASS ${name}`); }

async function main() {
  browser();
  define('fetch', async () => { networkCalls++; throw new Error('Wallet checks must stay offline.'); });
  const [core, connectors, chains, viem, rainbow, wallets] = await Promise.all([
    importEsm('@wagmi/core'), importEsm('wagmi/connectors'), importEsm('wagmi/chains'), importEsm('viem'),
    importEsm('@rainbow-me/rainbowkit'), importEsm('@rainbow-me/rainbowkit/wallets'),
  ]);
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const emptyStyles = new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : String(key) });
  const walletBrowser = evaluate('src/app/chef/diner-preview/wallet-browser.ts', {});

  function loadProviders(projectId?: string, hookRuntime?: unknown) {
    if (projectId === undefined) delete process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    else process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = projectId;
    let creations = 0;
    const forbiddenWallet = () => { throw new Error('The wallet-browser profile must not initialize a remote/SDK wallet without a valid project.'); };
    const fakeReact = { useState: (value: unknown) => [typeof value === 'function' ? (value as () => unknown)() : value, () => {}], useEffect: () => {} };
    const module = evaluate('src/app/wallet/providers.tsx', {
      '@rainbow-me/rainbowkit/styles.css': {},
      '@rainbow-me/rainbowkit': { ...rainbow, RainbowKitProvider: () => null },
      '@rainbow-me/rainbowkit/wallets': { ...wallets, metaMaskWallet: forbiddenWallet, rainbowWallet: forbiddenWallet, walletConnectWallet: forbiddenWallet, coinbaseWallet: forbiddenWallet },
      wagmi: { ...core, WagmiProvider: () => null, createConfig: (options: any) => { creations++; return core.createConfig(options); } },
      'wagmi/connectors': connectors,
      'wagmi/chains': chains,
      viem,
      '@tanstack/react-query': { QueryClient: class {}, QueryClientProvider: () => null },
      react: hookRuntime ?? fakeReact,
    });
    return {
      module,
      creations: () => creations,
      config: (appName = 'Domain Kitchen') => module.WalletProviders({ appName, connectionMode: 'wallet-browser', children: null }).props.config,
    };
  }

  async function hydrate(config: any) { await core.hydrate(config, { reconnectOnMount: false }).onMount(); }
  async function connect(config: any, connector: any, expected: FakeWallet) {
    assert.ok(connector, 'An available injected wallet has a connector.');
    const result = await core.connect(config, { connector });
    assert.equal(result.accounts[0].toLowerCase(), expected.address.toLowerCase());
    assert.equal(core.getAccount(config).isConnected, true);
    assert.ok(expected.calls.includes('eth_requestAccounts'));
    assert.equal(expected.calls.some(method => /sign|sendTransaction|sendRawTransaction/i.test(method)), false, 'Beta connection never signs or sends a transaction.');
  }

  await check('unconfigured phone browsers create no dead injected, SDK, or WalletConnect connectors', () => {
    for (const userAgent of ['Mozilla/5.0 (iPhone)', 'Mozilla/5.0 (Linux; Android 15)']) {
      browser(userAgent);
      const provider = loadProviders();
      assert.equal(provider.creations(), 0, 'Importing providers must not initialize an unused configuration.');
      const config = provider.config();
      assert.deepEqual(config.connectors, []);
      assert.equal(provider.config(), config, 'The mounted app reuses its configuration.');
      assert.equal(provider.creations(), 1);
      assert.notEqual(provider.config('Another surface'), config);
      assert.deepEqual(config.chains.map((chain: any) => chain.id), [1, 97477]);
    }
  });

  await check('zero and placeholder project IDs never create remote connectors', () => {
    for (const value of ['0'.repeat(32), 'YOUR_PROJECT_ID', '   ']) {
      browser();
      assert.deepEqual(loadProviders(value).config().connectors, []);
    }
  });

  await check('MetaMask browser connects through real wagmi injected permission fallback', async () => {
    const wallet = new FakeWallet(`0x${'11'.repeat(20)}`, { isMetaMask: true });
    browser('Mozilla/5.0 (iPhone)', wallet);
    const config = loadProviders().config();
    assert.ok(config.connectors.every((connector: any) => connector.type === 'injected'));
    await hydrate(config);
    await connect(config, config.connectors.find((connector: any) => connector.id === 'metaMask'), wallet);
  });

  await check('Rabby selection targets Rabby when several injected providers exist', async () => {
    const metamask = new FakeWallet(`0x${'22'.repeat(20)}`, { isMetaMask: true });
    const rabby = new FakeWallet(`0x${'33'.repeat(20)}`, { isMetaMask: true, isRabby: true });
    metamask.providers = [metamask, rabby];
    browser('Desktop', metamask, 'Win32', 0);
    const config = loadProviders().config();
    await hydrate(config);
    await connect(config, config.connectors.find((connector: any) => connector.rkDetails?.id === 'rabby'), rabby);
    assert.equal(metamask.calls.includes('eth_requestAccounts'), false);
  });

  await check('a late EIP-6963-only wallet becomes connectable without window.ethereum', async () => {
    const win = browser();
    const config = loadProviders().config();
    await hydrate(config);
    assert.equal(config.connectors.length, 0);
    const wallet = new FakeWallet(`0x${'44'.repeat(20)}`);
    win.dispatchEvent(new BrowserEvent('eip6963:announceProvider', { detail: {
      info: { uuid: '8eb4abf2-3b2c-45d3-a334-c736c01df798', name: 'Late test wallet', rdns: 'io.test.late', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' },
      provider: wallet,
    } }));
    await connect(config, config.connectors.find((connector: any) => connector.id === 'io.test.late'), wallet);
    assert.equal(win.ethereum, undefined);
  });

  await check('late legacy injection connects through the public factory API and cleans up detection', async () => {
    for (const trigger of ['ethereum#initialized', 'focus', 'timer']) {
      const win = browser();
      const config = loadProviders().config();
      await hydrate(config);
      const slots: unknown[] = [];
      let cursor = 0, mounted = false, updates = 0;
      const effects: Array<() => (() => void)> = [];
      const runtime = {
        useState(initial: unknown) {
          const index = cursor++;
          if (!(index in slots)) slots[index] = initial;
          return [slots[index], (next: unknown) => { updates++; slots[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(slots[index]) : next; }];
        },
        useEffect(effect: () => (() => void)) { if (!mounted) effects.push(effect); },
      };
      const { useLegacyBrowserWalletConnector } = loadProviders(undefined, runtime).module;
      const readHook = () => { cursor = 0; return useLegacyBrowserWalletConnector(); };
      assert.equal(readHook(), null);
      const cleanup = effects[0](); mounted = true;
      assert.equal(readHook(), null, 'The fallback remains unavailable without an actual provider.');
      const wallet = new FakeWallet(`0x${'66'.repeat(20)}`);
      win.ethereum = wallet;
      if (trigger === 'timer') for (const callback of win.timers.values()) callback();
      else win.dispatchEvent(new Event(trigger));
      const connector = readHook();
      assert.equal(typeof connector, 'function');
      assert.equal(config.connectors.length, 0, 'Late detection does not replace or mutate the connector configuration.');
      await connect(config, connector, wallet);
      cleanup();
      assert.equal(win.timers.size, 0, 'Unmount removes delayed detection.');
      const updatesAfterCleanup = updates;
      win.dispatchEvent(new Event('focus'));
      win.dispatchEvent(new Event('ethereum#initialized'));
      assert.equal(updates, updatesAfterCleanup, 'Unmount removes event listeners.');
    }
  });

  function renderConnection(config: any, options: { legacyConnector?: any; pending?: boolean; error?: Error } = {}) {
    const state: unknown[] = [];
    const effects: Array<() => void> = [];
    let cursor = 0;
    let mounted = false;
    let connection: Promise<unknown> | undefined;
    const fakeReact = {
      useState(value: unknown) { const index = cursor++; if (!(index in state)) state[index] = value; return [state[index], (next: unknown) => { state[index] = next; }]; },
      useRef(value: unknown) { const index = cursor++; if (!(index in state)) state[index] = { current: value }; return state[index]; },
      useEffect(effect: () => void) { if (!mounted) effects.push(effect); },
    };
    const { DinerWalletConnect } = evaluate('src/app/chef/diner-preview/DinerWalletConnect.tsx', {
      'next/link': ({ children, ...props }: any) => React.createElement('a', props, children),
      react: fakeReact,
      '@rainbow-me/rainbowkit': { ConnectButton: ({ label }: any) => React.createElement('button', null, label) },
      wagmi: { useAccount: () => core.getAccount(config), useConnect: () => ({ connectors: config.connectors, isPending: options.pending, error: options.error, connectAsync: (args: any) => { connection = core.connect(config, args); return connection; } }) },
      '@/app/wallet/providers': { useLegacyBrowserWalletConnector: () => options.legacyConnector ?? null },
      './wallet-browser': walletBrowser,
      './wallet-entry.module.css': emptyStyles,
    });
    const tree = () => { cursor = 0; return DinerWalletConnect(); };
    const render = () => renderToStaticMarkup(tree());
    const findDirectButton = (node: any): any => {
      if (!node || typeof node !== 'object') return undefined;
      if (node.type === 'button' && typeof node.props.onClick === 'function') return node;
      for (const child of React.Children.toArray(node.props?.children)) {
        const button = findDirectButton(child);
        if (button) return button;
      }
      return undefined;
    };
    return {
      render,
      mount: () => { for (const effect of effects.splice(0)) effect(); mounted = true; return render(); },
      clickDirect: async () => { const button = findDirectButton(tree()); assert.ok(button, 'The available legacy wallet exposes a direct connect action.'); button.props.onClick(); assert.ok(connection); await connection; },
    };
  }

  await check('server and first client wallet UI match before detecting injected providers', () => {
    define('window', undefined);
    const server = renderConnection(loadProviders().config()).render();
    browser('Mozilla/5.0 (iPhone)', new FakeWallet(`0x${'55'.repeat(20)}`, { isMetaMask: true }));
    const client = renderConnection(loadProviders().config());
    assert.equal(client.render(), server);
    assert.match(client.mount(), /Connect MetaMask/);
  });

  await check('phone and desktop help routes are actionable after mount', () => {
    for (const device of [
      { ua: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', touch: 1 },
      { ua: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', touch: 5 },
      { ua: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', touch: 5 },
    ]) {
      browser(device.ua, undefined, device.platform, device.touch);
      const view = renderConnection(loadProviders().config()); view.render();
      const html = view.mount();
      assert.ok(html.includes(`href="${walletBrowser.METAMASK_GAME_LINK}"`));
      assert.ok(html.includes(`href="${walletBrowser.WALLET_HELP_PATH}"`));
      assert.equal(html.includes('<button'), false, 'An unconfigured phone must not offer a dead connect button.');
    }
    browser('Desktop', undefined, 'Win32', 0);
    const desktop = renderConnection(loadProviders().config()); desktop.render();
    assert.match(desktop.mount(), /https:\/\/metamask.io\/download\//);
  });

  await check('the late-wallet button calls real wagmi connect and presents pending/retry states', async () => {
    const win = browser();
    const config = loadProviders().config();
    await hydrate(config);
    const wallet = new FakeWallet(`0x${'77'.repeat(20)}`);
    win.ethereum = wallet;
    const legacyConnector = connectors.injected();
    const view = renderConnection(config, { legacyConnector }); view.render();
    const ready = view.mount();
    assert.match(ready, /Connect wallet/);
    assert.equal(ready.includes('Open game in MetaMask'), true, 'An injected wallet must not hide the alternative MetaMask app entry on phones.');
    const pending = renderConnection(config, { legacyConnector, pending: true }); pending.render();
    const pendingHtml = pending.mount();
    assert.match(pendingHtml, /disabled=""/);
    assert.match(pendingHtml, /role="status">Check your wallet for the connection request/);
    const retry = renderConnection(config, { legacyConnector, error: new Error('Rejected') }); retry.render();
    assert.match(retry.mount(), /role="alert"/);
    await view.clickDirect();
    assert.equal(core.getAccount(config).isConnected, true);
    assert.ok(wallet.calls.includes('eth_requestAccounts'));
    assert.equal(wallet.calls.some(method => /sign|sendTransaction|sendRawTransaction/i.test(method)), false);
  });

  assert.equal(networkCalls, 0);
  console.log(`${groups} mobile-wallet regression groups passed; no network, signatures, or transactions.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (originalProjectId === undefined) delete process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  else process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = originalProjectId;
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
