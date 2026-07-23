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
  'unlock-zhang-fei',
  'unlock-zhuge-liang',
]);

function duplicateIds(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return [...duplicates];
}

export function validateGameData({ GENERALS, ENEMIES, RECIPES, STAGES, REWARDS, TUNING }) {
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
  }

  for (const unit of GENERALS || []) {
    for (const field of ['maxHp', 'damage', 'attackEvery', 'range']) {
      if (!Number.isFinite(unit[field]) || unit[field] <= 0) {
        errors.push(`unit ${unit.id} has invalid ${field}`);
      }
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

  for (const required of REQUIRED_STAGE_IDS) {
    if (!stageIds.has(required)) errors.push(`missing stage ${required}`);
  }
  for (const required of REQUIRED_REWARD_IDS) {
    if (!rewardIds.has(required)) errors.push(`missing reward ${required}`);
  }

  if (TUNING?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (TUNING?.handSize !== 5) errors.push('handSize must be 5');
  if (TUNING?.retainLimit !== 2) errors.push('retainLimit must be 2');
  if (TUNING?.campCapacity !== 2) errors.push('campCapacity must be 2');
  if (TUNING?.ordersPerBattle !== 3) errors.push('ordersPerBattle must be 3');

  return { ok: errors.length === 0, errors };
}
