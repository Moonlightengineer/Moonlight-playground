const renderedViewModels = new WeakMap();

export function rememberRenderedViewModel(root, viewModel) {
  renderedViewModels.set(root, viewModel);
}

export function getRenderedViewModel(root) {
  return renderedViewModels.get(root) ?? null;
}
