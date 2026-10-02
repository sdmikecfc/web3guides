/** Open the game itself in MetaMask, without starting a relay/signature request. */
export const METAMASK_GAME_LINK = 'https://metamask.app.link/dapp/domainkitchen.xyz';
export const WALLET_HELP_PATH = '/chef/wallet-help';
export const GAME_ADDRESS = 'https://domainkitchen.xyz';

export function isMobileWalletBrowser(navigator: { userAgent: string; platform: string; maxTouchPoints: number }) {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
