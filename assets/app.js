'use strict';

const grid = document.querySelector('#project-grid');
const status = document.querySelector('#load-status');
const filters = document.querySelector('#project-filters');
const filterButtons = [...document.querySelectorAll('[data-filter]')];
let projects = [];
let loaded = false;

const labels = {
  category: { game: '網頁遊戲', tool: '實用工具', archive: '封存' },
  status: { experiment: '試驗中', playable: '可遊玩', paused: '暫停', graduated: '已升級' },
};

function safeDate(value) {
  const time = Date.parse(value || '');
  return Number.isNaN(time) ? 0 : time;
}

// The registry contains local public experiments, not arbitrary executable URLs.
function isLocalUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('./')) return false;
  try {
    const base = new URL('./', document.baseURI);
    const url = new URL(value, base);
    return url.origin === base.origin && url.pathname.startsWith(base.pathname);
  } catch {
    return false;
  }
}

function isValidProject(project) {
  return project && typeof project === 'object'
    && typeof project.title === 'string' && project.title.trim().length > 0
    && typeof project.description === 'string'
    && Object.hasOwn(labels.category, project.category)
    && Object.hasOwn(labels.status, project.status)
    && isLocalUrl(project.path) && isLocalUrl(project.cover)
    && (project.tags === undefined || (Array.isArray(project.tags)
      && project.tags.every((tag) => typeof tag === 'string')));
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
  image.loading = 'lazy';
  image.width = 1000;
  image.height = 620;
  coverLink.append(image);

  const body = createElement('div', 'project-body');
  const meta = createElement('div', 'project-meta');
  const stateLabel = project.status === 'playable' && project.category === 'tool'
    ? '可使用' : labels.status[project.status];
  meta.append(createElement('span', `status status-${project.status}`, stateLabel),
    createElement('span', '', labels.category[project.category]));
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
  // Build before replacing the fallback, so invalid data cannot leave a blank grid.
  const fragment = document.createDocumentFragment();
  if (!visible.length) {
    fragment.append(createElement('p', 'empty-state', '呢個分類暫時未有公開實驗。'));
  } else {
    for (const project of visible) fragment.append(projectCard(project));
  }
  grid.replaceChildren(fragment);
  for (const button of filterButtons) {
    const active = button.dataset.filter === filter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  status.textContent = `顯示 ${visible.length} 個公開實驗。`;
}

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    if (!loaded) return;
    render(button.dataset.filter);
  });
}

fetch('./projects.json', { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (!data || !Array.isArray(data.projects)) throw new Error('projects 必須是陣列');
    const published = data.projects.filter((project) => project?.published !== false);
    if (!published.every(isValidProject)) throw new Error('公開項目資料不完整');
    projects = published.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))
      || safeDate(b.createdAt) - safeDate(a.createdAt));
    render('all');
    loaded = true;
    for (const button of filterButtons) button.disabled = false;
    filters.hidden = false;
  })
  .catch(() => {
    // Leave the usable HTML card and links intact. Filtering requires loaded data.
    status.textContent = '項目資料暫時未能載入；你仍可開啟以下預設作品。';
  });
