import { DOMAIN_COLLECTIBLE_BY_ID } from '../diner/domain-worlds';
import { experiencePackItems } from '../diner/pack-experience';
import { settlementConfigured, type DomainSeason } from '../diner/domain-seasons';
import { configHash, roundHash, secretHash } from './protocol';
import { assertGame, assertRound, type CatalogueBox, type Game, type Round } from './settlement';

/** Only approved season configuration can become a worker game. No production
 * addresses, pool budgets or season dates are inferred from preview fixtures. */
export function gameFromSeason(season: DomainSeason): Game {
  if (!settlementConfigured(season)) throw new Error('Season settlement configuration is incomplete');
  const game: Game = { id: season.domain, domain: season.domain, chainId: season.contract!.chainId, contract: season.contract!.address };
  assertGame(game); return game;
}
/** These are the NEW, more generous independent-opening odds. Legacy supplied
 * vectors remain in tests; they do not become Domain Kitchen's live distribution.
 * Budgets are explicit swap inputs in USDC, never a promised redemption value.
 */
export function domainBoxes(game: Game, terms: {
  regular: { boxId: string; priceUsd: number; prizeBudgetUsd: number };
  super: { boxId: string; priceUsd: number; prizeBudgetUsd: number };
}): CatalogueBox[] {
  assertGame(game);
  return (['regular', 'super'] as const).map(pack => {
    const items = experiencePackItems(game.domain, pack), term = terms[pack];
    return { boxId: term.boxId, boxType: pack === 'regular' ? 'FIVE_USDC' : 'TEN_USDC', priceUsd: term.priceUsd, pack,
      items: Object.fromEntries(items.map((item, i) => [i + 1, item.id])),
      cards: items.map((item, i) => ({ cardNumber: i + 1, weightBps: item.weight, valueUsd: term.prizeBudgetUsd })),
    };
  });
}
export function assertDomainCatalogue(game: Game, round: Round) {
  assertRound(game, round);
  for (const box of round.boxes) for (const card of box.cards) {
    const item = DOMAIN_COLLECTIBLE_BY_ID[box.items[card.cardNumber]];
    if (!item || item.domain !== game.domain || item.pack !== box.pack || item.catalogueVersion !== round.catalogueVersion) throw new Error('Round maps to the wrong domain catalogue');
  }
}
export function makeCommittedRound(game: Game, season: DomainSeason, input: { id: string; previousHash: string; startsAt: number; endsAt: number; secret: string; boxes: readonly CatalogueBox[] }): Round {
  const configured = gameFromSeason(season);
  if (configured.domain !== game.domain || configured.chainId !== game.chainId || configured.contract.toLowerCase() !== game.contract.toLowerCase()) throw new Error('Season belongs to another game');
  const round: Round = { gameId: game.id, id: input.id, startsAt: input.startsAt, endsAt: input.endsAt, previousHash: input.previousHash, secretHash: secretHash(input.secret), configHash: configHash(input.boxes), hash: '', boxes: input.boxes, seasonId: season.id, catalogueVersion: season.catalogueVersion, seasonStartsAt: season.startsAt!, seasonEndsAt: season.endsAt! };
  round.hash = roundHash(round.previousHash, round.id, round.secretHash, round.configHash);
  assertDomainCatalogue(game, round);
  return structuredClone(round);
}
