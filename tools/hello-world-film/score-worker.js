// Synthesises the soundtrack off the main thread for the live page.
import { renderScore } from './score.js';

self.onmessage = () => {
  const { left, right } = renderScore();
  self.postMessage({ left, right }, [left.buffer, right.buffer]);
};
