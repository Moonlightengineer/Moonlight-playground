import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceTutorialForResult,
  createTutorial,
  tutorialText,
} from '../src/ui/tutorial.js';

test('direct camp assembly satisfies both place-card and assemble tutorial steps', () => {
  const tutorial = advanceTutorialForResult(
    createTutorial(),
    'ASSEMBLE',
    [{ type: 'UNIT_ASSEMBLED', payload: { unitId: 'unit-1' } }],
  );

  assert.equal(tutorial.index, 2);
  assert.match(tutorialText(tutorial), /第三步/);
});

test('board placement and later assembly advance one step at a time', () => {
  const placed = advanceTutorialForResult(
    createTutorial(),
    'ASSEMBLE',
    [{ type: 'CARD_PLACED', payload: { cardId: 'c1' } }],
  );
  assert.equal(placed.index, 1);

  const assembled = advanceTutorialForResult(
    placed,
    'ASSEMBLE',
    [{ type: 'UNIT_ASSEMBLED', payload: { unitId: 'unit-1' } }],
  );
  assert.equal(assembled.index, 2);
});
