import { HELP_SECTIONS } from './help-content.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderHelpContent(contentRoot) {
  contentRoot.replaceChildren();

  const intro = element(
    'p',
    'help-intro',
    '先睇需要的部分；戰鬥中的目前進度會保留，關閉後可繼續。',
  );
  contentRoot.append(intro);

  const navigation = element('nav', 'help-navigation');
  navigation.setAttribute('aria-label', '玩法章節');
  for (const section of HELP_SECTIONS) {
    const link = element('a', 'help-navigation-link', section.title);
    link.href = `#help-${section.id}`;
    navigation.append(link);
  }
  contentRoot.append(navigation);

  for (const section of HELP_SECTIONS) {
    const article = element('article', 'help-section');
    article.id = `help-${section.id}`;
    article.dataset.helpSection = section.id;
    article.append(
      element('h2', '', section.title),
      element('p', '', section.body),
    );
    contentRoot.append(article);
  }
}

export function createHelpPanel({ panel, contentRoot, onOpen = () => {}, onClose = () => {} }) {
  if (!panel || !contentRoot) throw new Error('Help panel shell is incomplete');

  let returnFocus = null;
  let rendered = false;

  function open(trigger = document.activeElement) {
    if (!panel.hidden) return;
    if (!rendered) {
      renderHelpContent(contentRoot);
      rendered = true;
    }
    returnFocus = trigger instanceof HTMLElement ? trigger : null;
    onOpen();
    panel.hidden = false;
    document.body.classList.add('help-open');
    panel.scrollTop = 0;
    panel.querySelector('[data-action="close-help"]')?.focus();
  }

  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove('help-open');
    onClose();
    returnFocus?.focus();
    returnFocus = null;
  }

  function isOpen() {
    return !panel.hidden;
  }

  return { open, close, isOpen };
}
