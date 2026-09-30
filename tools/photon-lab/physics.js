// Pure physics helpers for Photon Lab. No DOM access, so Node tests can import this file.
// Constants follow the HKDSE Physics data sheet values.

export const H = 6.63e-34; // Planck constant (J s)
export const C = 3.0e8; // speed of light (m/s)
export const E_CHARGE = 1.6e-19; // electron charge (C), also J per eV
export const HC_EV_NM = (H * C) / E_CHARGE * 1e9; // ≈ 1243 eV nm

// Approximate work functions (eV). Textbooks quote slightly different values.
export const METALS = [
  { id: 'cs', name: 'Caesium', phi: 2.1 },
  { id: 'na', name: 'Sodium', phi: 2.3 },
  { id: 'ca', name: 'Calcium', phi: 2.9 },
  { id: 'zn', name: 'Zinc', phi: 4.3 },
  { id: 'cu', name: 'Copper', phi: 4.7 },
];

export const photonEnergyEV = (nm) => HC_EV_NM / nm;
export const wavelengthNm = (eV) => HC_EV_NM / eV;
export const frequencyHz = (nm) => C / (nm * 1e-9);

export const thresholdHz = (phi) => (phi * E_CHARGE) / H;

// Straight line of the KE_max–f graph, hf − φ. Negative below the threshold
// (the dashed extension to −φ); photoelectric() clamps it for real emission.
export const keMaxLine = (fHz, phi) => (H * fHz) / E_CHARGE - phi;

export function photoelectric(nm, phi) {
  const energy = photonEnergyEV(nm);
  const surplus = energy - phi;
  const emits = surplus >= -1e-9;
  return {
    energy,
    emits,
    keMax: emits ? Math.max(0, surplus) : 0,
    shortBy: emits ? 0 : -surplus,
    thresholdHz: thresholdHz(phi),
    thresholdNm: wavelengthNm(phi),
  };
}

export function spectralRegion(nm) {
  if (nm < 400) return 'ultraviolet';
  if (nm <= 700) return 'visible';
  return 'infrared';
}

// Bohr model of hydrogen
export const IONISATION_EV = 13.6;
export const MAX_LEVEL = 6;
// Real spectral lines have a small width; the simulator accepts photons within this range.
export const MATCH_TOLERANCE_EV = 0.02;

// Small epsilon keeps a value exactly on the tolerance edge (e.g. 10.22 eV) from
// being rejected by floating-point rounding.
export const matchesGap = (gapEnergy, energy) =>
  Math.abs(gapEnergy - energy) <= MATCH_TOLERANCE_EV + 1e-9;

export const levelEnergy = (n) => -IONISATION_EV / (n * n);
export const ionisationFrom = (n) => IONISATION_EV / (n * n);

const SERIES = { 1: 'Lyman', 2: 'Balmer', 3: 'Paschen', 4: 'Brackett', 5: 'Pfund' };

export function transition(upper, lower) {
  const energy = levelEnergy(upper) - levelEnergy(lower);
  const nm = wavelengthNm(energy);
  return { upper, lower, energy, nm, series: SERIES[lower], region: spectralRegion(nm) };
}

export function gapsFrom(n) {
  const gaps = [];
  for (let m = n + 1; m <= MAX_LEVEL; m += 1) gaps.push(transition(m, n));
  return gaps;
}

// What a single photon of the given energy does to an electron in level n.
export function hitAtom(n, energy) {
  const ionisation = ionisationFrom(n);
  if (energy >= ionisation - 1e-9) {
    return { type: 'ionise', ionisation, ke: Math.max(0, energy - ionisation) };
  }
  const match = gapsFrom(n).find((gap) => matchesGap(gap.energy, energy));
  if (match) return { type: 'excite', to: match.upper, gap: match.energy };
  return { type: 'none', ionisation };
}

export const lineCount = (n) => (n * (n - 1)) / 2;

// Visible wavelength → CSS colour. UV and IR get fixed display colours.
export function wavelengthColour(nm) {
  if (nm < 380) return '#b48cff';
  if (nm > 750) return '#b0413e';
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 440) { r = (440 - nm) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
  else { r = 1; }
  let fade = 1;
  if (nm < 420) fade = 0.4 + (0.6 * (nm - 380)) / 40;
  else if (nm > 700) fade = 0.4 + (0.6 * (750 - nm)) / 50;
  const channel = (value) => Math.round(255 * Math.pow(value * fade, 0.8));
  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
}
