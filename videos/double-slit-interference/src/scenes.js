// Scene order for the film. Durations live in each scene; the timeline is built in main.js.
import { intro } from './scenes/intro.js';
import { cardScene } from './scenes/common.js';
import { superposition } from './scenes/superposition.js';
import { twoSources } from './scenes/twosources.js';
import { pathDiffScene } from './scenes/pathdiff.js';
import { geometry } from './scenes/geometry.js';
import { separation } from './scenes/separation.js';
import { example, summary, endCard } from './scenes/ending.js';

export const SCENES = [
  intro,
  cardScene(1, 'When waves meet', 'Superposition: what happens when two waves overlap.'),
  superposition,
  cardScene(2, 'Two slits, two sources', 'Why the light behind the slits forms bright and dark bands.'),
  twoSources,
  cardScene(3, 'Path difference', 'The rule that decides bright or dark.'),
  pathDiffScene,
  cardScene(4, 'Where are the fringes?', 'From path difference to fringe spacing.'),
  geometry,
  cardScene(5, 'Slit separation', 'What happens when the slits are moved further apart?'),
  separation,
  cardScene(6, 'Try a calculation', 'Putting numbers into the fringe-spacing formula.'),
  example,
  summary,
  endCard,
];
