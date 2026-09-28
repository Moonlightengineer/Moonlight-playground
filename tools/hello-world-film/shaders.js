// GLSL for "Hello, World". One full-screen fragment shader traces the whole
// world per pixel; a small post chain turns the HDR result into film.

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const scene = (defs = []) => `#version 300 es
${defs.map((d) => `#define ${d}`).join('\n')}
precision highp float;
precision highp int;
precision highp sampler2D;

#define CELL 30.0
#define PI 3.14159265
#define FAR 26000.0

// Software WebGL (SwiftShader, used for the offline render) runs every line
// of a shader for every pixel and only masks the results — branches never
// save time there. So each shot compiles its own variant with only the
// features it can see (HAS_CITY, HAS_SKY, HAS_WATER…); dead code is removed
// at compile time instead. WHEN() marks the branches that are cheap on GPUs.
#define WHEN(c) if (c)

uniform vec2 uRes;
uniform vec2 uJitter;
uniform vec2 uLens;
uniform float uTime;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform float uTanHalfFov;
uniform float uFocus;
uniform float uAperture;
uniform int uDebug;

uniform sampler2D uCityA;
uniform sampler2D uCityB;
uniform sampler2D uNoise;
uniform sampler2D uCoarse;     // max height per 8×8 block of plots
uniform ivec2 uCoarseMin;
uniform ivec2 uCoarseSize;
uniform ivec2 uGridMin;
uniform ivec2 uGridSize;
uniform float uMaxH;
uniform float uShoreZ;
uniform vec2 uDistrict;        // district size in metres (x, z)

uniform vec3 uMoonDir;
uniform float uMoonAng;
uniform float uMoonVis;
uniform float uMoonLight;
uniform vec4 uCursor;          // xyz centre, w = morph box→sphere
uniform vec3 uCursorSize;      // box half extents
uniform float uCursorR;
uniform float uCursorMode;     // 0 flat, 1 object, -1 hidden
uniform float uCursorGlow;
uniform vec3 uCursorCol;
uniform float uCursorMoon;     // 0 glowing cursor … 1 lunar surface
uniform float uLights;
uniform float uLED;
uniform float uBeat;
uniform float uStreet;
uniform float uReveal;
uniform float uRevealWave;     // seconds since the words started lighting up, line by line
uniform float uGeneric;
uniform float uFogDen;
uniform float uStars;
uniform float uTextGlow;       // flat LED pixels (typing phase)
uniform float uCrown;          // roof crown lights on text towers
uniform float uLEDWave;        // metres the light-up wave has travelled from the shore
uniform float uBeatPhase;      // time in beats
uniform vec4 uBeamO[6];
uniform vec4 uBeamD[6];
uniform vec3 uBeamC[6];
uniform int uBeamN;

out vec4 outColor;

// ------------------------------------------------------------ hashing / noise
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float u2f(uint v) { return float(v) * (1.0 / 4294967296.0); }
uint cellHash(ivec2 c, uint s) { return pcg(uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ pcg(s)); }
float hashC(ivec2 c, uint s) { return u2f(cellHash(c, s)); }
float hash21(vec2 p) { return u2f(pcg(floatBitsToUint(p.x) ^ pcg(floatBitsToUint(p.y)))); }

float noiseT(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (i + f + 0.5) / 256.0, 0.0).x;
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { s += a * noiseT(p); p = m * p; a *= 0.5; }
  return s;
}
float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) { s += a * noiseT(p); p = m * p; a *= 0.5; }
  return s * 1.15;
}

// ------------------------------------------------------------ helpers
float riseCurve(float t, float start, float dur) {
  float x = clamp((t - start) / dur, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - x, 3.0);
  return e + 0.045 * sin(x * PI) * x;   // tiny settle, not a cartoon bounce
}

const vec3 MOONC = vec3(0.62, 0.74, 1.0);
const vec3 AMBER = vec3(1.0, 0.56, 0.22);

// ------------------------------------------------------------ city data
vec4 cityA(ivec2 c) { return texelFetch(uCityA, c - uGridMin, 0); }
vec4 cityB(ivec2 c) { return texelFetch(uCityB, c - uGridMin, 0); }
bool inGrid(ivec2 c) {
  ivec2 q = c - uGridMin;
  return q.x >= 0 && q.y >= 0 && q.x < uGridSize.x && q.y < uGridSize.y;
}

struct Hit {
  float t;
  vec3 n;
  vec3 bmin;
  vec3 bmax;
  ivec2 cell;
  vec4 A;
  vec4 B;
  float grow;
  int part;        // 0 podium, 1 tower, 2 upper tower, 3 roof box, 4 mast
};

bool slab(vec3 ro, vec3 inv, vec3 mn, vec3 mx, float tA, float tB, inout float tHit, inout vec3 nHit) {
  vec3 t0 = (mn - ro) * inv, t1 = (mx - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z);
  float tf = min(min(tmax.x, tmax.y), tmax.z);
  if (tf < tn || tf < tA || tn > tB || tn > tHit || tn < 0.0) return false;
  tHit = tn;
  vec3 sgn = -sign(inv);
  nHit = tn == tmin.x ? vec3(sgn.x, 0, 0) : (tn == tmin.y ? vec3(0, sgn.y, 0) : vec3(0, 0, sgn.z));
  return true;
}

float towerInset(int type, float seed) { return type == 1 || type == 3 ? 4.0 : 3.5 + 3.0 * fract(seed * 13.7); }

