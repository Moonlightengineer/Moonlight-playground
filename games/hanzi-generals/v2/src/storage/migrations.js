import { REWARD_BY_ID } from '../../data/rewards.js';
import { eligibleEvolutionGenerals } from '../expedition/evolution-eligibility.js';

export const CURRENT_SAVE_VERSION = 3;
const MINIMUM_SAVE_VERSION = 1;
const SAFE_REWARD_FALLBACKS = Object.freeze([
  'extra-reroll', 'extra-camp', 'repair-wall', 'fire-arrows', 'first-aid',
]);

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function failure(code, message) {
  return { ok: false, error: { code, message } };
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => (
    typeof value === 'string' && value.length > 0
  )))];
}

function normalizeRewardChoices(game) {
  if (game.status !== 'reward' || !Array.isArray(game.rewardChoices)) return game;
  if (eligibleEvolutionGenerals(game).length) return game;
  const choices = game.rewardChoices.filter(({ id }) => id !== 'evolve-general');
  const seen = new Set(choices.map(({ id }) => id));
  for (const rewardId of SAFE_REWARD_FALLBACKS) {
    if (choices.length >= 3) break;
    if (seen.has(rewardId)) continue;
    const reward = REWARD_BY_ID[rewardId];
    if (!reward) continue;
    choices.push(reward);
    seen.add(rewardId);
  }
  return { ...game, rewardChoices: choices.slice(0, 3) };
}

function migrateV1ToV2(envelope) {
  const game = normalizeRewardChoices({
    ...envelope.game,
    recruitedGeneralIds: uniqueStrings(envelope.game.recruitedGeneralIds),
    rewardHistory: Array.isArray(envelope.game.rewardHistory)
      ? envelope.game.rewardHistory.map((entry) => ({ ...entry }))
      : [],
    evolutions: isObject(envelope.game.evolutions) ? { ...envelope.game.evolutions } : {},
  });
  return { schemaVersion: 2, game };
}

function normalizeCard(card) {
  return isObject(card) ? { ...card, locked: false } : card;
}

function migrateV2ToV3(envelope) {
  const game = envelope.game;
  const deck = isObject(game.deck) ? game.deck : {};
  const hand = Array.isArray(deck.hand) ? deck.hand.map(normalizeCard) : deck.hand;
  const handIds = new Set(Array.isArray(hand) ? hand.map(({ id }) => id) : []);
  const retained = uniqueStrings(deck.retained)
    .filter((cardId) => handIds.has(cardId))
    .slice(0, 2);
  const camp = isObject(game.camp) ? game.camp : {};
  const temporary = isObject(game.temporary) ? game.temporary : {};
  const extraCamp = Number.isInteger(temporary.extraCamp) && temporary.extraCamp > 0
    ? temporary.extraCamp
    : 0;
  const campIds = uniqueStrings(camp.cardIds);
  const selectableIds = new Set([...handIds, ...campIds]);
  const selection = uniqueStrings(game.selection?.cardIds)
    .filter((cardId) => selectableIds.has(cardId))
    .slice(0, 3);

  const migrated = normalizeRewardChoices({
    ...game,
    deck: {
      ...deck,
      drawPile: Array.isArray(deck.drawPile) ? deck.drawPile.map(normalizeCard) : deck.drawPile,
      discardPile: Array.isArray(deck.discardPile) ? deck.discardPile.map(normalizeCard) : deck.discardPile,
      hand,
      retained,
      deployed: Array.isArray(deck.deployed)
        ? deck.deployed.map((record) => ({
          ...record,
          cardIds: Array.isArray(record?.cardIds) ? [...record.cardIds] : record?.cardIds,
        }))
        : deck.deployed,
    },
    camp: {
      ...camp,
      capacity: Number.isInteger(camp.capacity) ? camp.capacity + extraCamp : camp.capacity,
      cardIds: campIds,
    },
    temporary: { ...temporary, extraCamp: 0 },
    selection: { cardIds: selection },
    battleReport: game.battleReport ?? null,
    lastBattleReport: game.lastBattleReport ?? null,
    battleMetrics: game.battleMetrics ?? null,
  });
  return { schemaVersion: 3, game: migrated };
}

const MIGRATIONS = Object.freeze({
  1: { id: 'v1-to-v2', migrate: migrateV1ToV2 },
  2: { id: 'v2-to-v3', migrate: migrateV2ToV3 },
});

export function migrateSaveEnvelope(input) {
  if (!isObject(input) || !isObject(input.game) || !Number.isInteger(input.schemaVersion)) {
    return failure('CORRUPT_SAVE', '存檔格式不完整。');
  }
  if (input.schemaVersion < MINIMUM_SAVE_VERSION || input.schemaVersion > CURRENT_SAVE_VERSION) {
    return failure('UNSUPPORTED_SAVE', '存檔版本不支援。');
  }

  const migratedFrom = input.schemaVersion;
  let envelope = clone(input);
  const applied = [];
  while (envelope.schemaVersion < CURRENT_SAVE_VERSION) {
    const step = MIGRATIONS[envelope.schemaVersion];
    if (!step) return failure('UNSUPPORTED_SAVE', '缺少存檔升級路徑。');
    envelope = step.migrate(envelope);
    applied.push(step.id);
  }
  return {
    ok: true,
    envelope,
    migratedFrom,
    applied,
    migrated: applied.length > 0,
  };
}

export function prepareGameForSave(game) {
  if (!isObject(game)) throw new Error('Game state must be an object.');
  const prepared = clone(game);
  delete prepared.settings;
  delete prepared.tutorial;
  delete prepared.ui;
  return prepared;
}
