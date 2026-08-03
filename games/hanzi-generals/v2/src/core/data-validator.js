const REQUIRED_STAGE_IDS = Object.freeze([
  'tutorial',
  'shield-line',
  'route-safe',
  'route-danger',
  'cavalry-warning',
  'elite-mixed',
  'hua-xiong',
]);

const REQUIRED_REWARD_IDS = Object.freeze([
  'copy-card',
  'remove-card',
  'evolve-general',
  'repair-wall',
  'extra-reroll',
  'extra-camp',
  'fire-arrows',
  'first-aid',
  'expand-wing',
  'expand-depth',
  'unlock-huang-zhong',
  'unlock-zhang-fei',
  'unlock-zhuge-liang',
]);

const REQUIRED_STARTING_RECIPE_IDS = Object.freeze([
  'shield-troop',
  'spear-troop',
  'archer',
  'cavalry',
  'field-medic',
  'scout',
  'strategist',
  'zhang-fei',
  'zhang-ren',
  'ren-jun',
  'guan-yu',
  'guan-ping',
  'wang-ping',
  'zhao-yun',
  'zhao-tong',
  'ling-tong',
]);

const REQUIRED_REWARD_PACK_RECIPE_IDS = Object.freeze([
  'huang-zhong',
  'lu-bu',
  'lu-meng',
  'zhuge-liang',
]);

const APPROVED_STARTING_SYMBOL_COUNTS = Object.freeze({
  兵: 7,
  盾: 3,
  槍: 3,
  弓: 3,
  騎: 3,
  軍: 1,
  醫: 1,
  斥: 1,
  候: 1,
  謀: 1,
  士: 1,
  張: 2,
  任: 2,
  平: 2,
  飛: 1,
  峻: 1,
  關: 1,
  羽: 1,
  王: 1,
  趙: 1,
  雲: 1,
  凌: 1,
  統: 1,
});

const SUPPORTED_TIERS = Object.freeze(['troop', 'ordinary', 'notable', 'famous']);
const SUPPORTED_AVAILABILITY = Object.freeze(['starting', 'reward-pack']);
const SUPPORTED_VISIBILITY = Object.freeze(['public', 'clue', 'silhouette']);

function duplicateIds(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return [...duplicates];
}

function validateDescription(ownerType, ownerId, description, errors) {
  for (const field of ['summary', 'effect', 'useCase']) {
    if (typeof description?.[field] !== 'string' || !description[field].trim()) {
      errors.push(`${ownerType} ${ownerId} missing description.${field}`);
    }
  }
}

function symbolCounts(symbols) {
  const counts = {};
  for (const symbol of symbols ?? []) counts[symbol] = (counts[symbol] ?? 0) + 1;
  return counts;
}

function validateStartingNetwork(RECIPES, STARTING_SYMBOLS, errors) {
  if (!Array.isArray(STARTING_SYMBOLS)) {
    errors.push('STARTING_SYMBOLS must be an array');
    return;
  }

  if (STARTING_SYMBOLS.length !== 40) {
    errors.push('STARTING_SYMBOLS must contain exactly 40 cards');
  }

  const actualCounts = symbolCounts(STARTING_SYMBOLS);
  for (const [symbol, expected] of Object.entries(APPROVED_STARTING_SYMBOL_COUNTS)) {
    if (actualCounts[symbol] !== expected) {
      errors.push(`STARTING_SYMBOLS ${symbol} must appear ${expected} times`);
    }
  }
  for (const symbol of Object.keys(actualCounts)) {
    if (!(symbol in APPROVED_STARTING_SYMBOL_COUNTS)) {
      errors.push(`STARTING_SYMBOLS contains unapproved symbol ${symbol}`);
    }
  }

  const startingRecipes = (RECIPES ?? []).filter(({ availability }) => availability === 'starting');
  const startingIds = new Set(startingRecipes.map(({ id }) => id));
  const rewardPackIds = new Set(
    (RECIPES ?? []).filter(({ availability }) => availability === 'reward-pack').map(({ id }) => id),
  );
  for (const id of REQUIRED_STARTING_RECIPE_IDS) {
    if (!startingIds.has(id)) errors.push(`missing starting recipe ${id}`);
  }
  for (const id of REQUIRED_REWARD_PACK_RECIPE_IDS) {
    if (!rewardPackIds.has(id)) errors.push(`missing reward-pack recipe ${id}`);
  }

  const deckSymbols = new Set(STARTING_SYMBOLS);
  const usableSymbols = new Set(startingRecipes.flatMap(({ symbols }) => symbols ?? []));
  for (const symbol of deckSymbols) {
    if (!usableSymbols.has(symbol)) errors.push(`starting symbol ${symbol} has no starting recipe`);
  }
  for (const recipe of startingRecipes) {
    for (const symbol of recipe.symbols ?? []) {
      if (!deckSymbols.has(symbol)) {
        errors.push(`starting recipe ${recipe.id} uses missing starting symbol ${symbol}`);
      }
    }
  }
}