// Every box of the building standing in plot c (podium, tower or setback
// tower, rooftop plant room, mast).
bool cellHit(vec3 ro, vec3 rd, vec3 inv, ivec2 c, vec4 A, float tA, float tB, inout Hit h) {
  int flags = int(A.z);
  int type = flags & 7;
  vec4 B = cityB(c);
  float grow = riseCurve(uTime, B.y, B.z);
  if (grow <= 0.0) return false;
  vec2 c0 = vec2(c) * CELL;
  float seed = A.w;
  float best = h.t;
  vec3 n = vec3(0);
  bool hit = false;
  int part = -1;
  vec3 bmn = vec3(0), bmx = vec3(0);

  float podH = A.y * grow;
  if (podH > 0.05) {
    vec4 ins = vec4(3.5);
    if ((flags & 8) != 0) ins.x = 0.0;
    if ((flags & 16) != 0) ins.y = 0.0;
    if ((flags & 32) != 0) ins.z = 0.0;
    if ((flags & 64) != 0) ins.w = 0.0;
    vec3 mn = vec3(c0.x + ins.y, 0.0, c0.y + ins.w);
    vec3 mx = vec3(c0.x + CELL - ins.x, podH, c0.y + CELL - ins.z);
    if (slab(ro, inv, mn, mx, tA, tB, best, n)) { hit = true; part = 0; bmn = mn; bmx = mx; }
  }
  float H = A.x * grow;
  if (H > 0.3) {
    float ins = towerInset(type, seed);
    float style = fract(seed * 7.31);
    vec3 mn = vec3(c0.x + ins, 0.0, c0.y + ins);
    vec3 mx = vec3(c0.x + CELL - ins, H, c0.y + CELL - ins);
    if (style > 0.55 && A.x > 90.0) {
      float hs = floor(H * 0.62 / 3.6) * 3.6;
      vec3 mx1 = vec3(mx.x, hs, mx.z);
      if (slab(ro, inv, mn, mx1, tA, tB, best, n)) { hit = true; part = 1; bmn = mn; bmx = mx1; }
      vec3 mn2 = vec3(mn.x + 2.5, hs, mn.z + 2.5);
      vec3 mx2 = vec3(mx.x - 2.5, H, mx.z - 2.5);
      if (slab(ro, inv, mn2, mx2, tA, tB, best, n)) { hit = true; part = 2; bmn = mn2; bmx = mx2; }
      mn = mn2; mx = mx2;
    } else {
      if (slab(ro, inv, mn, mx, tA, tB, best, n)) { hit = true; part = 1; bmn = mn; bmx = mx; }
    }
    if (fract(seed * 3.97) > 0.35) {
      vec2 o = vec2(fract(seed * 17.3), fract(seed * 29.1)) * (mx.xz - mn.xz - 9.0);
      vec3 rmn = vec3(mn.x + 1.5 + o.x, H, mn.z + 1.5 + o.y);
      vec3 rmx = vec3(rmn.x + 6.0, H + 3.5 + 2.0 * fract(seed * 5.1), rmn.z + 6.0);
      if (slab(ro, inv, rmn, rmx, tA, tB, best, n)) { hit = true; part = 3; bmn = rmn; bmx = rmx; }
    }
    if (A.x > 230.0) {
      vec2 m = (mn.xz + mx.xz) * 0.5;
      vec3 amn = vec3(m.x - 0.7, H, m.y - 0.7);
      vec3 amx = vec3(m.x + 0.7, H + 32.0 * grow, m.y + 0.7);
      if (slab(ro, inv, amn, amx, tA, tB, best, n)) { hit = true; part = 4; bmn = amn; bmx = amx; }
    }
  }
  if (!hit) return false;
  h.t = best; h.n = n; h.cell = c; h.A = A; h.B = B; h.grow = grow; h.part = part;
  h.bmin = bmn; h.bmax = bmx;
  return true;
}

// City ray tracing. A cheap 2-D DDA walks the plot grid (skipping whole
// 8×8 blocks the ray flies over, via a coarse max-height grid) until it
// reaches a plot whose footprint and height the ray actually crosses; only
// then are the exact boxes tested. Both are exact, so edges stay razor sharp.
// Keeping the expensive box tests out of the stepping loop matters on
// software WebGL, which pays for a loop body's every line on every step.
#define CCELL 240.0
bool traceCity(vec3 ro, vec3 rd, float tLimit, inout Hit h) {
  vec3 inv = 1.0 / rd;
  vec3 bmn = vec3(vec2(uGridMin).x * CELL, 0.0, vec2(uGridMin).y * CELL);
  vec3 bmx = vec3(vec2(uGridMin + uGridSize).x * CELL, uMaxH + 40.0, vec2(uGridMin + uGridSize).y * CELL);
  vec3 t0 = (bmn - ro) * inv, t1 = (bmx - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float tA = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
  float tB = min(min(min(tmax.x, tmax.y), tmax.z), tLimit);
  h.t = tB;
  vec2 d = rd.xz;
  vec2 ad = max(abs(d), vec2(1e-7));
  vec2 sd = vec2(d.x >= 0.0 ? 1.0 : -1.0, d.y >= 0.0 ? 1.0 : -1.0);
  ivec2 stp = ivec2(sd);
  vec2 stpF = step(0.0, sd);
  vec2 big = vec2(abs(d.x) < 1e-7 ? 1e9 : 0.0, abs(d.y) < 1e-7 ? 1e9 : 0.0);
  vec2 tDelta = CELL / ad + big;
  float tEnter = tA;
  ivec2 c = ivec2(floor((ro.xz + d * (tA + 1e-3)) / CELL));
  vec2 tNext = abs((vec2(c) + stpF) * CELL - ro.xz) / ad + big;
  int budget = tB > tA ? 8 : 0;
  for (int k = 0; k < budget; k++) {
    bool found = false;
    for (int i = 0; i < 400; i++) {
      float tExit = min(min(tNext.x, tNext.y), tB);
      ivec2 cc = ivec2(floor(vec2(c) / 8.0));
      ivec2 ci = cc - uCoarseMin;
      bool inC = ci.x >= 0 && ci.y >= 0 && ci.x < uCoarseSize.x && ci.y < uCoarseSize.y;
      float cmax = texelFetch(uCoarse, clamp(ci, ivec2(0), uCoarseSize - 1), 0).r;
      vec2 tCv = abs((vec2(cc) + stpF) * CCELL - ro.xz) / ad + big;
      float tExitC = min(min(tCv.x, tCv.y), tB);
      bool skip = min(ro.y + rd.y * tEnter, ro.y + rd.y * tExitC) > cmax;
      vec4 A = texelFetch(uCityA, clamp(c - uGridMin, ivec2(0), uGridSize - 1), 0);
      float hTop = max(A.x > 0.0 ? A.x * 1.06 + 40.0 : 0.0, A.y * 1.06);
      float ins = A.y > 0.0 ? 0.0 : 3.9;
      vec2 fa = (vec2(c) * CELL + ins - ro.xz) * inv.xz, fb = (vec2(c + 1) * CELL - ins - ro.xz) * inv.xz;
      float tn2 = max(max(min(fa.x, fb.x), min(fa.y, fb.y)), tEnter);
      float tf2 = min(min(max(fa.x, fb.x), max(fa.y, fb.y)), tExit);
      bool cand = !skip && inGrid(c) && hTop > 0.0 && tn2 <= tf2 && min(ro.y + rd.y * tn2, ro.y + rd.y * tf2) <= hTop;
      if (cand) { found = true; break; }
      if (skip) {
        tEnter = tExitC;
        c = ivec2(floor((ro.xz + d * (tEnter + 1e-3)) / CELL));
        tNext = abs((vec2(c) + stpF) * CELL - ro.xz) / ad + big;
      } else {
        tEnter = tExit;
        if (tNext.x < tNext.y) { c.x += stp.x; tNext.x += tDelta.x; }
        else { c.y += stp.y; tNext.y += tDelta.y; }
      }
      if (tEnter >= tB || !inC) break;
    }
    if (!found) break;
    float tExit = min(min(tNext.x, tNext.y), tB);
    if (cellHit(ro, rd, inv, c, cityA(c), tEnter - 1e-3, tExit + 1e-3, h)) return true;
    tEnter = tExit;
    if (tNext.x < tNext.y) { c.x += stp.x; tNext.x += tDelta.x; }
    else { c.y += stp.y; tNext.y += tDelta.y; }
    if (tEnter >= tB) break;
  }
  return false;
}

// ------------------------------------------------------------ sky
float moonAlbedo(vec2 q) {
  float maria = smoothstep(0.35, 0.75, fbm(q * 2.3 + vec2(3.1, 1.7)));
  float crat = fbm(q * 9.0 + 7.0);
  return 0.95 - 0.38 * maria - 0.12 * smoothstep(0.55, 0.8, crat);
}

vec3 moonDisk(vec3 rd, float pixAng) {
  vec3 col = vec3(0);
  float cm = dot(rd, uMoonDir);
  WHEN(uMoonVis > 0.0 && cm > cos(uMoonAng * 1.3)) {
    vec3 w = uMoonDir;
    vec3 u = normalize(cross(vec3(0, 1, 0), w));
    vec3 v = cross(w, u);
    vec2 q = vec2(dot(rd, u), dot(rd, v)) / uMoonAng;
    float r = length(q);
    float edge = 1.0 - smoothstep(1.0 - pixAng / uMoonAng, 1.0 + pixAng / uMoonAng, r);
    vec3 nrm = vec3(q, sqrt(max(0.0, 1.0 - dot(q, q))));
    float limb = 0.55 + 0.45 * pow(nrm.z, 0.35);
    col = vec3(1.0, 0.97, 0.92) * moonAlbedo(q) * limb * 9.0 * edge * uMoonVis;
  }
  return col;
}

vec3 stars(vec3 rd) {
  vec2 sp = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, -1.0, 1.0)));
  vec2 g = sp * 180.0;
  vec2 id = floor(g);
  float h = hash21(id);
  vec2 o = vec2(hash21(id + 17.0), hash21(id + 31.0)) * 0.7 + 0.15;
  float d = length(fract(g) - o);
  float b = pow(hash21(id + 5.0), 6.0) * 0.9 + 0.04;
  float tw = 0.75 + 0.25 * sin(uTime * (2.0 + 5.0 * hash21(id + 9.0)) + h * 40.0);
  return step(0.93, h) * mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.85, 0.7), hash21(id + 3.0)) * b * tw * exp(-d * d * 60.0);
}

