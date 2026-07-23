'use strict';

import { GENERALS } from '../data/generals.js';
import { ENEMIES } from '../data/enemies.js';
import { RECIPES } from '../data/recipes.js';
import { STAGES } from '../data/stages.js';
import { REWARDS } from '../data/rewards.js';
import { TUNING } from '../data/tuning.js';
import { validateGameData } from './core/data-validator.js';

const root = document.querySelector('#v2-game-app');
const status = document.querySelector('[data-v2-status]');

if (!root || !status) {
  throw new Error('Hanzi Generals v2 shell is missing required elements');
}

const validation = validateGameData({ GENERALS, ENEMIES, RECIPES, STAGES, REWARDS, TUNING });

if (!validation.ok) {
  root.dataset.status = 'data-error';
  status.textContent = `測試資料無法載入：${validation.errors[0]}`;
  throw new Error(validation.errors.join('\n'));
}

root.dataset.status = 'data-ready';
status.textContent = `資料驗證完成：${GENERALS.length} 個友軍單位、${ENEMIES.length} 種敵軍、${STAGES.length} 個關卡定義。`;
