/** Brave/mobile gate regression checks against the real wallet definitions and wagmi.
 * Run: node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-diner-mobile-wallet-brave-check.mts
 * These checks exercise rendered button actions, not an actual phone/app handoff.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const importEsm = new Function('name', 'return import(name)') as (name: string) => Promise<any>;
const root = process.cwd();
const originals = new Map(['window', 'document', 'navigator', 'localStorage', 'CustomEvent', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
let groups = 0, networkCalls = 0;

class Storage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

class BrowserEvent extends Event {
  constructor(name: string, readonly detail: unknown) { super(name); }
}

/** Deliberately NOT an EventEmitter: its `_events` field masks the Brave bug. */
class MobileWallet {
  calls: string[] = [];
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  authorized = false;
  rejectNext = false;
  requireAuthorizationForChainId = false;
  approvalGate?: Promise<void>;
  providers?: MobileWallet[];
  isMetaMask?: boolean;
  isBraveWallet?: boolean;
  constructor(readonly address: string, flags: Record<string, boolean> = {}) { Object.assign(this, flags); }
  on(event: string, listener: (...args: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener); return this;
  }
  removeListener(event: string, listener: (...args: unknown[]) => void) { this.listeners.get(event)?.delete(listener); return this; }
  async request({ method }: { method: string }) {
    this.calls.push(method);
    if (method === 'wallet_requestPermissions') throw Object.assign(new Error('Unsupported permissions API'), { code: 4200 });
    if (method === 'eth_requestAccounts') {
      if (this.approvalGate) await this.approvalGate;
      if (this.rejectNext) { this.rejectNext = false; throw Object.assign(new Error('User rejected request'), { code: 4001 }); }
      this.authorized = true; return [this.address];
    }
    if (method === 'eth_accounts') return this.authorized ? [this.address] : [];
    if (method === 'eth_chainId') {
      if (this.requireAuthorizationForChainId && !this.authorized) throw Object.assign(new Error('Not authorized'), { code: 4100 });
      return '0x1';
    }
    if (method === 'wallet_revokePermissions') return null;
    throw new Error(`Unexpected wallet operation: ${method}`);
  }
}