vec3 skyGlow(vec3 rd) {
  float y = rd.y;
  vec3 zen = vec3(0.0024, 0.0040, 0.0122);
  vec3 hor = vec3(0.015, 0.022, 0.043);
  vec3 col = mix(hor, zen, smoothstep(-0.02, 0.6, y));
  // warm light pollution rising off the city (strongest toward -z)
  float towardCity = 0.55 + 0.45 * smoothstep(0.2, -0.9, rd.z);
  col += vec3(0.065, 0.033, 0.017) * exp(-max(y, 0.0) * 11.0) * towardCity * (0.35 + 0.65 * uGeneric);
  float cm = max(dot(rd, uMoonDir), 0.0);
  float ang = acos(min(cm, 1.0));
  col += MOONC * uMoonVis * (0.10 * exp(-ang * 22.0) + 0.018 * exp(-ang * 4.5));
  return col;
}

vec3 clouds(vec3 ro, vec3 rd, vec3 base) {
  float t = (6500.0 - ro.y) / rd.y;
  vec2 p = (ro.xz + rd.xz * t) / 4200.0 + vec2(uTime * 0.012, 0.0);
  float dns = smoothstep(0.52, 0.85, fbm(p) + 0.08 * fbm3(p * 4.0));
  float fade = exp(-t / 60000.0) * smoothstep(0.01, 0.12, rd.y);
  float cm = max(dot(rd, uMoonDir), 0.0);
  vec3 lit = MOONC * (0.010 + 0.18 * uMoonVis * pow(cm, 24.0)) + vec3(0.03, 0.017, 0.01) * smoothstep(0.35, 0.0, rd.y);
  return mix(base, lit, dns * fade * 0.85);
}

// Hills on two cylinders around the city; settlements light the slopes.
vec4 ridge(vec3 ro, vec3 rd, float R, float seed, float hMul) {
  vec2 C = vec2(1800.0, -300.0);
  vec2 o = ro.xz - C;
  float b = dot(o, rd.xz), cc = dot(o, o) - R * R, a = max(dot(rd.xz, rd.xz), 1e-6);
  float disc = max(b * b - a * cc, 0.0);
  float t = (-b + sqrt(disc)) / a;
  vec3 p = ro + rd * t;
  vec2 q = p.xz - C;
  float az = atan(q.y, q.x);
  float behind = smoothstep(0.0, -0.7, sin(az));           // -z side = tall hills
  float hh = (140.0 + 520.0 * behind) * hMul;
  float prof = hh * (0.55 + 0.6 * fbm3(vec2(az * 3.5 + seed, seed)) + 0.15 * noiseT(vec2(az * 40.0, seed)));
  if (p.y > prof || p.y < -3.0 || t <= 0.0) return vec4(0, 0, 0, -1);
  vec3 col = vec3(0.004, 0.006, 0.011);
  col += MOONC * 0.012 * uMoonLight * smoothstep(prof - 60.0, prof, p.y);
  vec2 g = vec2(az * R / 18.0, p.y / 9.0);
  vec2 id = floor(g);
  float hs = hash21(id + seed);
  float band = smoothstep(prof * 0.55, 0.0, p.y) * (0.35 + 0.65 * (1.0 - behind));
  float dd = length(fract(g) - 0.5);
  col += step(1.0 - 0.10 * band, hs) * mix(vec3(1.0, 0.62, 0.3), vec3(0.8, 0.9, 1.0), step(0.7, hash21(id + 2.0))) * 2.2 * exp(-dd * dd * 30.0) * uGeneric;
  return vec4(col, t);
}

vec3 skyAll(vec3 ro, vec3 rd, float pixAng, out float tSky) {
  vec3 col = skyGlow(rd);
  tSky = FAR;
#ifdef HAS_SKY
  WHEN(uStars > 0.0 && rd.y > 0.02) col += stars(rd) * uStars * smoothstep(0.02, 0.25, rd.y);
  WHEN(rd.y > 0.01) col = clouds(ro, rd, col);
  col += moonDisk(rd, pixAng);
  WHEN(rd.y < 0.12) {
    vec4 r2 = ridge(ro, rd, 11500.0, 5.0, 1.25);
    if (r2.w > 0.0) { col = r2.rgb; tSky = r2.w; }
    vec4 r1 = ridge(ro, rd, 7600.0, 1.0, 0.8);
    if (r1.w > 0.0) { col = r1.rgb; tSky = r1.w; }
  }
#endif
  return col;
}

// ------------------------------------------------------------ lighting helpers
vec3 cursorLight(vec3 p, vec3 n) {
  vec3 L = uCursor.xyz - p;
  float d2 = dot(L, L);
  return step(0.5, uCursorMode) * uCursorCol * uCursorGlow * 4000.0 * max(dot(n, L * inversesqrt(d2)), 0.0) / (d2 + 2000.0);
}

vec3 ambient(vec3 n, float y) {
  vec3 sky = mix(vec3(0.010, 0.013, 0.022), vec3(0.018, 0.024, 0.040), n.y * 0.5 + 0.5);
  vec3 street = vec3(0.09, 0.05, 0.022) * exp(-y / 22.0) * uStreet * (1.0 - max(n.y, 0.0));
  return sky + street;
}

// Parallax interior behind a window (a room drawn by ray-box maths).
float room(vec2 f, vec3 ld, float depth, float seed) {
  vec3 p = vec3(f, 0.0);
  vec3 inv = 1.0 / max(abs(ld), vec3(1e-4)) * sign(ld + 1e-6);
  vec3 bnd = vec3(ld.x > 0.0 ? 1.5 : -1.5, ld.y > 0.0 ? 1.4 : -1.4, depth);
  vec3 t = (bnd - p) * inv;
  float tm = min(min(t.x, t.y), t.z);
  vec3 q = p + ld * tm;
  float shade = tm == t.z ? 0.75 + 0.25 * step(0.5, fract(q.x * 0.35 + seed))   // back wall
              : (tm == t.y ? (ld.y > 0.0 ? 1.25 : 0.45) : 0.62);                   // ceiling / floor / sides
  return shade * (0.8 + 0.4 * smoothstep(1.4, -1.4, q.y));
}

