import { encodeFunctionData, type Address, type Hex } from 'viem';
import { pullGameAbi } from './pull-game-abi';
import { assertGame, assertRound, type Game, type Round, type StoredPull } from './settlement';
import { bareHash, chainHash, pullCommitment, secretHash, uint, wallet } from './protocol';

export interface GachaContractCall { chainId: number; to: Address; data: Hex; value: '0' }
/** Unsigned, strictly scoped calldata for the approved custody adapter. These
 * builders do not broadcast, load a wallet key, estimate returns or grant credit. */
export function settlementCall(game: Game, operation: 'fulfill' | 'refund', pull: StoredPull): GachaContractCall {
  assertGame(game);
  if (pull.gameId !== game.id || pull.request.gameId !== game.id || pull.request.chainId !== game.chainId || wallet(pull.request.contract) !== wallet(game.contract) || pull.status !== 'pending') throw new Error('Call does not belong to a pending game request');
  const nonce = BigInt(uint(pull.nonce));
  if (operation === 'refund') return { chainId: game.chainId, to: game.contract as Address, value: '0', data: encodeFunctionData({ abi: pullGameAbi, functionName: 'refund', args: [nonce] }) };
  if (operation !== 'fulfill' || 'refusal' in pull || chainHash(pull.source.pullTxHash) !== chainHash(pull.request.transactionHash) || pullCommitment(pull.source, pull.cardNumber, pull.prizeAmount) !== pull.commitment) throw new Error('Invalid frozen fulfillment call');
  return { chainId: game.chainId, to: game.contract as Address, value: '0', data: encodeFunctionData({ abi: pullGameAbi, functionName: 'fulfill', args: [nonce, { ...pull.source, pullNextBlockTimestamp: BigInt(uint(pull.source.pullNextBlockTimestamp)) }, BigInt(uint(pull.roundId)), BigInt(uint(pull.boxId)), pull.cardNumber, BigInt(uint(pull.prizeAmount))] }) };
}
export function revealCall(game: Game, round: Round, secret: string, now: number): GachaContractCall {
  assertRound(game, round);
  if (!Number.isSafeInteger(now) || now < round.endsAt || bareHash(secret) === '0'.repeat(64) || secretHash(secret) !== round.secretHash) throw new Error('Round secret cannot be revealed');
  return { chainId: game.chainId, to: game.contract as Address, value: '0', data: encodeFunctionData({ abi: pullGameAbi, functionName: 'revealRound', args: [BigInt(uint(round.id)), `0x${bareHash(secret)}`] }) };
}
