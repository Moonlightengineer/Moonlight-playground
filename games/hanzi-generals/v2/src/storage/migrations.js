import { REWARDS } from '../../data/rewards.js';
import { normalizeRewardChoices as normalizeEligibleRewardChoices } from '../reward/reward-flow.js';

export const CURRENT_SAVE_VERSION = 3;
const MINIMUM_SAVE_VERSION = 1;

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function owns(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
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

function optionalStringArray(object, key) {
  if (!owns(object, key) || object[key] === undefined) return [];
  const values = object[key];
  if (!Array.isArray(values)) throw new TypeError(`${key} must be an array.`);
  if (values.some((value) => typeof value !== 'string' || !value)) {
    throw new TypeError(`${key} must contain strings only.`);
  }
  return [...new Set(values)];
}

function optionalObjectArray(object, key) {
  if (!owns(object, key) || object[key] === undefined) return [];
  const values = object[key];
  if (!Array.isArray(values)) throw new TypeError(`${key} must be an array.`);
  if (values.some((entry) => !isObject(entry))) {
    throw new TypeError(`${key} must contain objects only.`);
  }
  return values.map((entry) => ({ ...entry }));
}

function optionalStringMap(object, key) {
  if (!owns(object, key) || object[key] === undefined) return {};
  const value = object[key];
  if (!isObject(value)) throw new TypeError(`${key} must be an object.`);
  if (Object.values(value).some((entry) => typeof entry !== 'string' || !entry)) {
    throw new TypeError(`${key} values must be strings.`);
  }
  return { ...value };
}

function normalizeProgressFields(game) {
  return {
    ...game,
    recruitedGeneralIds: optionalStringArray(game, 'recruitedGeneralIds'),
    rewardHistory: optionalObjectArray(game, 'rewardHistory'),
    evolutions: optionalStringMap(game, 'evolutions'),
  };
}

function stripTransientSelection(game) {
  if (!isObject(game) || !owns(game, 'selection')) return game;
  const next = { ...game };
  delete next.selection;
  return next;
}

function normalizeRewardSnapshot(game) {
  if (game.status !== 'reward') return game;
  if (!Array.isArray(game.rewardChoices)) {
    throw new TypeError('rewardChoices must be an array.');
  }
  if (game.rewardChoices.some((choice) => !isObject(choice) || typeof choice.id !== 'string')) {
    throw new TypeError('rewardChoices must contain valid reward objects.');
  }
  return {
    ...game,
    rewardChoices: normalizeEligibleRewardChoices(game, game.rewardChoices, REWARDS, 3),
  };
}

function normalizeCurrentGame(game) {
  return normalizeRewardSnapshot(normalizeProgressFields(stripTransientSelection(game)));
}

function migrateV1ToV2(envelope) {
  return {
    schemaVersion: 2,
    game: normalizeRewardSnapshot(normalizeProgressFields(envelope.game)),
  };
}

function normalizeCard(card) {
  if (!isObject(card)) throw new TypeError('Card zones must contain card objects.');
  return { ...card, locked: false };
}

function normalizeCardArray(values, label) {
  if (values === undefined) return undefined;
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  return values.map(normalizeCard);
}

function normalizeDeployed(values) {
  if (values === undefined) return undefined;
  if (!Array.isArray(values)) throw new TypeError('deployed must be an array.');
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
  const game = normalizeProgressFields(envelope.game);
  const deck = isObject(game.deck) ? game.deck : {};
  const hand = normalizeCardArray(deck.hand, 'hand');
  const handIds = new Set(Array.isArray(hand)
    ? hand.map((card) => card.id).filter((id) => typeof id === 'string' && id)
    : []);
  const retained = optionalStringArray(deck, 'retained')
    .filter((cardId) => handIds.has(cardId))
    .slice(0, 2);
  const camp = isObject(game.camp) ? game.camp : {};
  const temporary = isObject(game.temporary) ? game.temporary : {};
  const extraCamp = Number.isInteger(temporary.extraCamp) && temporary.extraCamp > 0
    ? temporary.extraCamp
    : 0;
  const campIds = optionalStringArray(camp, 'cardIds');

  const migrated = normalizeRewardSnapshot({
    ...stripTransientSelection(game),
    deck: {
      ...deck,
      drawPile: normalizeCardArray(deck.drawPile, 'drawPile'),
      discardPile: normalizeCardArray(deck.discardPile, 'discardPile'),
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

    const beforeNormalization = JSON.stringify(envelope.game);
    envelope = { ...envelope, game: normalizeCurrentGame(envelope.game) };
    const normalized = JSON.stringify(envelope.game) !== beforeNormalization;
    return {
      ok: true,
      envelope,
      migratedFrom,
      applied,
      migrated: applied.length > 0 || normalized,
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