// ------------------------------------------------------------ building shading
vec3 windowColor(float warmth, float r) {
  const vec3 K2500 = vec3(1.0, 0.354, 0.058), K3200 = vec3(1.0, 0.486, 0.2);
  const vec3 K3700 = vec3(1.0, 0.574, 0.318), K4500 = vec3(1.0, 0.705, 0.508);
  const vec3 K5000 = vec3(1.0, 0.782, 0.625), K6800 = vec3(0.957, 0.926, 1.0);
  return warmth < 0.42 ? mix(K5000, K6800, r)       // cool residential / fluorescent
       : (warmth < 0.82 ? mix(K2500, K3200, r)      // warm homes
       : mix(K3700, K4500, r));                     // offices
}

vec3 ledColor(float h) {
  return h < 0.3 ? vec3(0.15, 0.8, 1.0) : (h < 0.55 ? vec3(1.0, 0.22, 0.72) : (h < 0.8 ? vec3(1.0, 0.55, 0.18) : vec3(0.7, 0.8, 1.0)));
}

vec3 shadeBuilding(Hit h, vec3 ro, vec3 rd, bool cheap) {
  vec3 p = ro + rd * h.t;
  vec3 n = h.n;
  int flags = int(h.A.z);
  int type = flags & 7;
  bool text = type == 1 || type == 3;
  uint bid = cellHash(h.cell, 11u);
  float b1 = u2f(pcg(bid + 1u)), b2 = u2f(pcg(bid + 2u)), b3 = u2f(pcg(bid + 3u));
  float b4 = u2f(pcg(bid + 4u)), b5 = u2f(pcg(bid + 5u));
  float H = h.A.x * h.grow;
  float lightsOn = text ? uLights : uGeneric;
  vec3 albedo = text ? mix(vec3(0.045, 0.05, 0.06), vec3(0.085, 0.09, 0.1), b3)
                     : mix(vec3(0.05, 0.05, 0.052), vec3(0.12, 0.11, 0.1), b3);
  vec3 lightIn = MOONC * 0.06 * uMoonLight * max(dot(n, uMoonDir), 0.0) + ambient(n, p.y) + cursorLight(p, n);
  bool led = text && h.part != 3 && (b5 > 0.66 || h.A.x > 250.0);
  float ledOn = uLED * smoothstep(0.0, 60.0, uLEDWave - (uShoreZ - p.z));
  vec3 c = albedo * lightIn;

  WHEN(h.part == 4) { // mast with aviation light
    float blink = step(0.55, fract(uTime * 0.75 + b1));
    c += vec3(1.0, 0.04, 0.02) * 40.0 * blink * smoothstep(h.bmax.y - 2.5, h.bmax.y, p.y) * step(0.5, lightsOn + uTextGlow);
  }

  WHEN(n.y > 0.5 && h.part != 4) { // roofs
    c *= 0.8;
    vec2 lp = (p.xz - h.bmin.xz) / max(h.bmax.xz - h.bmin.xz, vec2(1.0));
    float edgeD = min(min(lp.x, 1.0 - lp.x), min(lp.y, 1.0 - lp.y));
    float rim = 1.0 - smoothstep(0.0, 0.08, edgeD);
    if (text && h.part != 3) {
      // pixel glow carried up from the "screen", fading as the tower becomes a building
      float fresh = 1.0 - smoothstep(0.0, 1.0, (uTime - h.B.y) / (h.B.z * 2.4));
      float typed = step(h.B.x, uTime);
      vec3 pix = type == 3 ? vec3(1.0, 0.8, 0.5) * 7.0 : AMBER * 5.5 * uTextGlow;
      c += pix * fresh * typed;
      // crown lighting keeps the words legible from above; it comes on line by line
      float line = floor(float(h.cell.y) / 9.0);
      float wave = smoothstep(line * 0.32, line * 0.32 + 0.45, uRevealWave);
      float crown = (uCrown + 1.2 * wave * uReveal) * (0.3 + 0.7 * rim) * (0.75 + 0.5 * b1);
      c += mix(AMBER, vec3(1.0, 0.82, 0.6), 0.4 * uReveal) * crown * 1.8 * typed;
      c += ledColor(b4) * rim * 2.5 * ledOn * float(led);
    } else if (!text) {
      c *= 1.0 - 0.7 * uReveal;
      c += vec3(0.8, 0.9, 1.0) * rim * 0.08 * uGeneric * step(0.82, b5) * (1.0 - 0.8 * uReveal);
    }
  }

  WHEN(n.y < 0.5 && h.part != 4) { // facades
    bool xFace = abs(n.x) > 0.5;
    float u = xFace ? p.z - h.bmin.z : p.x - h.bmin.x;
    float faceW = xFace ? h.bmax.z - h.bmin.z : h.bmax.x - h.bmin.x;
    float v = p.y;
    uint face = uint(n.x > 0.5 ? 0 : (n.x < -0.5 ? 1 : (n.z > 0.5 ? 2 : 3)));
    int style = h.part == 0 ? 3 : int(b4 * 3.99);
    float floorH = 3.4, bayT = 3.0;
    vec2 win = vec2(0.2, 0.3);
    if (style == 1) { floorH = 4.0; bayT = 1.6; win = vec2(0.05, 0.26); }       // curtain wall office
    else if (style == 2) { floorH = 2.95; bayT = 2.3; win = vec2(0.25, 0.4); }  // HK residential
    else if (style == 3) { floorH = 3.8; bayT = 5.5; win = vec2(0.03, 0.42); }  // ribbon windows
    float nb = max(1.0, floor(faceW / bayT + 0.5));
    float bayW = faceW / nb;
    float fl = floor(v / floorH);
    float bay = floor(u / bayW);
    vec2 f = vec2(u / bayW - bay, v / floorH - fl);
    float inWin = step(win.x, f.x) * step(f.x, 1.0 - win.x) * step(win.y, f.y) * step(f.y, 0.92);
    // glazing bars: centre mullion on punched windows, regular bars on ribbons
    float bar = style == 3 ? step(fract(u / 1.45), 0.05) : (style == 1 ? 0.0 : step(abs(f.x - 0.5), 0.018));
    if (h.part == 3 || v > H - 1.2) inWin = 0.0;

    uint wid = pcg(bid ^ (face * 7919u) ^ pcg(uint(fl) * 131u + uint(max(bay, 0.0))));
    float r1 = u2f(wid), r2 = u2f(pcg(wid + 1u)), r3 = u2f(pcg(wid + 2u));
    float floorOn = u2f(pcg(bid ^ (uint(fl) * 977u)));
    float occ = text ? mix(0.1, 0.6, b1) : mix(0.03, 0.44, b1 * b1);
    float floorF = style == 1 ? step(0.45, floorOn) * 1.7 : mix(0.35, 1.45, floorOn);
    if (style == 1) r1 = mix(r1, 0.2, 0.7);  // lit office floors are lit wall to wall
    float boot = h.B.y + h.B.z * 0.55 + v / 260.0 + r2 * 0.9;
    float on = step(r1, occ * floorF * lightsOn) * step(boot, uTime);

    float fres = pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    vec3 glass = vec3(0.006, 0.008, 0.012) + skyGlow(reflect(rd, n)) * (0.08 + 0.7 * fres) * (style == 1 ? 1.4 : 0.8);
    vec3 wall = c * (0.85 + 0.3 * step(f.y, 0.06));        // slab edges catch a little light
    vec3 fc = wall;
    WHEN(inWin > 0.5) {
      fc = glass + windowColor(b2, r3) * 0.012;
      WHEN(on > 0.5) {
        vec3 wc = windowColor(fract(b2 + (r3 - 0.5) * 0.25), r2);
        if (r3 > 0.965) wc = r2 > 0.5 ? vec3(0.35, 0.55, 1.0) * (0.7 + 0.3 * sin(uTime * 13.0 + r1 * 40.0)) : vec3(0.6, 1.0, 0.72);
        float inten = (text ? 1.9 : 1.45) * mix(0.55, 1.35, b3) * (0.5 + 0.8 * r2);
#ifdef HAS_INTERIOR
        WHEN(!cheap) {
          vec3 tng = xFace ? vec3(0, 0, 1) : vec3(1, 0, 0);
          vec3 ld = vec3(dot(rd, tng), rd.y, -dot(rd, n));
          vec2 fm = vec2((f.x - 0.5) * bayW, (f.y - 0.62) * floorH);
          inten *= room(fm, normalize(ld), 4.5, r2);
          inten *= mix(1.0, 0.4, step(0.7, fract(r1 * 7.3)) * smoothstep(0.3, 0.95, f.y)); // blinds
        }
#endif
        fc = glass * 0.25 + wc * inten;
      }
      fc = mix(fc, wall * 0.7, bar);
    }
#ifdef HAS_STREET
    // ground-floor shopfronts light the street
    WHEN(h.bmin.y < 0.5 && v < 4.8 && h.part != 3) {
      float sh = u2f(pcg(bid ^ face * 31u ^ uint(bay) * 7u));
      float open = step(0.3, sh) * step(0.9, v) * step(0.06, f.x) * step(f.x, 0.94);
      vec3 sc = sh > 0.9 ? vec3(1.0, 0.3, 0.5) : (sh > 0.7 ? vec3(0.65, 0.85, 1.0) : vec3(1.0, 0.82, 0.6));
      fc = mix(wall * 0.6, sc * (1.0 + 1.6 * sh), open * lightsOn);
    }
#endif
#ifdef HAS_LED
    // LED outlines on some text towers: the Symphony-of-Lights moment
    WHEN(led && ledOn > 0.0) {
      float e = min(u, faceW - u);
      float edge = exp(-e * e * 4.0) + exp(-pow(H - v, 2.0) * 1.2);
      float chase = exp(-pow((v / max(H, 1.0) - fract(uBeatPhase * 0.5 + b1)) * H / 5.0, 2.0)) * step(0.5, b3);
      fc += ledColor(b4) * (edge * 2.6 + chase * 1.2) * ledOn * (0.6 + 0.8 * uBeat);
    }
#endif
    c = fc * (0.6 + 0.4 * smoothstep(0.0, 16.0, v));
    // while a code tower is still rising, its crown trails light down the facade
    if (text && h.part != 3) {
      float fresh = 1.0 - smoothstep(0.0, 1.0, (uTime - h.B.y) / (h.B.z * 2.4));
      c += (type == 3 ? vec3(1.0, 0.8, 0.5) : AMBER) * 3.0 * fresh * exp(-(H - v) / 7.0) * step(h.B.x, uTime);
    }
  }
  // text towers brighten, the rest dims when the city spells the words
  return c * (text ? 1.0 + 0.6 * uReveal : 1.0 - 0.82 * uReveal);
}

