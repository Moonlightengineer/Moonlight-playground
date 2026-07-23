'use strict';

const root = document.querySelector('#v2-game-app');
const status = document.querySelector('[data-v2-status]');

if (!root || !status) {
  throw new Error('Hanzi Generals v2 shell is missing required elements');
}

root.dataset.status = 'shell-ready';
status.textContent = '測試殼已就緒。下一步會接入資料驗證、棋盤同牌庫系統。';
