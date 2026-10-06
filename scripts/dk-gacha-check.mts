import assert from 'node:assert/strict';
import { atomicUsd, canonicalBoxes, cardAtTicket, configHash, configSerialization, draw, pullCommitment, roundHash, secretHash, uint } from '../src/lib/chef/gacha/protocol';
import { assertRound, processEvent, publicRound, verifyPull, type ChainEvent, type FrozenPull } from '../src/lib/chef/gacha/settlement';
import { publicPacksEnabled } from '../src/lib/chef/diner/pack-release';
import { DOMAIN_IDS } from '../src/lib/chef/diner/domain-worlds';
import { DOMAIN_SEASONS } from '../src/lib/chef/diner/domain-seasons';
import { assertDomainCatalogue, domainBoxes, gameFromSeason, makeCommittedRound } from '../src/lib/chef/gacha/catalogue';
import { vectors as v, fixtureBoxes, game, round, secret, fixtureRequest, block, hash } from './fixtures/dk-gacha';
let count = 0;
function test(name: string, fn: () => void) { fn(); count++; console.log(`PASS ${name}`); }
const boxes = fixtureBoxes();
test('Pinned legacy HMAC and hashes reproduce byte for byte', () => {
  const weights = [250,950,950,950,950,950,950,950,950,950,1150,50];
  const specBoxes = boxes.map(b => ({ ...b, cards: b.cards.map((c, i) => ({ ...c, weightBps: weights[i] })) }));
  assert.equal(secretHash(v.A_repoPinnedVectors.secretKey), v.A_repoPinnedVectors.secretKeyHash);
  assert.deepEqual(draw(v.A_repoPinnedVectors.drawInput, specBoxes[0].cards), v.A_repoPinnedVectors.draw);
  assert.equal(configHash(specBoxes), v.A_repoPinnedVectors.boxConfigsHashOfSpecTable);
  assert.equal(configSerialization(boxes), v.B_roundChain.boxConfigsSerialization);
  for (const r of v.B_roundChain.rounds) assert.equal(roundHash(r.prevRoundHash, String(r.roundId), secretHash(r.secretKey), configHash(boxes)), r.roundHash);
});
test('Four production-format draws and integer token amounts', () => {
  for (const c of v.C_draws) {
    const box = boxes.find(b => b.boxType === c.boxType)!;
    assert.deepEqual(draw(c.input, box.cards), c.result);
    assert.equal(atomicUsd(box.priceUsd), c.usdcSpentAtomic);
    assert.equal(atomicUsd(box.cards.find(x => x.cardNumber === c.result.cardNumber)!.valueUsd), c.prizeAmountAtomic);
  }
  assert.throws(() => atomicUsd(0.0000001)); assert.throws(() => atomicUsd(NaN));
  assert.throws(() => uint('01')); assert.throws(() => uint((BigInt(1) << BigInt(256)).toString()));
  assert.equal(uint('9007199254740993'), '9007199254740993');
});
test('Casing and prefixes retain the documented legacy meaning', () => {
  const baseline = v.C_draws[0].input;
  const variants = { baseline: {}, lowercaseWallet: { walletAddress: baseline.walletAddress.toLowerCase() }, roundHashWith0xPrefix: { roundHash: `0x${baseline.roundHash}` }, uppercaseTxHashHex: { txHash: `0x${baseline.txHash.slice(2).toUpperCase()}` }, uppercaseSecretKeyHex: { secretKey: baseline.secretKey.toUpperCase() } };
  for (const [name, overrides] of Object.entries(variants)) assert.deepEqual(draw({ ...baseline, ...overrides }, boxes[0].cards), v.D_encodingSensitivity[name as keyof typeof variants]);
});
test('20,000 tickets conserve odds; reversing cards cannot change an outcome', () => {
  for (const box of boxes) {
    const counts = new Map<number, number>();
    for (let i = 0; i < 10000; i++) { const n = cardAtTicket([...box.cards].reverse(), i).cardNumber; counts.set(n, (counts.get(n) ?? 0) + 1); }
    for (const card of box.cards) assert.equal(counts.get(card.cardNumber), card.weightBps);
    assert.deepEqual(draw(v.C_draws[0].input, box.cards), draw(v.C_draws[0].input, [...box.cards].reverse()));
  }
  for (const sample of v.E_weightMapping.boundaries) assert.equal(cardAtTicket(boxes[0].cards, sample.draw).cardNumber, sample.cardNumber);
  assert.equal(configHash(boxes), configHash([...boxes].reverse().map(b => ({ ...b, cards: [...b.cards].reverse() }))));
  assert.throws(() => canonicalBoxes([boxes[0], { ...boxes[1], priceUsd: 5 }]));
  assert.throws(() => cardAtTicket(boxes[0].cards, 10000));
});
const request = fixtureRequest();
const initial = processEvent({ game, round, event: request, canonicalBlock: block('100'), nextBlock: block('101'), secret });
const pull = initial.pull! as FrozenPull;
const fulfilled: Extract<ChainEvent, { kind: 'fulfilled' }> = { ...request, kind: 'fulfilled', transactionHash: hash('fulfilled'), blockHash: block('102').hash, blockNumber: '102', timestamp: block('102').timestamp, roundId: pull.roundId, boxId: pull.boxId, cardNumber: pull.cardNumber, prizeAmount: pull.prizeAmount, prizeTokenAmount: '123456789012345678901234567890', source: pull.source };
const final = processEvent({ game, event: fulfilled, canonicalBlock: block('102'), pull });
test('Frozen fulfillment reproduces the Solidity commitment', () => {
  assertRound(game, round);
  assert.equal(pull.commitment, v.G_onChainCommitment.commitmentHash);
  assert.equal(pull.cardNumber, v.C_draws[0].result.cardNumber);
  assert.equal(final.opening?.tokenId, '1'); assert.equal(final.opening?.source, 'chain');
  assert(final.pull && !('refusal' in final.pull));
  assert.equal(final.pull.prizeTokenAmount, fulfilled.prizeTokenAmount);
  assert.equal(pullCommitment(pull.source, pull.cardNumber, pull.prizeAmount), pull.commitment);
});
test('Cross-game and changed outcomes fail; wrong payments become refunds', () => {
  assert.throws(() => processEvent({ game: { ...game, id: 'test-wines' }, event: request, canonicalBlock: block('100'), round, secret, nextBlock: block('101') }));
  assert.equal(processEvent({ game, event: { ...request, price: '5000001' }, canonicalBlock: block('100'), round, secret, nextBlock: block('101') }).job?.kind, 'refund');
  assert.throws(() => processEvent({ game, event: request, canonicalBlock: block('100'), round, secret, nextBlock: { ...block('101'), parentHash: hash('wrong') } }));
  assert.throws(() => processEvent({ game, event: { ...fulfilled, source: { ...pull.source, randomness: hash('wrong') } }, canonicalBlock: block('102'), pull }));
  assert.throws(() => processEvent({ game, event: fulfilled, canonicalBlock: block('102'), pull: final.pull }));
});
test('All three domains use the new odds and only their own 24 items', () => {
  for (const [i, domain] of DOMAIN_IDS.entries()) {
    const season = { ...DOMAIN_SEASONS.find(s => s.domain === domain)!, startsAt: round.seasonStartsAt, endsAt: round.seasonEndsAt, approved: true, feesApproved: true, fundingApproved: true, protocolVersion: 'legacy-canonical-cards', contract: { chainId: 97477, address: `0x${String(i + 1).repeat(40)}` }, backingToken: { address: `0x${String(i + 4).repeat(40)}`, symbol: 'TEST', decimals: 18 } };
    const g = gameFromSeason(season);
    const b = domainBoxes(g, { regular: { boxId:'1000',priceUsd:5,prizeBudgetUsd:4.988 },super:{ boxId:'1001',priceUsd:10,prizeBudgetUsd:9.98 } });
    const r = makeCommittedRound(g,season,{ id:'1',previousHash:'0'.repeat(64),startsAt:round.startsAt,endsAt:round.endsAt,secret,boxes:b });
    assert.equal(b.flatMap(box=>Object.values(box.items)).length,24);
    for (const box of b) { assert.equal(box.cards.reduce((s,c)=>s+c.weightBps,0),10000); assert.equal(box.cards[11].weightBps,250); }
    assertDomainCatalogue(g,r);
    assert.throws(()=>assertDomainCatalogue({ ...g,domain:domain==='wines'?'smoothie':'wines' },r));
    assert.throws(()=>gameFromSeason({ ...season,fundingApproved:false }));
  }
});
test('Invalid reveals cannot publish a secret; verifier waits for the same end time', () => {
  const reveal: ChainEvent = { ...request, kind: 'revealed', roundId: round.id, timestamp: round.endsAt, secret: `0x${secret}`, secretKeyHash: `0x${round.secretHash}` };
  const canonical = { ...block('100'), timestamp: round.endsAt };
  assert.throws(() => processEvent({ game, round, event: { ...reveal, secret: hash('fake') }, canonicalBlock: canonical }));
  assert.throws(() => processEvent({ game, round, event: { ...reveal, contract: '0x2222222222222222222222222222222222222222' }, canonicalBlock: canonical }));
  assert.throws(() => processEvent({ game, round, event: { ...reveal, timestamp: round.endsAt - 1 }, canonicalBlock: { ...canonical, timestamp: round.endsAt - 1 } }));
  assert.equal(processEvent({ game, round, event: reveal, canonicalBlock: canonical }).reveal?.secret, secret);
  assert.equal(publicRound(round, round.endsAt - 1, secret).secret, null);
  assert.equal(publicRound(round, round.endsAt, secret).secret, secret);
  assert.deepEqual(verifyPull(round, final.pull! as FrozenPull, round.endsAt - 1, secret), { available: false });
  assert.equal(verifyPull(round, final.pull! as FrozenPull, round.endsAt, secret).valid, true);
  assert.equal(JSON.stringify(publicRound(round, 0, secret)).includes(secret), false);
});
test('Refunds earn no opening; redemption retains historical opening credit', () => {
  const refund = processEvent({ game, pull, event: { ...request, kind: 'refunded', blockNumber: '102', blockHash: block('102').hash, timestamp: block('102').timestamp }, canonicalBlock: block('102') });
  assert.equal(refund.pull?.status, 'refunded'); assert.equal(refund.opening, undefined);
  const redeemed = processEvent({ game, pull: final.pull, event: { ...request, kind: 'burned', owner: '0x2222222222222222222222222222222222222222', prizeTokenAmount: fulfilled.prizeTokenAmount, blockNumber: '103', blockHash: block('103').hash, timestamp: block('103').timestamp }, canonicalBlock: block('103') });
  assert(redeemed.pull && !('refusal' in redeemed.pull));
  assert.equal(redeemed.pull.redeemed, true); assert.equal(redeemed.pull.player, pull.player); assert.equal(redeemed.opening, undefined);
});
test('Environment switches alone cannot enable paid packs', () => assert.equal(publicPacksEnabled({ DINER_PACKS_RELEASE: 'true' }), false));
console.log(`${count} gacha protocol/settlement groups passed. No chain or production writes.`);
