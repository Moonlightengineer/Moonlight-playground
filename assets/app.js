'use strict';

const grid = document.querySelector('#project-grid');
const status = document.querySelector('#load-status');
const filterButtons = [...document.querySelectorAll('[data-filter]')];
let projects = [];

const labels = {
  category: { game: '網頁遊戲', tool: '實用工具', archive: '封存' },
  status: { experiment: '試驗中', playable: '可遊玩', paused: '暫停', graduated: '已升級' },
};

function safeDate(value) {
  const time = Date.parse(value || '');
  return Number.isNaN(time) ? 0 : time;
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function projectCard(project) {
  const article = createElement('article', `project-card${project.featured ? ' featured' : ''}`);
  article.dataset.category = project.category;

  const coverLink = createElement('a', 'project-cover');
  coverLink.href = project.path;
  coverLink.setAttribute('aria-label', `${project.actionLabel || '開啟'}${project.title}`);
  const image = document.createElement('img');
  image.src = project.cover;
  image.alt = project.coverAlt || `${project.title} 項目封面`;
  coverLink.append(image);

  const body = createElement('div', 'project-body');
  const meta = createElement('div', 'project-meta');
  const state = createElement('span', `status status-${project.status}`, labels.status[project.status] || project.status);
  meta.append(state, createElement('span', '', labels.category[project.category] || project.category));

  const heading = createElement('h3');
  const titleLink = createElement('a', '', project.title);
  titleLink.href = project.path;
  heading.append(titleLink);

  const summary = createElement('p', '', project.description);
  const tags = createElement('ul', 'tag-list');
  tags.setAttribute('aria-label', '項目特色');
  for (const tag of project.tags || []) tags.append(createElement('li', '', tag));

  const action = createElement('a', 'project-action');
  action.href = project.path;
  action.append(document.createTextNode(`${project.actionLabel || '開啟項目'} `));
  const arrow = createElement('span', '', '→');
  arrow.setAttribute('aria-hidden', 'true');
  action.append(arrow);

  body.append(meta, heading, summary, tags, action);
  article.append(coverLink, body);
  return article;
}

function render(filter = 'all') {
  const visible = filter === 'all' ? projects : projects.filter((project) => project.category === filter);
  grid.replaceChildren();

  if (!visible.length) {
    grid.append(createElement('p', 'empty-state', '呢個分類暫時未有公開實驗。'));
    return;
  }

  for (const project of visible) grid.append(projectCard(project));
}

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    for (const item of filterButtons) item.classList.toggle('is-active', item === button);
    render(button.dataset.filter);
  });
}

fetch('./projects.json', { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (!Array.isArray(data.projects)) throw new Error('projects 必須是陣列');
    projects = data.projects
      .filter((project) => project && project.published !== false)
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || safeDate(b.createdAt) - safeDate(a.createdAt));
    render('all');
    status.textContent = `已載入 ${projects.length} 個公開實驗。`;
  })
  .catch(() => {
    status.textContent = '項目資料暫時未能載入，已顯示預設項目。';
  });