export function validateGameData({
  GENERALS,
  ENEMIES,
  RECIPES,
  STAGES,
  REWARDS,
  TUNING,
  STARTING_SYMBOLS,
}) {
  const errors = [];
  const collections = { GENERALS, ENEMIES, RECIPES, STAGES, REWARDS };

  for (const [name, items] of Object.entries(collections)) {
    if (!Array.isArray(items) || items.length === 0) {
      errors.push(`${name} must be a non-empty array`);
      continue;
    }
    for (const id of duplicateIds(items)) errors.push(`${name} has duplicate id ${id}`);
  }

  const units = new Set((GENERALS || []).map(({ id }) => id));
  const enemies = new Set((ENEMIES || []).map(({ id }) => id));
  const stageIds = new Set((STAGES || []).map(({ id }) => id));
  const rewardIds = new Set((REWARDS || []).map(({ id }) => id));

  for (const recipe of RECIPES || []) {
    if (!units.has(recipe.outputId)) {
      errors.push(`recipe ${recipe.id} has missing outputId ${recipe.outputId}`);
    }
    if (!Array.isArray(recipe.symbols) || recipe.symbols.length < 2) {
      errors.push(`recipe ${recipe.id} requires at least two symbols`);
    }
    if (!['general', 'troop'].includes(recipe.outputType)) {
      errors.push(`recipe ${recipe.id} has unsupported outputType ${recipe.outputType}`);
    }
    if (!SUPPORTED_AVAILABILITY.includes(recipe.availability)) {
      errors.push(`recipe ${recipe.id} has unsupported availability ${recipe.availability}`);
    }
    if (!SUPPORTED_VISIBILITY.includes(recipe.visibility)) {
      errors.push(`recipe ${recipe.id} has unsupported visibility ${recipe.visibility}`);
    }
    if (recipe.availability === 'starting') {
      const expectedVisibility = recipe.outputType === 'troop' ? 'public' : 'clue';
      if (recipe.visibility !== expectedVisibility) {
        errors.push(`starting recipe ${recipe.id} must use ${expectedVisibility} visibility`);
      }
    }
    if (recipe.availability === 'reward-pack' && recipe.visibility !== 'silhouette') {
      errors.push(`reward-pack recipe ${recipe.id} must use silhouette visibility`);
    }
  }

  for (const unit of GENERALS || []) {
    for (const field of ['maxHp', 'damage', 'attackEvery', 'range']) {
      if (!Number.isFinite(unit[field]) || unit[field] <= 0) {
        errors.push(`unit ${unit.id} has invalid ${field}`);
      }
    }
    if (!SUPPORTED_TIERS.includes(unit.tier)) {
      errors.push(`unit ${unit.id} has unsupported tier ${unit.tier}`);
    }
    if (typeof unit.rangeLabel !== 'string' || !unit.rangeLabel.trim()) {
      errors.push(`unit ${unit.id} missing rangeLabel`);
    }
    if (typeof unit.ability !== 'string' || !unit.ability.trim()) {
      errors.push(`unit ${unit.id} missing ability`);
    }
  }

  for (const enemy of ENEMIES || []) {
    for (const field of ['maxHp', 'damage', 'attackEvery', 'moveEvery']) {
      if (!Number.isFinite(enemy[field]) || enemy[field] <= 0) {
        errors.push(`enemy ${enemy.id} has invalid ${field}`);
      }
    }
  }

  for (const stage of STAGES || []) {
    if (!Array.isArray(stage.phases) || stage.phases.length !== 3) {
      errors.push(`stage ${stage.id} must contain exactly three phases`);
      continue;
    }
    for (const phase of stage.phases) {
      if (!Array.isArray(phase.spawns) || phase.spawns.length === 0) {
        errors.push(`stage ${stage.id} phase ${phase.id} has no spawns`);
        continue;
      }
      for (const spawn of phase.spawns) {
        if (!enemies.has(spawn.enemyId)) {
          errors.push(`stage ${stage.id} has missing enemyId ${spawn.enemyId}`);
        }
        if (!Number.isInteger(spawn.lane) || spawn.lane < 0 || spawn.lane > 3) {
          errors.push(`stage ${stage.id} has invalid lane ${spawn.lane}`);
        }
      }
    }
  }

  for (const reward of REWARDS || []) {
    validateDescription('reward', reward.id, reward.description, errors);
  }

  for (const required of REQUIRED_STAGE_IDS) {
    if (!stageIds.has(required)) errors.push(`missing stage ${required}`);
  }
  for (const required of REQUIRED_REWARD_IDS) {
    if (!rewardIds.has(required)) errors.push(`missing reward ${required}`);
  }

  validateStartingNetwork(RECIPES, STARTING_SYMBOLS, errors);

  if (TUNING?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (TUNING?.handSize !== 5) errors.push('handSize must be 5');
  if (TUNING?.retainLimit !== 2) errors.push('retainLimit must be 2');
  if (TUNING?.campCapacity !== 2) errors.push('campCapacity must be 2');
  if (TUNING?.ordersPerBattle !== 3) errors.push('ordersPerBattle must be 3');

  return { ok: errors.length === 0, errors };
}
