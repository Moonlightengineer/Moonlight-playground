// Shared scene utilities.
import { chapterCard } from '../widgets.js';

export function cardScene(num, title, sub, dur = 3.6) {
  return {
    id: `card${num}`,
    card: `${num} · ${title.replace(/\$/g, '')}`,
    dur,
    draw(ctx, t) {
      chapterCard(ctx, t, dur, num, title, sub);
    },
  };
}

// Shared top-view geometry for chapters 2, 3 and 5.
export const TOP = {
  rect: { x: 60, y: 104, w: 1120, h: 900 },
  barrierX: 330,
  cy: 554,
  screenX: 1100,
  lambda: 32,
  speed: 72,
  d: 200,
};

export function slitsFor(d) {
  return [
    { x: TOP.barrierX, y: TOP.cy - d / 2 },
    { x: TOP.barrierX, y: TOP.cy + d / 2 },
  ];
}
