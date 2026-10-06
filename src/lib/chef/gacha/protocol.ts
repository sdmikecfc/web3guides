/** Node-only compatibility layer for the supplied Gochujang extraction vectors.
 * Keep the legacy UTF-8 preimage intact. Game isolation belongs in storage and
 * contract routing, not in an unannounced change to the random draw.
 */
import { createHash, createHmac } from 'node:crypto';
import { encodeAbiParameters, getAddress, keccak256, type Hex } from 'viem';

export interface GachaCard { cardNumber: number; weightBps: number; valueUsd: number }
export interface GachaBox { boxId: string; boxType: string; priceUsd: number; cards: readonly GachaCard[] }
export interface DrawInput { secretKey: string; roundHash: string; nonce: string; walletAddress: string; txHash: string; blockHash: string }
export interface RandomnessSource {
  boxConfigsHash: Hex; randomness: Hex; roundHash: Hex; roundSecretKeyHash: Hex;
  pullTxHash: Hex; pullNextBlockHash: Hex; pullNextBlockTimestamp: string;
}
const UINT_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);
export function uint(value: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) > UINT_MAX) throw new Error('Invalid unsigned integer');
  return value;
}
export function bareHash(value: string): string {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value)) throw new Error('Invalid SHA-256 hash');
  return value.toLowerCase();
}
export function chainHash(value: string): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error('Invalid chain hash');
  return value.toLowerCase() as Hex;
}
export function wallet(value: string): string { return getAddress(value.toLowerCase()); }
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function secretHash(secret: string): string { return sha256(Buffer.from(bareHash(secret), 'hex')); }
export function atomicUsd(value: number): string {
  // The legacy commitment uses JS's number spelling. Never multiply a float by 1e6.
  if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid USD amount');
  const text = String(value);
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(text)) throw new Error('USD amount requires at most six decimals');
  const [whole, fraction = ''] = text.split('.');
  return uint((BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6, '0'))).toString());
}
export function canonicalCards(cards: readonly GachaCard[]): GachaCard[] {
  if (!cards.length || cards.length > 256) throw new Error('Invalid card count');
  const sorted = cards.map(card => ({ ...card })).sort((a, b) => a.cardNumber - b.cardNumber);
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const card = sorted[i];
    if (!Number.isInteger(card.cardNumber) || card.cardNumber < 0 || card.cardNumber > 255 || sorted[i - 1]?.cardNumber === card.cardNumber) throw new Error('Invalid or duplicate card number');
    if (!Number.isSafeInteger(card.weightBps) || card.weightBps <= 0) throw new Error('Invalid card weight');
    atomicUsd(card.valueUsd); total += card.weightBps;
  }
  if (!Number.isSafeInteger(total)) throw new Error('Invalid weight total');
  return sorted;
}
export function canonicalBoxes(boxes: readonly GachaBox[]): GachaBox[] {
  if (!boxes.length || boxes.length > 32) throw new Error('Invalid box count');
  const ids = new Set<string>(), types = new Set<string>(), prices = new Set<string>();
  return boxes.map(box => {
    uint(box.boxId);
    if (!/^[A-Z0-9_-]{1,64}$/.test(box.boxType)) throw new Error('Invalid box type');
    const price = atomicUsd(box.priceUsd);
    if (ids.has(box.boxId) || types.has(box.boxType) || prices.has(price)) throw new Error('Box IDs, types and prices must be unique within a game');
    ids.add(box.boxId); types.add(box.boxType); prices.add(price);
    const cards = canonicalCards(box.cards);
    if (cards.reduce((sum, c) => sum + c.weightBps, 0) !== 10000) throw new Error('Pack odds must total 10000 basis points');
    if (cards.some(c => c.valueUsd > box.priceUsd)) throw new Error('Prize exceeds pack price');
    return { ...box, cards };
  });
}
export function configSerialization(boxes: readonly GachaBox[]): string {
  return canonicalBoxes(boxes).map(box => `${box.boxType}|${box.priceUsd}|${box.cards.map(c => `${c.cardNumber}:${c.weightBps}:${c.valueUsd}`).join(',')}`).sort().join(';');
}
export const configHash = (boxes: readonly GachaBox[]) => sha256(configSerialization(boxes));
export function roundHash(previous: string, id: string, secretKeyHash: string, boxConfigsHash: string): string {
  return sha256(`${bareHash(previous)}:${uint(id)}:${bareHash(secretKeyHash)}:${bareHash(boxConfigsHash)}`);
}
export function cardAtTicket(cards: readonly GachaCard[], ticket: number): GachaCard {
  const sorted = canonicalCards(cards);
  const total = sorted.reduce((sum, c) => sum + c.weightBps, 0);
  if (!Number.isSafeInteger(ticket) || ticket < 0 || ticket >= total) throw new Error('Ticket outside distribution');
  let boundary = 0;
  for (const card of sorted) { boundary += card.weightBps; if (ticket < boundary) return card; }
  throw new Error('Invalid distribution');
}
export function draw(input: DrawInput, cards: readonly GachaCard[]) {
  uint(input.nonce); bareHash(input.secretKey);
  // Deliberately do not normalize strings here: pinned legacy vectors include
  // prefixed round hashes and non-checksummed wallets. The worker normalizes its inputs.
  if (!/^(0x)?[a-fA-F0-9]{64}$/.test(input.roundHash) || !/^0x[a-fA-F0-9]{40}$/.test(input.walletAddress)) throw new Error('Invalid draw input');
  chainHash(input.txHash); chainHash(input.blockHash);
  const message = `${input.roundHash}:${input.nonce}:${input.walletAddress}:${input.txHash}:${input.blockHash}`;
  const randomness = createHmac('sha256', Buffer.from(input.secretKey, 'hex')).update(message, 'utf8').digest('hex');
  const sorted = canonicalCards(cards), total = sorted.reduce((sum, c) => sum + c.weightBps, 0);
  const ticket = Number(BigInt(`0x${randomness}`) % BigInt(total));
  return { randomness, draw: ticket, cardNumber: cardAtTicket(sorted, ticket).cardNumber };
}
export function boxForPayment(boxes: readonly GachaBox[], paidAtomic: string): GachaBox {
  uint(paidAtomic);
  const box = canonicalBoxes(boxes).find(b => atomicUsd(b.priceUsd) === paidAtomic);
  if (!box) throw new Error('Payment does not match a configured pack');
  return box;
}
export function pullCommitment(source: RandomnessSource, cardNumber: number, prizeAmount: string): Hex {
  if (!Number.isInteger(cardNumber) || cardNumber < 0 || cardNumber > 255) throw new Error('Invalid card number');
  return keccak256(encodeAbiParameters([
    { type: 'tuple', components: [
      { name: 'boxConfigsHash', type: 'bytes32' }, { name: 'randomness', type: 'bytes32' },
      { name: 'roundHash', type: 'bytes32' }, { name: 'roundSecretKeyHash', type: 'bytes32' },
      { name: 'pullTxHash', type: 'bytes32' }, { name: 'pullNextBlockHash', type: 'bytes32' },
      { name: 'pullNextBlockTimestamp', type: 'uint256' },
    ] }, { type: 'uint8' }, { type: 'uint256' },
  ], [{ ...source, boxConfigsHash: chainHash(source.boxConfigsHash), randomness: chainHash(source.randomness), roundHash: chainHash(source.roundHash), roundSecretKeyHash: chainHash(source.roundSecretKeyHash), pullTxHash: chainHash(source.pullTxHash), pullNextBlockHash: chainHash(source.pullNextBlockHash), pullNextBlockTimestamp: BigInt(uint(source.pullNextBlockTimestamp)) }, cardNumber, BigInt(uint(prizeAmount))]));
}