// ------------------------------------------------------------ ground, cars, lamps
float lane(float x, float centre, float halfW) { return 1.0 - smoothstep(halfW * 0.6, halfW, abs(x - centre)); }

vec3 trafficAlong(float s, float across, float laneC, float dir, float speed, float seed) {
  float w = lane(across, laneC, 1.3);
  float spacing = 38.0;
  float pos = s - dir * speed * uTime;
  float k = floor(pos / spacing);
  float f = pos - k * spacing;
  float has = step(0.35, hash21(vec2(k, seed)));
  // light trail: bright head, exponential tail (long-exposure look)
  float head = dir > 0.0 ? spacing - f : f;
  float tail = exp(-head / 9.0) * step(0.0, head);
  vec3 c = dir > 0.0 ? vec3(1.0, 0.08, 0.03) * 2.4 : vec3(1.0, 0.82, 0.55) * 3.2;
  return c * tail * has * w;
}

vec3 traffic(vec2 xz) {
  vec3 c = vec3(0);
  float dW = uDistrict.x, dH = uDistrict.y;
  bool inD = xz.x > -60.0 && xz.x < dW + 30.0 && xz.y > -60.0 && xz.y < dH - 240.0;
  float zc = (floor(xz.y / 270.0) * 9.0 + 8.0) * 30.0;
  float xc = (floor(xz.x / 180.0) * 6.0 + 5.5) * 30.0;
  WHEN(inD && abs(xz.y - zc) < 26.0 && xz.y < 1080.0) {     // E-W avenues between code lines
    c += trafficAlong(xz.x, xz.y, zc - 9.0, 1.0, 17.0, zc);
    c += trafficAlong(xz.x, xz.y, zc - 4.0, 1.0, 13.0, zc + 1.0);
    c += trafficAlong(xz.x, xz.y, zc + 4.0, -1.0, 15.0, zc + 2.0);
    c += trafficAlong(xz.x, xz.y, zc + 9.0, -1.0, 19.0, zc + 3.0);
  }
  WHEN(inD && abs(xz.x - xc) < 10.0 && xz.y < 1030.0) {     // N-S streets between characters
    c += trafficAlong(xz.y, xz.x, xc - 3.0, 1.0, 14.0, xc + 7.0);
    c += trafficAlong(xz.y, xz.x, xc + 3.0, -1.0, 12.0, xc + 8.0);
  }
  float gx = (floor((xz.x / 30.0 + 1000.0) / 5.0) * 5.0 - 1000.0 + 4.5) * 30.0;
  float gz = (floor((xz.y / 30.0 + 1000.0) / 5.0) * 5.0 - 1000.0 + 4.5) * 30.0;
  WHEN(!inD && abs(xz.x - gx) < 14.0) {
    c += 0.7 * trafficAlong(xz.y, xz.x, gx - 5.0, 1.0, 13.0, gx);
    c += 0.7 * trafficAlong(xz.y, xz.x, gx + 5.0, -1.0, 12.0, gx + 1.0);
  }
  WHEN(!inD && abs(xz.y - gz) < 14.0) {
    c += 0.7 * trafficAlong(xz.x, xz.y, gz - 5.0, 1.0, 14.0, gz + 2.0);
    c += 0.7 * trafficAlong(xz.x, xz.y, gz + 5.0, -1.0, 11.0, gz + 3.0);
  }
  return c * uStreet;
}