function define(key: string, value: unknown) { Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
function browser(wallet?: MobileWallet) {
  const storage = new Storage();
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const win = Object.assign(new EventTarget(), {
    location: { origin: 'https://domainkitchen.xyz', href: 'https://domainkitchen.xyz/' },
    localStorage: storage, ethereum: wallet, timers,
    setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  define('window', win); define('localStorage', storage); define('CustomEvent', BrowserEvent);
  define('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 });
  return win;
}

function evaluate(file: string, imports: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', code)((id: string) => {
    if (id in imports) return imports[id];
    if (id === 'react/jsx-runtime') return require(id);
    throw new Error(`Unmocked dependency in ${file}: ${id}`);
  }, module, module.exports);
  return module.exports;
}

function hooks() {
  const slots: any[] = [];
  const pending: Array<() => void> = [];
  let cursor = 0;
  const same = (a?: unknown[], b?: unknown[]) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  return {
    begin: () => { cursor = 0; },
    flush: () => { for (const effect of pending.splice(0)) effect(); },
    dispose: () => { for (const slot of slots) slot?.cleanup?.(); },
    runtime: {
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
        return [slots[index], (next: unknown) => { slots[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(slots[index]) : next; }];
      },
      useRef(initial: unknown) { const index = cursor++; return slots[index] ??= { current: initial }; },
      useEffect(effect: () => void | (() => void), deps?: unknown[]) {
        const index = cursor++;
        if (!same(slots[index]?.deps, deps)) {
          const prior = slots[index];
          slots[index] = { deps };
          pending.push(() => { prior?.cleanup?.(); slots[index].cleanup = effect(); });
        }
      },
      useMemo(factory: () => unknown, deps?: unknown[]) {
        const index = cursor++;
        if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() };
        return slots[index].value;
      },
      useCallback(callback: unknown) { cursor++; return callback; },
    },
  };
}

async function check(name: string, run: () => unknown | Promise<unknown>) { await run(); groups++; console.log(`PASS ${name}`); }

async function main() {
  browser(); delete process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  define('fetch', async () => { networkCalls++; throw new Error('Connection checks must stay offline.'); });
  const [core, connectors, chains, viem, rainbow, wallets] = await Promise.all([
    importEsm('@wagmi/core'), importEsm('wagmi/connectors'), importEsm('wagmi/chains'), importEsm('viem'),
    importEsm('@rainbow-me/rainbowkit'), importEsm('@rainbow-me/rainbowkit/wallets'),
  ]);
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const emptyStyles = new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : String(key) });
  const walletBrowser = evaluate('src/app/chef/diner-preview/wallet-browser.ts', {});
  const staticRuntime = { useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}], useEffect: () => {} };
  const loadProviders = (runtime: unknown = staticRuntime) => evaluate('src/app/wallet/providers.tsx', {
    '@rainbow-me/rainbowkit/styles.css': {},
    '@rainbow-me/rainbowkit': { ...rainbow, RainbowKitProvider: () => null },
    '@rainbow-me/rainbowkit/wallets': wallets,
    wagmi: { ...core, WagmiProvider: () => null },
    'wagmi/connectors': connectors, 'wagmi/chains': chains, viem,
    '@tanstack/react-query': { QueryClient: class {}, QueryClientProvider: () => null }, react: runtime,
  });
  async function configuration() {
    const module = loadProviders();
    const config = module.WalletProviders({ appName: 'Domain Kitchen', connectionMode: 'wallet-browser', children: null }).props.config;
    await core.hydrate(config, { reconnectOnMount: false }).onMount();
    return config;
  }
  function view(config: any, overrides: { pending?: boolean; error?: Error } = {}) {
    const hook = hooks();
    let pending = false, error: Error | null = null;
    let connection: Promise<unknown> | undefined;
    const module = evaluate('src/app/chef/diner-preview/DinerWalletConnect.tsx', {
      'next/link': ({ children, ...props }: any) => React.createElement('a', props, children), react: hook.runtime,
      '@rainbow-me/rainbowkit': { ConnectButton: ({ label }: any) => React.createElement('button', { 'data-modal-only': true }, label) },
      wagmi: {
        useAccount: () => core.getAccount(config),
        useConnect: () => ({
          connectors: config.connectors, isPending: overrides.pending ?? pending, error: overrides.error ?? error,
          reset: () => { error = null; },
          connectAsync: (args: any) => {
            pending = true; error = null;
            connection = core.connect(config, args).then((result: any) => { pending = false; return result; }, (failure: Error) => { pending = false; error = failure; throw failure; });
            return connection;
          },
        }),
      },
      '@/app/wallet/providers': loadProviders(hook.runtime), './wallet-browser': walletBrowser, './wallet-entry.module.css': emptyStyles,
    });
    const tree = () => { hook.begin(); return module.DinerWalletConnect(); };
    const render = () => renderToStaticMarkup(tree());
    const buttons = (node: any): any[] => {
      if (!node || typeof node !== 'object') return [];
      return [...(node.type === 'button' && typeof node.props.onClick === 'function' ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(buttons)];
    };
    const text = (node: any): string => typeof node === 'string' || typeof node === 'number' ? String(node) : !node ? '' : React.Children.toArray(node.props?.children).map(text).join(' ');
    return {
      render,
      mount: async () => {
        for (let pass = 0; pass < 6; pass++) { render(); hook.flush(); await Promise.resolve(); }
        return render();
      },
      findButton: (label: RegExp) => buttons(tree()).find(button => label.test(text(button))),
      async click(label: RegExp) {
        const button = buttons(tree()).find(candidate => label.test(text(candidate)));
        assert.ok(button, `An actionable button exists for ${label}.`);
        assert.equal(Boolean(button.props.disabled), false);
        button.props.onClick();
        // A handler may discover the provider asynchronously before connecting.
        for (let i = 0; !connection && i < 12; i++) await Promise.resolve();
        assert.ok(connection, 'Clicking starts wagmi connection instead of only opening a modal.');
        return connection;
      },
      dispose: hook.dispose,
    };
  }

  await check('plain Brave dual flags produce a correctly named, working direct button and a MetaMask alternative', async () => {
    const wallet = new MobileWallet(`0x${'12'.repeat(20)}`, { isMetaMask: true, isBraveWallet: true });
    assert.equal('_events' in wallet, false); assert.equal('_state' in wallet, false);
    browser(wallet);
    const config = await configuration();
    assert.equal(config.connectors.some((connector: any) => connector.rkDetails?.id === 'metaMask'), false, 'Brave must not advertise a fake MetaMask connector.');
    const gate = view(config);
    const html = await gate.mount();
    assert.match(html, /Brave/);
    assert.ok(html.includes(`href="${walletBrowser.METAMASK_GAME_LINK}"`), 'Brave injection must not hide the external MetaMask alternative.');
    await gate.click(/Brave/i);
    assert.equal(core.getAccount(config).address.toLowerCase(), wallet.address);
    assert.ok(wallet.calls.includes('eth_requestAccounts'));
    gate.dispose();
  });

  await check('an EIP-6963-only mobile wallet can be selected directly without a RainbowKit-only chooser', async () => {
    const win = browser(); const config = await configuration();
    const wallet = new MobileWallet(`0x${'34'.repeat(20)}`);
    win.dispatchEvent(new BrowserEvent('eip6963:announceProvider', {
      info: { uuid: 'cf9e9558-e1ed-4f00-ae8f-7aa9c890c9c1', name: 'Discovery wallet', rdns: 'io.test.mobile', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' }, provider: wallet,
    }));
    assert.equal(win.ethereum, undefined);
    const gate = view(config); await gate.mount();
    await gate.click(/Discovery wallet/i);
    assert.equal(core.getAccount(config).address.toLowerCase(), wallet.address);
    gate.dispose();
  });

  await check('mobile button requests account access before querying a protected chain ID', async () => {
    const wallet = new MobileWallet(`0x${'56'.repeat(20)}`, { isMetaMask: true });
    wallet.requireAuthorizationForChainId = true;
    browser(wallet); const config = await configuration();
    const gate = view(config); await gate.mount();
    wallet.calls.length = 0;
    await gate.click(/MetaMask/i);
    assert.ok(wallet.calls.indexOf('eth_requestAccounts') >= 0);
    assert.ok(wallet.calls.indexOf('eth_requestAccounts') < wallet.calls.indexOf('eth_chainId'), 'A preflight chain request would fail before the phone can show its approval prompt.');
    assert.equal(core.getAccount(config).isConnected, true);
    gate.dispose();
  });

  await check('connection rejection is visible and retry remains actionable', async () => {
    const wallet = new MobileWallet(`0x${'78'.repeat(20)}`, { isMetaMask: true }); wallet.rejectNext = true;
    browser(wallet); const config = await configuration();
    const gate = view(config); await gate.mount();
    await assert.rejects(gate.click(/MetaMask/i));
    assert.match(gate.render(), /role="alert"/);
    assert.ok(gate.findButton(/MetaMask/i));
    await gate.click(/MetaMask/i);
    assert.equal(core.getAccount(config).isConnected, true);
    gate.dispose();
  });

  await check('pending wallet approval disables another direct request and explains the wait', async () => {
    const wallet = new MobileWallet(`0x${'90'.repeat(20)}`, { isMetaMask: true });
    browser(wallet); const config = await configuration();
    const gate = view(config, { pending: true });
    const html = await gate.mount();
    assert.match(html, /disabled=""/);
    assert.match(html, /role="status">Check your wallet for the connection request/);
    assert.equal(wallet.calls.includes('eth_requestAccounts'), false, 'Rendering pending UI never requests permissions itself.');
    gate.dispose();
  });

  await check('double taps cannot open duplicate prompts and a delayed approval shows recovery instructions', async () => {
    const wallet = new MobileWallet(`0x${'bc'.repeat(20)}`, { isMetaMask: true, isBraveWallet: true });
    let approve!: () => void;
    wallet.approvalGate = new Promise<void>(resolve => { approve = resolve; });
    const win = browser(wallet); const config = await configuration();
    const gate = view(config); await gate.mount();
    const originalButton = gate.findButton(/Brave/i);
    const first = gate.click(/Brave/i);
    originalButton.props.onClick();
    await gate.mount();
    assert.match(gate.render(), /disabled=""/);
    for (const callback of [...win.timers.values()]) callback();
    assert.match(gate.render(), /No prompt yet\?/);
    assert.match(gate.render(), /wallet panel/);
    assert.equal(wallet.calls.filter(method => method === 'eth_requestAccounts').length, 1);
    approve(); await first;
    assert.equal(core.getAccount(config).isConnected, true);
    gate.dispose();
  });

  await check('MetaMask has its own recognizable icon rather than the generic browser icon', async () => {
    browser(new MobileWallet(`0x${'ab'.repeat(20)}`, { isMetaMask: true }));
    const config = await configuration();
    const connector = config.connectors.find((item: any) => item.rkDetails?.id === 'metaMask');
    assert.ok(connector);
    const resolve = async (value: unknown) => typeof value === 'function' ? await (value as () => unknown)() : value;
    const icon = await resolve(connector.rkDetails.iconUrl);
    assert.equal(typeof icon, 'string');
    assert.notEqual(icon, await resolve(wallets.injectedWallet().iconUrl));
    if ((icon as string).startsWith('/')) {
      assert.match(readFileSync(path.join(root, 'public', (icon as string).slice(1)), 'utf8'), /<svg\b/, 'The restored local icon must actually ship with the game.');
    }
  });

  assert.equal(networkCalls, 0, 'Wallet buttons do not start a relay, signature, transaction, or HTTP request in these checks.');
  console.log(`${groups} Brave/mobile gate regression groups passed. Physical mobile app handoff remains a device test.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (originalProjectId === undefined) delete process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  else process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = originalProjectId;
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
