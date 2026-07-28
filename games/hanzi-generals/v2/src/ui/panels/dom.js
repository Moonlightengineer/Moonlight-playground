export function node(tag, className = '', text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = String(text);
  return value;
}

export function actionButton(label, action, options = {}) {
  const button = node('button', options.className ?? '', label);
  button.type = 'button';
  button.dataset.action = action;
  button.disabled = Boolean(options.disabled);
  if (options.ariaLabel) button.setAttribute('aria-label', options.ariaLabel);
  if (options.descriptionId) button.setAttribute('aria-describedby', options.descriptionId);
  for (const [key, value] of Object.entries(options.data ?? {})) {
    if (value !== undefined && value !== null) button.dataset[key] = String(value);
  }
  return button;
}

export function setVisible(element, visible) {
  if (element) element.hidden = !visible;
}
