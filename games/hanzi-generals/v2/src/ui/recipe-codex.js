import { GENERAL_BY_ID } from '../../data/generals.js';
import { RECIPES } from '../../data/recipes.js';
import { buildUnitPlayerDetail } from './unit-copy.js';

const RECIPE_BY_ID = Object.freeze(
  Object.fromEntries(RECIPES.map((recipe) => [recipe.id, recipe])),
);

function uniqueStringIds(values) {
  const result = [];
  const seen = new Set();
  for (const value of values ?? []) {
    if (typeof value !== 'string' || !value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function publicEntry(recipe, definition, state) {
  const detail = buildUnitPlayerDetail(definition);
  return {
    id: recipe.id,
    state,
    name: definition?.name ?? recipe.outputId,
    symbolsLabel: recipe.symbols.join('＋'),
    detailText: detail?.text ?? null,
    tierLabel: detail?.tierLabel ?? null,
  };
}

export function recordRecipeDiscoveries(currentIds, events = []) {
  const discovered = uniqueStringIds(currentIds);
  const seen = new Set(discovered);
  for (const event of events) {
    if (event?.type !== 'UNIT_ASSEMBLED') continue;
    const recipeId = event.payload?.definitionId;
    if (!RECIPE_BY_ID[recipeId] || seen.has(recipeId)) continue;
    seen.add(recipeId);
    discovered.push(recipeId);
  }
  return discovered;
}

export function buildRecipeCodex(game, profile = {}) {
  const discovered = new Set(uniqueStringIds(profile.discoveredRecipeIds));
  const unlocked = new Set(Array.isArray(game?.unlockedRecipes) ? game.unlockedRecipes : []);
  const entries = RECIPES.map((recipe) => {
    const definition = GENERAL_BY_ID[recipe.outputId];
    if (recipe.visibility === 'public') return publicEntry(recipe, definition, 'public');
    if (discovered.has(recipe.id)) return publicEntry(recipe, definition, 'discovered');
    if (recipe.availability === 'reward-pack' && !unlocked.has(recipe.id)) {
      return {
        id: recipe.id,
        state: 'locked',
        name: '？？？',
        symbolsLabel: recipe.symbols.map(() => '？').join('＋'),
        detailText: null,
        tierLabel: null,
      };
    }
    return {
      id: recipe.id,
      state: 'clue',
      name: recipe.availability === 'reward-pack' ? '稀有武將' : '未發現武將',
      symbolsLabel: recipe.symbols.join('＋'),
      detailText: null,
      tierLabel: null,
    };
  });
  return {
    entries,
    total: entries.length,
    discovered: entries.filter(({ state }) => state === 'public' || state === 'discovered').length,
  };
}
