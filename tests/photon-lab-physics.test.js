import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../tools/photon-lab/physics.js';

const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

test('photon energy uses DSE data-sheet constants', () => {
  close(P.HC_EV_NM, 1243.1, 0.1, 'hc in eV nm');
  close(P.photonEnergyEV(500), 2.486, 0.001, '500 nm photon');
});

test('photoelectric threshold behaviour', () => {
  const zinc = 4.3;
  const visible = P.photoelectric(500, zinc);
  assert.equal(visible.emits, false);
  assert.equal(visible.keMax, 0);
  close(visible.thresholdNm, 289.1, 0.1, 'zinc threshold wavelength');

  const sodium = 2.3;
  assert.equal(P.photoelectric(540, sodium).emits, true);
  assert.equal(P.photoelectric(541, sodium).emits, false);
  close(P.photoelectric(P.wavelengthNm(3.5), sodium).keMax, 1.2, 1e-9, 'KE_max = hf - phi');
});

test('hydrogen levels and transitions', () => {
  close(P.levelEnergy(1), -13.6, 1e-9, 'E1');
  close(P.levelEnergy(2), -3.4, 1e-9, 'E2');
  const balmerAlpha = P.transition(3, 2);
  close(balmerAlpha.energy, 1.889, 0.001, '3->2 energy');
  close(balmerAlpha.nm, 658, 1, '3->2 wavelength with DSE constants');
  assert.equal(balmerAlpha.series, 'Balmer');
  assert.equal(balmerAlpha.region, 'visible');
  assert.equal(P.transition(2, 1).region, 'ultraviolet');
  assert.equal(P.transition(4, 3).region, 'infrared');
  assert.equal(P.lineCount(4), 6);
});

test('single photon on a hydrogen atom', () => {
  assert.deepEqual(P.hitAtom(1, 10.2), { type: 'excite', to: 2, gap: P.transition(2, 1).energy });
  assert.equal(P.hitAtom(1, 12.09).to, 3);
  assert.equal(P.hitAtom(1, 11.0).type, 'none');
  assert.equal(P.hitAtom(1, 13.59).type, 'none');
  assert.equal(P.hitAtom(1, 13.6).type, 'ionise');
  close(P.hitAtom(1, 15).ke, 1.4, 1e-9, 'leftover KE after ionisation');
  assert.equal(P.hitAtom(2, 3.39).type, 'none');
  assert.equal(P.hitAtom(2, 3.4).type, 'ionise');
  assert.equal(P.hitAtom(2, 1.89).to, 3);
});

test('absorption tolerance edges (±0.02 eV around 10.20 eV)', () => {
  // Gap n=1→2 is 13.6 × 3/4 = 10.20 eV, derived by hand.
  assert.equal(P.hitAtom(1, 10.18).type, 'excite');
  assert.equal(P.hitAtom(1, 10.22).type, 'excite');
  assert.equal(P.hitAtom(1, 10.17).type, 'none');
  assert.equal(P.hitAtom(1, 10.23).type, 'none');
  // Gap n=2→3 is 13.6 × (1/4 − 1/9) = 1.8889 eV.
  assert.equal(P.hitAtom(2, 1.87).type, 'excite');
  assert.equal(P.hitAtom(2, 1.86).type, 'none');
});

test('ionisation threshold edges', () => {
  assert.equal(P.hitAtom(1, 13.59).type, 'none');
  assert.equal(P.hitAtom(1, 13.6).type, 'ionise');
  assert.equal(P.hitAtom(1, 13.6).ke, 0);
  assert.equal(P.hitAtom(3, 1.5).type, 'none');
  assert.equal(P.hitAtom(3, 1.52).type, 'ionise'); // 13.6 / 9 = 1.511 eV
});

test('photoelectric exactly at threshold emits with zero KE', () => {
  const atThreshold = P.photoelectric(P.wavelengthNm(2.3), 2.3);
  assert.equal(atThreshold.emits, true);
  close(atThreshold.keMax, 0, 1e-9, 'KE_max at threshold');
});

test('KE_max graph line matches the emission calculation', () => {
  // Line crosses zero at f0 and meets −φ at f = 0.
  close(P.keMaxLine(0, 4.3), -4.3, 1e-12, 'y-intercept');
  close(P.keMaxLine(P.thresholdHz(4.3), 4.3), 0, 1e-9, 'x-intercept');
  close(P.thresholdHz(4.3), 1.0377e15, 0.001e15, 'zinc f0 by hand: 4.3×1.6e-19/6.63e-34');
  for (const nm of [150, 250, 400]) {
    const line = P.keMaxLine(P.frequencyHz(nm), 2.3);
    close(line, P.photoelectric(nm, 2.3).keMax, 1e-9, `line vs emission at ${nm} nm`);
  }
});