vec3 shadeGround(vec3 p, vec3 rd) {
  ivec2 c = ivec2(floor(p.xz / CELL));
  vec2 f = p.xz - vec2(c) * CELL;
  vec3 col = vec3(0.010, 0.011, 0.014);
  // wet asphalt: faint sky sheen
  float fres = pow(1.0 - max(-rd.y, 0.0), 5.0);
  col += skyGlow(reflect(rd, vec3(0, 1, 0))) * (0.03 + 0.45 * fres);
  col += MOONC * 0.01 * uMoonLight;
  bool grid = inGrid(c);
  vec4 A = grid ? cityA(c) : vec4(0);
  int type = int(A.z) & 7;
  // flat LED pixels on the dark "screen"
  WHEN(grid && (type == 1 || type == 3)) {
    vec4 B = cityB(c);
    vec2 q = abs(f - 15.0);
    float inPix = 1.0 - smoothstep(10.0, 11.2, max(q.x, q.y));
    float typed = smoothstep(B.x, B.x + 0.06, uTime);
    float g = riseCurve(uTime, B.y, B.z);
    float glow = uTextGlow * typed * (1.0 - g);
    vec3 pc = type == 3 ? vec3(1.0, 0.78, 0.45) : AMBER;
    col += pc * 6.5 * glow * inPix;
    col += pc * 0.25 * glow * exp(-max(q.x, q.y) * 0.08); // soft spill
  }
#ifdef HAS_STREET
  WHEN(grid && uStreet > 0.0) {
    // street lamps: warm pools at some junctions, sparse on the plazas
    vec2 lampP = floor(p.xz / 30.0 + 0.5) * 30.0;
    float dl = length(p.xz - lampP);
    float plaza = (type == 4 || type == 3) ? 1.0 : 0.0;
    float lampOn = step(mix(0.45, 0.88, plaza), hashC(ivec2(lampP / 30.0), 5u));
    col += vec3(1.0, 0.6, 0.28) * mix(0.13, 0.07, plaza) * exp(-dl * dl / 55.0) * uStreet * lampOn;
    // shop light spilling onto the pavement next to building bases
    float ins = towerInset(type, A.w);
    vec2 q = abs(f - 15.0);
    float dEdge = max(max(q.x, q.y) - (15.0 - (A.y > 0.0 ? 3.5 : ins)), 0.0);
    float shop = step(0.001, A.x + A.y) * step(0.3, hashC(c, 9u));
    col += vec3(1.0, 0.75, 0.5) * 0.05 * exp(-dEdge / 2.0) * shop * uStreet;
    // plaza paving joints
    vec2 tile = fract(p.xz / 7.5);
    float joint = smoothstep(0.03, 0.0, min(min(tile.x, 1.0 - tile.x), min(tile.y, 1.0 - tile.y)));
    col = mix(col, col * 0.6, joint * plaza);
    col += traffic(p.xz);
  }
  WHEN(!grid && p.z < uShoreZ && uGeneric > 0.0) {
    // beyond the modelled plots the city continues as a carpet of lights
    float urban = smoothstep(0.32, 0.6, fbm3(p.xz / 2600.0 + 3.0)) * smoothstep(9000.0, 5000.0, length(p.xz - vec2(1800.0, -300.0)));
    vec2 blk = abs(fract(p.xz / 150.0) - 0.5) * 150.0;
    float road = exp(-min(blk.x, blk.y) * 0.9);
    vec2 lp = abs(fract(p.xz / 30.0) - 0.5) * 30.0;
    float lamps = road * exp(-dot(lp, lp) * 0.25);
    vec2 g = p.xz / 11.0;
    vec2 id = floor(g);
    float dd = length(fract(g) - 0.5);
    float win = step(0.8, hash21(id)) * exp(-dd * dd * 30.0);
    vec3 wc = mix(vec3(1.0, 0.62, 0.3), vec3(0.85, 0.9, 1.0), step(0.55, hash21(id + 7.0)));
    col += (vec3(1.0, 0.55, 0.22) * (0.06 * road + 1.6 * lamps) + wc * 0.9 * win) * urban * uGeneric * (1.0 - 0.6 * uReveal);
  }
#endif
  WHEN(uCursorMode > -0.5 && uCursorMode < 0.5) {
    // flat block cursor on the "screen"
    vec2 q = abs(p.xz - uCursor.xz) - uCursorSize.xz;
    float inside = 1.0 - smoothstep(-0.5, 1.5, max(q.x, q.y));
    col += uCursorCol * uCursorGlow * 3.2 * inside;
    col += uCursorCol * uCursorGlow * 0.3 * exp(-max(max(q.x, q.y), 0.0) * 0.03);
  }
  return col;
}

// Promenade lamps along the sea wall: closest approach to the lamp line.
vec3 lampRow(vec3 ro, vec3 rd, float tMax) {
  float zL = uShoreZ - 5.0, yL = 5.5;
  vec2 o = vec2(ro.y - yL, ro.z - zL);
  vec2 d = rd.yz;
  float dd = max(dot(d, d), 1e-6);
  float t = clamp(-dot(o, d) / dd, 0.0, tMax);
  vec3 p = ro + rd * t;
  float lx = (floor(p.x / 24.0) + 0.5) * 24.0;
  vec3 L = vec3(lx, yL, zL);
  float tl = clamp(dot(L - ro, rd), 0.0, tMax);
  float dist = length(ro + rd * tl - L);
  float inRange = step(-2600.0, lx) * step(lx, 6200.0);
  float core = exp(-dist * dist / 0.1) * 40.0;
  float halo = 0.35 / (1.0 + dist * dist * 0.06);
  return vec3(1.0, 0.72, 0.42) * (core + halo) * uStreet * inRange * step(tl, tMax);
}

// ------------------------------------------------------------ water
float waterH(vec2 p) {
  float t = uTime;
  float h = 0.0;
  h += 0.12 * sin(p.y * 0.11 + t * 1.2 + sin(p.x * 0.013) * 2.0);
  h += 0.08 * sin(p.y * 0.23 - t * 1.7 + p.x * 0.02);
  h += 0.18 * (noiseT(p * vec2(0.02, 0.07) + vec2(t * 0.1, t * 0.35)) - 0.5);
  h += 0.07 * (noiseT(p * vec2(0.07, 0.3) - vec2(t * 0.2, t * 0.6)) - 0.5);
  return h;
}

vec3 shadeWater(vec3 p, vec3 ro, vec3 rd, float pixAng) {
  vec2 e = vec2(0.5, 0.0);
  float h0 = waterH(p.xz);
  vec3 n = normalize(vec3(-(waterH(p.xz + e.xy) - h0) / e.x, 1.0, -(waterH(p.xz + e.yx) - h0) / e.x));
  vec3 rr = reflect(rd, n);
  rr.y = abs(rr.y);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  vec3 ro2 = p + vec3(0, 0.05, 0);
  vec3 refl = skyGlow(rr) + moonDisk(rr, pixAng * 3.0);
#ifdef HAS_WATER_TRACE
  Hit h;
  bool hit = traceCity(ro2, rr, 9000.0, h);
  WHEN(!hit && rr.y < 0.1) {
    vec4 rg = ridge(ro2, rr, 7600.0, 1.0, 0.8);
    if (rg.w > 0.0) refl = rg.rgb;
  }
  WHEN(hit) {
    refl = shadeBuilding(h, ro2, rr, true);
    refl = mix(refl, skyGlow(rr) * 1.2, 1.0 - exp(-h.t * uFogDen * 0.8));
  }
#endif
#ifdef HAS_STREET
  WHEN(uStreet > 0.0) refl += lampRow(ro2, rr, 9000.0);
#endif
  float cm = max(dot(rr, uMoonDir), 0.0);
  refl += vec3(1.0, 0.95, 0.85) * uMoonVis * pow(cm, 500.0) * 6.0;
  return vec3(0.0015, 0.004, 0.006) + refl * fres;
}

