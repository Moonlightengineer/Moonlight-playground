// City layout: the code typed in the first shot is also the street plan.
// Every lit pixel of the 5×7 font becomes one tower. Pure data, no DOM,
// so the same module runs in the browser and in Node (camera checks).

export const CELL = 30;              // metres per font pixel / tower plot
export const CHAR_W = 6;             // 5 pixel glyph + 1 street column
export const LINE_H = 9;             // 7 pixel glyph + 2 avenue rows
export const TOWER_INSET = 4;        // street half-width around text towers

export const CODE = [
  'city = build(code);',
  'moon = rise(cursor);',
  'light(city, moon);',
  'run(world);',
];
export const OUTPUT = 'hello, world';
export const OUTPUT_LINE = CODE.length;           // printed below the code
export const SHORE_ROW = (OUTPUT_LINE + 1) * LINE_H + 1; // first water row
export const SHORE_Z = SHORE_ROW * CELL;

// Grid covering the whole land area, in cells.
export const GX0 = -90, GZ0 = -110, GW = 300, GH = SHORE_ROW - GZ0;

// Hand-drawn 5×7 glyphs (HD44780 spirit). '#' = tower.
const FONT = {
  b: ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.###.', '#....', '#....', '#...#', '.###.'],
  d: ['....#', '....#', '.##.#', '#..##', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  g: ['.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#...#', '#...#'],
  n: ['.....', '.....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#...', '.#...', '####.', '.#...', '.#...', '.#..#', '..##.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  y: ['.....', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '..#..', '.#...'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

export function glyph(ch) {
  const g = FONT[ch];
  if (!g) throw new Error(`No glyph for ${JSON.stringify(ch)}`);
  return g;
}

// Deterministic PRNG so every run builds the identical city.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, z, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s);
  const c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Token stream: identifiers/numbers stay whole, a leading space rides
// with the next token, symbols stream one by one — like a model writing.
export function tokenize(line) {
  const out = [];
  const re = /\s*(?:[A-Za-z_]\w*|\S)/g;
  let m;
  while ((m = re.exec(line))) out.push({ text: m[0], start: m.index });
  return out;
}

// Typing schedule (seconds). Tokens land on a 32nd-note grid at 96 BPM.
export const BPM = 96;
export const BEAT = 60 / BPM;
export const TYPE_START = BEAT * 2;          // beat 3 of bar 1
export function typingSchedule() {
  const step = BEAT / 8;
  const events = [];                          // {line, char, t, token}
  const tokens = [];
  let t = TYPE_START;
  CODE.forEach((line, li) => {
    for (const tok of tokenize(line)) {
      tokens.push({ line: li, start: tok.start, text: tok.text, t });
      for (let k = 0; k < tok.text.length; k++) {
        events.push({ line: li, char: tok.start + k, t, ch: tok.text[k] });
      }
      t += step;
    }
    t += step * 2;                            // newline breath
  });
  return { events, tokens, end: t };
}

// Execution beats of the program (film time, seconds).
export const T_BUILD = BEAT * 8;             // bar 3: city = build(code)
export const T_RISE = BEAT * 12;             // bar 4: moon = rise(cursor)
export const T_LIGHT = BEAT * 16;            // bar 5: light(city, moon) — the drop
export const T_RUN = BEAT * 18;              // run(world)
export const T_PRINT = BEAT * 40;            // bar 11: output appears
export const PRINT_STEP = BEAT / 4;

export function cursorCell() {
  // Block cursor sits after the last typed character of the last line.
  const li = CODE.length - 1;
  return { cx: CODE[li].length * CHAR_W, cz: li * LINE_H };
}

// Build the two float textures consumed by the shader.
// A = (towerHeight, podiumHeight, flags, seed)
// B = (appearTime, riseStart, riseDuration, lightBias)
export const TYPE = { EMPTY: 0, TEXT: 1, GENERIC: 2, OUTPUT: 3, PLAZA: 4 };

export function buildCity() {
  const A = new Float32Array(GW * GH * 4);
  const B = new Float32Array(GW * GH * 4);
  const rnd = mulberry32(20260927);
  const typed = typingSchedule();
  const appear = new Map();
  for (const e of typed.events) appear.set(`${e.line},${e.char}`, e.t);
  const cur = cursorCell();
  const curX = (cur.cx + 2.5) * CELL, curZ = (cur.cz + 3.5) * CELL;

  const districtW = Math.max(...CODE.map((l) => l.length), OUTPUT.length + 2) * CHAR_W;
  const districtH = (OUTPUT_LINE + 1) * LINE_H - 2;
  const idx = (x, z) => ((z - GZ0) * GW + (x - GX0)) * 4;
  const inDistrict = (x, z) => x >= -2 && x < districtW + 1 && z >= -2 && z < SHORE_ROW;
  const set = (x, z, a, b) => { const i = idx(x, z); A.set(a, i); B.set(b, i); };

  let maxH = 0;
  const towers = [];

  // Code lines → towers.
  CODE.forEach((line, li) => {
    [...line].forEach((ch, ci) => {
      const g = glyph(ch);
      const charSeed = rnd();
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
        if (g[r][c] !== '#') continue;
        const x = ci * CHAR_W + c, z = li * LINE_H + r;
        const wx = (x + 0.5) * CELL, wz = (z + 0.5) * CELL;
        // Skyline: ascender rows (b d h l t, the i-dot, brackets) become the
        // tallest towers, so the harbour silhouette echoes the typography.
        const centre = 1 - Math.min(1, Math.hypot((wx - 1700) / 2300, (wz - 600) / 1600));
        const rowK = [1.0, 0.86, 0.5, 0.44, 0.4, 0.34, 0.3][r];
        let h = 45 + 300 * rowK * (0.55 + 0.45 * centre) * (0.6 + 0.55 * valueNoise(wx / 210, wz / 210, 7)) + 35 * charSeed;
        if (r <= 1 && hash2(x, z, 3) > 0.7) h += 60 + 70 * hash2(x, z, 4);
        h = Math.round(h / 3.6) * 3.6 + 1.2;
        const d = Math.hypot(wx - curX, wz - curZ);
        const riseStart = T_BUILD + d / 1400 + 0.08 * hash2(x, z, 5);
        const t0 = appear.get(`${li},${ci}`);
        set(x, z, [h, 0, TYPE.TEXT, hash2(x, z, 1)], [t0, riseStart, 1.15 + 0.35 * hash2(x, z, 6), hash2(x, z, 8)]);
        towers.push({ x, z, h });
        maxH = Math.max(maxH, h);
      }
    });
  });

  // Output line: printed by the city itself near the end.
  const out = '  ' + OUTPUT; // indent under the code, as program output
  [...out].forEach((ch, ci) => {
    const g = glyph(ch);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      const x = ci * CHAR_W + c, z = OUTPUT_LINE * LINE_H + r;
      if (g[r][c] !== '#') { set(x, z, [0, 0, TYPE.PLAZA, hash2(x, z, 1)], [1e4, 1e4, 1, 0]); continue; }
      const k = ci - 2;
      const t = T_PRINT + k * PRINT_STEP + 0.03 * c;
      const h = 60 + 30 * hash2(x, z, 9);
      set(x, z, [h, 0, TYPE.OUTPUT, hash2(x, z, 1)], [t, t, 0.9, 1]);
      maxH = Math.max(maxH, h);
    }
  });

  // Generic city everywhere else on land: podium blocks with towers.
  for (let z = GZ0; z < SHORE_ROW; z++) for (let x = GX0; x < GX0 + GW; x++) {
    const i = idx(x, z);
    if (A[i + 2] !== 0) continue;
    if (inDistrict(x, z)) {
      // Avenues, promenade and the empty plots inside the district.
      const plaza = z >= OUTPUT_LINE * LINE_H - 1;
      set(x, z, [0, 0, plaza ? TYPE.PLAZA : TYPE.EMPTY, hash2(x, z, 1)], [1e4, 1e4, 1, 0]);
      continue;
    }
    if (z >= SHORE_ROW - 2) { set(x, z, [0, 0, TYPE.PLAZA, hash2(x, z, 1)], [1e4, 1e4, 1, 0]); continue; }
    const bx = Math.floor((x + 1000) / 5), bz = Math.floor((z + 1000) / 5);
    const street = ((x + 1000) % 5 === 4) || ((z + 1000) % 5 === 4);
    const wx = (x + 0.5) * CELL, wz = (z + 0.5) * CELL;
    const dist = Math.hypot(Math.max(0, Math.abs(wx - 1800) - 1900), Math.max(0, Math.abs(wz - 650) - 800));
    const density = valueNoise(wx / 900, wz / 900, 11) * 0.7 + 0.45 - dist / 5200;
    const park = valueNoise(bx * 0.5, bz * 0.5, 12) < 0.18 || density < 0.12;
    if (street || park) { set(x, z, [0, 0, TYPE.EMPTY, hash2(x, z, 1)], [1e4, 1e4, 1, 0]); continue; }
    const blockSeed = hash2(bx, bz, 13);
    const podium = 9 + Math.round(3 * blockSeed) * 4.2;
    let tower = 0;
    if (hash2(x, z, 14) < 0.35 + 0.4 * density) {
      tower = 22 + 105 * Math.pow(Math.max(0, density), 1.5) * (0.35 + hash2(x, z, 15));
      tower = Math.round(tower / 3.3) * 3.3 + podium;
    }
    // Podium touches neighbours of the same block (no street between).
    const same = (dx, dz) => {
      const nx = x + dx, nz = z + dz;
      return Math.floor((nx + 1000) / 5) === bx && Math.floor((nz + 1000) / 5) === bz
        && (nx + 1000) % 5 !== 4 && (nz + 1000) % 5 !== 4;
    };
    const flags = TYPE.GENERIC | (same(1, 0) << 3) | (same(-1, 0) << 4) | (same(0, 1) << 5) | (same(0, -1) << 6);
    const riseStart = T_BUILD + 1.4 + Math.hypot(wx - curX, wz - curZ) / 1700 + 0.2 * hash2(x, z, 16);
    set(x, z, [tower, podium, flags, hash2(x, z, 1)], [riseStart, riseStart, 1.4, 0.35 + 0.4 * hash2(x, z, 17)]);
    maxH = Math.max(maxH, tower);
  }

  return { A, B, maxH, towers, typed, districtW, districtH, curX, curZ };
}

// Conservative collision probe for camera paths (metres above ground that
// must stay clear at x,z once everything has risen).
export function obstacleHeight(city, x, z, pad = 0) {
  let h = 0;
  const x0 = Math.floor((x - pad) / CELL), x1 = Math.floor((x + pad) / CELL);
  const z0 = Math.floor((z - pad) / CELL), z1 = Math.floor((z + pad) / CELL);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    if (cx < GX0 || cz < GZ0 || cx >= GX0 + GW || cz >= GZ0 + GH) continue;
    const i = ((cz - GZ0) * GW + (cx - GX0)) * 4;
    h = Math.max(h, city.A[i] + (city.A[i] > 0 ? 40 : 0), city.A[i + 1]);
  }
  return h;
}
