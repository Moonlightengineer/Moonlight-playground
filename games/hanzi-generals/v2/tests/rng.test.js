import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, nextFloat, shuffle, pickOne } from '../src/core/rng.js';

test('same seed produces the same sequence and shuffle', () => {
  let a = createRng('moonlight');
  let b = createRng('moonlight');
  const seqA = [];
  const seqB = [];

  for (let i = 0; i < 5; i += 1) {
    const ra = nextFloat(a);
    a = ra.rng;
    seqA.push(ra.value);
    const rb = nextFloat(b);
    b = rb.rng;
    seqB.push(rb.value);
  }

  assert.deepEqual(seqA, seqB);
  assert.deepEqual(
    shuffle(a, ['黃', '忠', '趙']).items,
    shuffle(b, ['黃', '忠', '趙']).items,
  );
});

test('different seeds diverge and picks stay inside the source array', () => {
  const a = nextFloat(createRng('a')).value;
  const b = nextFloat(createRng('b')).value;
  assert.notEqual(a, b);
  assert.ok(['甲', '乙'].includes(pickOne(createRng('pick'), ['甲', '乙']).item));
});