// ------------------------------------------------------------ cursor object
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float cursorSDF(vec3 p) {
  vec3 q = p - uCursor.xyz;
  float b = sdBox(q, uCursorSize) - 1.0;
  float s = length(q) - uCursorR;
  return mix(b, s, uCursor.w);
}
bool traceCursor(vec3 ro, vec3 rd, float tMax, out float tHit, out vec3 nrm) {
  tHit = tMax;
  nrm = vec3(0, 1, 0);
  float R = max(length(uCursorSize) * (1.0 - uCursor.w) + uCursorR * uCursor.w, uCursorR) + 5.0;
  vec3 oc = ro - uCursor.xyz;
  float b = dot(oc, rd), c = dot(oc, oc) - R * R;
  float disc = b * b - c;
  float t = max(-b - sqrt(max(disc, 0.0)), 0.0);
  float tEnd = min(-b + sqrt(max(disc, 0.0)), tMax);
  int iters = disc > 0.0 && t < tEnd ? 64 : 0;
  for (int i = 0; i < iters; i++) {
    if (t > tEnd) return false;
    float d = cursorSDF(ro + rd * t);
    if (d < 0.02 * (1.0 + t * 0.001)) {
      vec3 p = ro + rd * t;
      vec2 e = vec2(0.05, 0.0);
      nrm = normalize(vec3(cursorSDF(p + e.xyy) - cursorSDF(p - e.xyy), cursorSDF(p + e.yxy) - cursorSDF(p - e.yxy), cursorSDF(p + e.yyx) - cursorSDF(p - e.yyx)));
      tHit = t;
      return true;
    }
    t += d;
  }
  return false;
}

// Analytic in-scattering from a point light (glow around the rising cursor).
vec3 pointGlow(vec3 ro, vec3 rd, float t, vec3 L, vec3 col) {
  vec3 w = L - ro;
  float b = dot(rd, w);
  float c = dot(w, w);
  float hh = sqrt(max(c - b * b, 1.0));
  return col * (atan((t - b) / hh) - atan(-b / hh)) / hh;
}

// Search-light beams: closest approach of the view ray to each beam axis.
vec3 beams(vec3 ro, vec3 rd, float tMax) {
  vec3 acc = vec3(0);
  for (int i = 0; i < uBeamN; i++) {
    vec3 o = uBeamO[i].xyz; vec3 d = uBeamD[i].xyz;
    float I = uBeamO[i].w, w = uBeamD[i].w;
    vec3 r = ro - o;
    float a = dot(rd, d);
    float den = max(1.0 - a * a, 1e-4);
    float tr = (a * dot(r, d) - dot(r, rd)) / den;
    float sb = dot(r + rd * tr, d);
    float dist = length(r + rd * tr - d * sb);
    float width = w + max(sb, 0.0) * 0.012;
    float vis = step(0.0, tr) * step(tr, tMax) * step(0.0, sb);
    acc += vis * uBeamC[i] * I * exp(-dist * dist / (width * width)) * exp(-sb / 5200.0) / sqrt(den) * (w / width);
  }
  return acc;
}

vec3 fogColor(vec3 rd, float midY) {
  vec3 warm = vec3(0.046, 0.028, 0.019);
  vec3 cool = vec3(0.011, 0.017, 0.031);
  vec3 c = mix(warm, cool, smoothstep(40.0, 700.0, midY));
  float cm = max(dot(rd, uMoonDir), 0.0);
  c += MOONC * uMoonVis * (0.012 * pow(cm, 6.0) + 0.05 * pow(cm, 60.0));
  return c * (0.6 + 0.4 * uGeneric);
}

vec3 applyFog(vec3 col, vec3 ro, vec3 rd, float t) {
  float b = 1.0 / 260.0;
  float a = uFogDen;
  float ry = rd.y;
  float amt = abs(ry) < 1e-4 ? a * exp(-b * ro.y) * t
                             : (a / b) * exp(-b * ro.y) * (1.0 - exp(-b * ry * t)) / ry;
  amt += t * 0.000035;                       // thin haze everywhere
  float T = exp(-amt);
  float midY = ro.y + rd.y * min(t, 4000.0) * 0.5;
  return col * T + fogColor(rd, midY) * (1.0 - T);
}

