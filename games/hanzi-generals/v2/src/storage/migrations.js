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

function corruptSave() {
  return failure('CORRUPT_SAVE', '存檔內容已損壞，可重設 v2 存檔。');
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => (
    typeof value === 'string' && value.length > 0
  )))];
}

function cloneObjectArray(values, label) {
  if (!Array.isArray(values)) return [];
  if (values.some((entry) => !isObject(entry))) {
    throw new TypeError(`${label} must contain objects only.`);
  }
  return values.map((entry) => ({ ...entry }));
}

function stripTransientSelection(game) {
  if (!isObject(game) || !Object.prototype.hasOwnProperty.call(game, 'selection')) return game;
  const next = { ...game };
  delete next.selection;
  return next;
}

function normalizeRewardChoices(game) {
  if (game.status !== 'reward') return game;
  if (!Array.isArray(game.rewardChoices)) {
    throw new TypeError('rewardChoices must be an array.');
  }
  if (game.rewardChoices.some((choice) => !isObject(choice) || typeof choice.id !== 'string')) {
    throw new TypeError('rewardChoices must contain valid reward objects.');
  }
  const source = game.rewardChoices.map((choice) => ({ ...choice }));
  if (eligibleEvolutionGenerals(game).length) return { ...game, rewardChoices: source };
  const choices = source.filter(({ id }) => id !== 'evolve-general');
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
    rewardHistory: cloneObjectArray(envelope.game.rewardHistory, 'rewardHistory'),
    evolutions: isObject(envelope.game.evolutions) ? { ...envelope.game.evolutions } : {},
  });
  return { schemaVersion: 2, game };
}

function normalizeCard(card) {
  if (!isObject(card)) throw new TypeError('Card zones must contain card objects.');
  return { ...card, locked: false };
}

function normalizeCardArray(values) {
  if (!Array.isArray(values)) return values;
  return values.map(normalizeCard);
}

function normalizeDeployed(values) {
  if (!Array.isArray(values)) return values;
  return values.map((record) => {
    if (!isObject(record) || !Array.isArray(record.cardIds)) {
      throw new TypeError('deployed must contain valid records.');
    }
    if (record.cardIds.some((cardId) => typeof cardId !== 'string' || !cardId)) {
      throw new TypeError('deployed cardIds must contain strings only.');
    }
    return { ...record, cardIds: [...record.cardIds] };
  });
}

function migrateV2ToV3(envelope) {
  const game = envelope.game;
  const deck = isObject(game.deck) ? game.deck : {};
  const hand = normalizeCardArray(deck.hand);
  const handIds = new Set(Array.isArray(hand)
    ? hand.map((card) => card.id).filter((id) => typeof id === 'string' && id)
    : []);
  const retained = uniqueStrings(deck.retained)
    .filter((cardId) => handIds.has(cardId))
    .slice(0, 2);
  const camp = isObject(game.camp) ? game.camp : {};
  const temporary = isObject(game.temporary) ? game.temporary : {};
  const extraCamp = Number.isInteger(temporary.extraCamp) && temporary.extraCamp > 0
    ? temporary.extraCamp
    : 0;
  const campIds = uniqueStrings(camp.cardIds);

  const migrated = normalizeRewardChoices({
    ...stripTransientSelection(game),
    recruitedGeneralIds: uniqueStrings(game.recruitedGeneralIds),
    rewardHistory: cloneObjectArray(game.rewardHistory, 'rewardHistory'),
    evolutions: isObject(game.evolutions) ? { ...game.evolutions } : {},
    deck: {
      ...deck,
      drawPile: normalizeCardArray(deck.drawPile),
      discardPile: normalizeCardArray(deck.discardPile),
      hand,
      retained,
      deployed: normalizeDeployed(deck.deployed),
    },
    camp: {
      ...camp,
      capacity: Number.isInteger(camp.capacity) ? camp.capacity + extraCamp : camp.capacity,
      cardIds: campIds,
    },
    temporary: { ...temporary, extraCamp: 0 },
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

  try {
    const migratedFrom = input.schemaVersion;
    let envelope = clone(input);
    const applied = [];
    while (envelope.schemaVersion < CURRENT_SAVE_VERSION) {
      const step = MIGRATIONS[envelope.schemaVersion];
      if (!step) return failure('UNSUPPORTED_SAVE', '缺少存檔升級路徑。');
      envelope = step.migrate(envelope);
      if (!isObject(envelope) || !isObject(envelope.game) || !Number.isInteger(envelope.schemaVersion)) {
        return corruptSave();
      }
      applied.push(step.id);
    }

    const selectionWasPresent = Object.prototype.hasOwnProperty.call(envelope.game, 'selection');
    envelope = { ...envelope, game: stripTransientSelection(envelope.game) };
    return {
      ok: true,
      envelope,
      migratedFrom,
      applied,
      migrated: applied.length > 0 || selectionWasPresent,
    };
  } catch {
    return corruptSave();
  }
}

export function prepareGameForSave(game) {
  if (!isObject(game)) throw new Error('Game state must be an object.');
  const prepared = clone(game);
  delete prepared.settings;
  delete prepared.tutorial;
  delete prepared.ui;
  delete prepared.selection;
  return prepared;
}