// ------------------------------------------------------------ main
void main() {
  vec2 px = gl_FragCoord.xy + uJitter;
  vec2 ndc = (2.0 * px - uRes) / uRes.y;
  vec3 dirC = normalize(vec3(ndc * uTanHalfFov, 1.0));
  // thin-lens depth of field; the stratified lens sample is rotated per pixel
  float ang = hash21(floor(gl_FragCoord.xy)) * 6.2831;
  vec2 lens = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * uLens * uAperture;
  vec3 focalP = dirC * (uFocus / dirC.z);
  vec3 oC = vec3(lens, 0.0);
  vec3 ro = uCamPos + uCamRot * oC;
  vec3 rd = normalize(uCamRot * normalize(focalP - oC));
  float pixAng = 2.0 * uTanHalfFov / uRes.y;

  float tGround = rd.y < 0.0 ? (0.0 - ro.y) / rd.y : FAR;
  Hit h;
  h.t = FAR;
  bool hitB = false;
#ifdef HAS_CITY
  hitB = traceCity(ro, rd, min(tGround, FAR), h);
#endif
  float tHit = hitB ? h.t : tGround;
  float tC = tHit; vec3 nC = vec3(0, 1, 0);
  bool hitC = false;
#ifdef HAS_CURSOR3D
  WHEN(uCursorMode > 0.5) hitC = traceCursor(ro, rd, tHit, tC, nC);
#endif

  if (uDebug == 1) {
    outColor = vec4((hitB ? h.n * 0.5 + 0.5 : vec3(0.1)) * exp(-tHit / 8000.0), 1.0);
    return;
  }

  // 0 cursor, 1 building, 2 land, 3 sea (or sea wall), 4 sky
  vec3 pG = ro + rd * tGround;
  int kind = hitC ? 0 : (hitB ? 1 : (tGround < FAR ? (pG.z > uShoreZ ? 3 : 2) : 4));
  vec3 col = vec3(0);
#ifdef HAS_CURSOR3D
  WHEN(kind == 0) {
    tHit = tC;
    vec3 p = ro + rd * tC;
    float fres = pow(1.0 - max(dot(-rd, nC), 0.0), 3.0);
    // as it flies off it turns into the moon: lunar albedo seen along the view axis
    vec3 vu = normalize(cross(vec3(0, 1, 0), rd));
    vec3 vv = cross(rd, vu);
    vec2 q = vec2(dot(nC, vu), dot(nC, vv));
    vec3 lunar = vec3(1.0, 0.97, 0.92) * moonAlbedo(q) * (0.55 + 0.45 * pow(max(dot(-rd, nC), 0.0), 0.35)) * 9.0;
    vec3 glow = uCursorCol * uCursorGlow * 6.0 * (1.0 + fres);
    col = mix(glow, lunar, uCursorMoon);
  }
#endif
#ifdef HAS_CITY
  WHEN(kind == 1) col = shadeBuilding(h, ro, rd, false);
#endif
  WHEN(kind == 2) col = shadeGround(pG, rd);
  WHEN(kind == 3) {
    // the sea sits 2 m below the promenade, behind a sea wall
    float tw = (-2.0 - ro.y) / rd.y;
    vec3 pw = ro + rd * tw;
    col = vec3(0.02, 0.018, 0.017) + vec3(1.0, 0.7, 0.4) * 0.06 * uStreet;
#ifdef HAS_WATER
    WHEN(pw.z > uShoreZ) { col = shadeWater(pw, ro, rd, pixAng); tHit = tw; }
#endif
  }
  WHEN(kind == 4) {
    float tS;
    col = skyAll(ro, rd, pixAng, tS);
    tHit = tS;
  }

  if (tHit < FAR) col = applyFog(col, ro, rd, kind == 0 ? min(tHit, 2500.0) : tHit);
#ifdef HAS_STREET
  WHEN(uStreet > 0.0) col += lampRow(ro, rd, tHit);
#endif
#ifdef HAS_BEAMS
  col += beams(ro, rd, tHit);
#endif
#ifdef HAS_CURSOR3D
  WHEN(uCursorMode > 0.5) col += pointGlow(ro, rd, tHit, uCursor.xyz, uCursorCol * uCursorGlow * 10.0);
#endif
  outColor = vec4(max(col, 0.0), 1.0);
}`;

// ---------------------------------------------------------------- post chain

// 13-tap downsample (Jimenez 2014). First pass applies a Karis average
// so single hot pixels cannot explode into bloom fireflies.
export const DOWN = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uScale;
uniform int uKaris;
out vec4 o;
vec3 s(vec2 uv) { return texture(uSrc, uv).rgb * uScale; }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 kw(vec3 c) { return c / (1.0 + lum(c)); }
void main() {
  vec2 t = uTexel;
  vec3 a = s(vUv + t * vec2(-2, 2)), b = s(vUv + t * vec2(0, 2)), c = s(vUv + t * vec2(2, 2));
  vec3 d = s(vUv + t * vec2(-2, 0)), e = s(vUv), f = s(vUv + t * vec2(2, 0));
  vec3 g = s(vUv + t * vec2(-2, -2)), h = s(vUv + t * vec2(0, -2)), i = s(vUv + t * vec2(2, -2));
  vec3 j = s(vUv + t * vec2(-1, 1)), k = s(vUv + t * vec2(1, 1)), l = s(vUv + t * vec2(-1, -1)), m = s(vUv + t * vec2(1, -1));
  vec3 r;
  if (uKaris == 1) {
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = 1.0 / (1.0 + lum(g0)), w1 = 1.0 / (1.0 + lum(g1)), w2 = 1.0 / (1.0 + lum(g2)), w3 = 1.0 / (1.0 + lum(g3)), w4 = 1.0 / (1.0 + lum(g4));
    r = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
  } else {
    r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  o = vec4(r, 1.0);
}`;

// 3×3 tent upsample, blended additively onto the next larger mip.
export const UP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
out vec4 o;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += (texture(uSrc, vUv + vec2(t.x, 0)).rgb + texture(uSrc, vUv - vec2(t.x, 0)).rgb + texture(uSrc, vUv + vec2(0, t.y)).rgb + texture(uSrc, vUv - vec2(0, t.y)).rgb) * 2.0;
  c += texture(uSrc, vUv + t).rgb + texture(uSrc, vUv - t).rgb + texture(uSrc, vUv + vec2(t.x, -t.y)).rgb + texture(uSrc, vUv + vec2(-t.x, t.y)).rgb;
  o = vec4(c / 16.0, 1.0);
}`;

// Horizontal streak for the anamorphic flare look.
export const STREAK = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uStep;
uniform float uThreshold;
out vec4 o;
void main() {
  vec3 acc = vec3(0); float wsum = 0.0;
  for (int i = -6; i <= 6; i++) {
    float w = exp(-float(i * i) / 18.0);
    vec3 c = texture(uSrc, vUv + vec2(float(i) * uStep * uTexel.x, 0.0)).rgb;
    if (uThreshold > 0.0) c = max(c - uThreshold, 0.0);
    acc += c * w; wsum += w;
  }
  o = vec4(acc / wsum, 1.0);
}`;

export const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHDR;
uniform sampler2D uBloom;
uniform sampler2D uStreak;
uniform sampler2D uOverlay;
uniform float uInvN;
uniform vec2 uOut;            // output size (px)
uniform vec4 uView;           // active image rect in output px: x, y, w, h
uniform float uExposure;
uniform float uBloomAmt;
uniform float uStreakAmt;
uniform float uCA;
uniform float uGrain;
uniform float uFade;
uniform float uFrame;
uniform float uVignette;
uniform int uRaw;
out vec4 o;

const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
vec3 rrt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c) { return clamp(ACESOut * rrt(ACESIn * c), 0.0, 1.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main() {
  vec2 fc = vUv * uOut;
  vec2 lp = (fc - uView.xy) / uView.zw;            // 0..1 inside the active image
  vec3 outc = vec3(0);
  if (lp.x >= 0.0 && lp.y >= 0.0 && lp.x <= 1.0 && lp.y <= 1.0) {
    vec2 cc = lp - 0.5;
    float r2 = dot(cc, cc);
    vec2 caOff = cc * uCA * r2;
    vec3 hdr;
    hdr.r = texture(uHDR, lp - caOff).r;
    hdr.g = texture(uHDR, lp).g;
    hdr.b = texture(uHDR, lp + caOff).b;
    hdr *= uInvN;
    vec3 bloom = texture(uBloom, lp).rgb;
    vec3 streak = texture(uStreak, lp).rgb;
    vec3 c = hdr;
    if (uRaw == 0) {
      c += bloom * uBloomAmt * vec3(1.0, 0.94, 0.9);
      c += streak * uStreakAmt * vec3(0.55, 0.75, 1.0);
      c *= uExposure;
      // split toning in linear light: cool shadows, warm highlights
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, c * vec3(0.86, 0.98, 1.16), 0.35 * (1.0 - smoothstep(0.0, 0.25, l)));
      c = aces(c * 1.05);
      // vignette (cos^4-ish)
      c *= mix(1.0, pow(max(1.0 - r2 * 1.35, 0.0), 1.6), uVignette);
      c = toSRGB(c);
      // grain: luminance weighted, per frame
      float g = h12(fc + fract(uFrame * 0.618) * 913.0) + h12(fc * 1.7 + fract(uFrame * 0.414) * 517.0) - 1.0;
      float lm = dot(c, vec3(0.333));
      c += g * uGrain * (0.35 + 0.65 * (1.0 - abs(lm * 2.0 - 1.0)));
    } else {
      c = toSRGB(clamp(c * uExposure, 0.0, 1.0));
    }
    outc = c * uFade;
  }
  vec4 ov = texture(uOverlay, vec2(vUv.x, 1.0 - vUv.y));
  outc = outc * (1.0 - ov.a) + ov.rgb;
  // triangular dither before 8-bit quantisation kills banding in the night sky
  float d = h12(fc + 0.37) + h12(fc.yx + 11.1) - 1.0;
  outc += d / 255.0;
  o = vec4(outc, 1.0);
}`;
