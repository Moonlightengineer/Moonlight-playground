// Rendering engine: one deterministic function from film time to pixels.
// The same code drives the real-time page and the offline 24 fps render.
import { VERT, scene, DOWN, UP, STREAK, COMPOSITE } from './shaders.js';
import { buildCity, mulberry32, GX0, GZ0, GW, GH, SHORE_Z, CHAR_W, LINE_H, CELL, OUTPUT_LINE } from './city.js';
import { sceneAt, gradeAt, featuresAt, FPS, DURATION, CUTS } from './timeline.js';

const SCOPE = 2.39;             // anamorphic widescreen inside 16:9
export const ALL_FEATURES = ['HAS_CITY', 'HAS_SKY', 'HAS_WATER', 'HAS_WATER_TRACE', 'HAS_CURSOR3D', 'HAS_STREET', 'HAS_BEAMS', 'HAS_LED', 'HAS_INTERIOR'];

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`);
    const m = /0:(\d+)/.exec(log || '');
    const ctx = m ? lines.slice(Math.max(0, m[1] - 4), +m[1] + 2).join('\n') : '';
    throw new Error(`Shader compile failed: ${log}\n${ctx}`);
  }
  return s;
}

function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const loc = new Map();
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    loc.set(info.name.replace(/\[0\]$/, ''), { l: gl.getUniformLocation(p, info.name), type: info.type, size: info.size });
  }
  return { p, loc };
}

function target(gl, w, h, internal = gl.RGBA16F, filter = gl.LINEAR) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (ok !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`FBO incomplete ${ok}`);
  return { tex, fbo, w, h };
}

// Low-discrepancy sequences for sub-frame sampling.
const R2 = (i, o = 0) => [((0.5 + (i + o) * 0.7548776662466927) % 1), ((0.5 + (i + o) * 0.5698402909980532) % 1)];
const tent = (u) => (u < 0.5 ? Math.sqrt(2 * u) - 1 : 1 - Math.sqrt(2 - 2 * u));
function disk(u, v) { // concentric (Shirley–Chiu) mapping
  const a = 2 * u - 1, b = 2 * v - 1;
  if (a === 0 && b === 0) return [0, 0];
  let r, phi;
  if (Math.abs(a) > Math.abs(b)) { r = a; phi = (Math.PI / 4) * (b / a); }
  else { r = b; phi = Math.PI / 2 - (Math.PI / 4) * (a / b); }
  return [r * Math.cos(phi), r * Math.sin(phi)];
}

export class Film {
  constructor(canvas, { width = 1920, height = 1080, scale = 1, overlay = null } = {}) {
    this.canvas = canvas;
    this.W = width; this.H = height;
    this.scale = scale;
    this.vw = Math.round(width * scale);
    this.vh = Math.round(Math.min(height, width / SCOPE) * scale / 2) * 2;
    canvas.width = width; canvas.height = height;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 unavailable');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
    this.floatBlend = !!gl.getExtension('EXT_float_blend');
    gl.getExtension('OES_texture_float_linear');
    this.gl = gl;
    this.overlayCanvas = overlay;
    this.city = buildCity();
    this.debug = 0;
    this.raw = false;
    this.#setup();
  }

  #setup() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.scenes = new Map();          // feature-specialised variants, compiled on demand
    this.progDown = program(gl, DOWN);
    this.progUp = program(gl, UP);
    this.progStreak = program(gl, STREAK);
    this.progComp = program(gl, COMPOSITE);

    const dataTex = (arr) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, GW, GH, 0, gl.RGBA, gl.FLOAT, arr);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      return t;
    };
    this.texA = dataTex(this.city.A);
    this.texB = dataTex(this.city.B);
    // coarse max-height grid (8×8 plots per texel) for ray skipping
    const cx0 = Math.floor(GX0 / 8), cz0 = Math.floor(GZ0 / 8);
    const cx1 = Math.floor((GX0 + GW - 1) / 8), cz1 = Math.floor((GZ0 + GH - 1) / 8);
    const cw = cx1 - cx0 + 1, ch = cz1 - cz0 + 1;
    const coarse = new Float32Array(cw * ch);
    for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) {
      const i = (z * GW + x) * 4;
      const a = this.city.A[i], p = this.city.A[i + 1];
      const hmax = Math.max(a > 0 ? a * 1.06 + 40 : 0, p * 1.06);
      const k = (Math.floor((z + GZ0) / 8) - cz0) * cw + (Math.floor((x + GX0) / 8) - cx0);
      coarse[k] = Math.max(coarse[k], hmax);
    }
    this.coarse = { min: [cx0, cz0], size: [cw, ch] };
    this.texCoarse = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texCoarse);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, cw, ch, 0, gl.RED, gl.FLOAT, coarse);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const rnd = mulberry32(77);
    const noise = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(rnd() * 256);
    this.texNoise = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texNoise);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, noise);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    this.texOverlay = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texOverlay);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.#allocTargets();
  }

  #allocTargets() {
    const gl = this.gl;
    const { vw, vh } = this;
    this.accum = target(gl, vw, vh, this.floatBlend ? gl.RGBA32F : gl.RGBA16F, gl.LINEAR);
    this.mips = [];
    let w = vw, h = vh;
    for (let i = 0; i < 6; i++) {
      w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
      this.mips.push(target(gl, w, h));
    }
    const s = this.mips[1];
    this.streakA = target(gl, s.w, s.h);
    this.streakB = target(gl, s.w, s.h);
  }

  setScale(scale) {
    this.scale = scale;
    this.vw = Math.round(this.W * scale);
    this.vh = Math.round(Math.min(this.H, this.W / SCOPE) * scale / 2) * 2;
    this.#allocTargets();
  }

  #uniforms(prog, values) {
    const gl = this.gl;
    for (const [name, v] of Object.entries(values)) {
      const u = prog.loc.get(name);
      if (!u) continue;
      switch (u.type) {
        case gl.FLOAT: u.size > 1 ? gl.uniform1fv(u.l, v) : gl.uniform1f(u.l, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.l, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.l, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.l, v); break;
        case gl.INT: case gl.SAMPLER_2D: gl.uniform1i(u.l, v); break;
        case gl.INT_VEC2: gl.uniform2iv(u.l, v); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.l, false, v); break;
        default: throw new Error(`Unhandled uniform type for ${name}`);
      }
    }
  }

  #bindTex(unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  sceneProgram(defs) {
    const key = defs.join(',');
    if (!this.scenes.has(key)) this.scenes.set(key, program(this.gl, scene(defs)));
    return this.scenes.get(key);
  }

  // Scene pass: accumulate one sample at film time t into the HDR buffer.
  #sample(t, i, n, frame) {
    const gl = this.gl;
    const s = sceneAt(t, this.city);
    const [jx, jy] = R2(i, frame * 7);
    const [lu, lv] = R2(i, 1000 + frame * 3);
    const lens = disk(lu, lv);
    const P = this.sceneProgram(this.forceFeatures || (this.allFeatures ? ALL_FEATURES : featuresAt(t)));
    gl.useProgram(P.p);
    this.#bindTex(0, this.texA);
    this.#bindTex(1, this.texB);
    this.#bindTex(2, this.texNoise);
    this.#bindTex(3, this.texCoarse);
    const cam = s.cam;
    this.#uniforms(P, {
      uCityA: 0, uCityB: 1, uNoise: 2, uCoarse: 3, uCoarseMin: this.coarse.min, uCoarseSize: this.coarse.size,
      uRes: [this.vw, this.vh],
      uJitter: n > 1 ? [tent(jx) * 0.8, tent(jy) * 0.8] : [0, 0],
      uLens: n > 1 ? lens : [0, 0],
      uTime: t,
      uCamPos: cam.pos, uCamRot: cam.rot, uTanHalfFov: Math.tan(cam.fov * Math.PI / 360),
      uFocus: cam.focus, uAperture: n > 1 ? cam.aperture : 0,
      uDebug: this.debug,
      uGridMin: [GX0, GZ0], uGridSize: [GW, GH], uMaxH: this.city.maxH, uShoreZ: SHORE_Z,
      uDistrict: [this.city.districtW * CELL, (OUTPUT_LINE + 1) * LINE_H * CELL],
      ...s.u,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Render one output frame. samples>1 integrates motion blur (180° shutter),
  // anti-aliasing and depth of field by distributed ray tracing.
  render(t0, { samples = 1, shutter = 0.5 / FPS, frame = 0 } = {}) {
    const gl = this.gl;
    // the shutter never straddles a cut: a frame only integrates its own shot
    let open = t0 - shutter * 0.5;
    for (const c of CUTS) {
      if (t0 >= c && open < c) open = c;
      if (t0 < c && open + shutter > c) open = c - shutter - 1e-4;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accum.fbo);
    gl.viewport(0, 0, this.vw, this.vh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = 0; i < samples; i++) {
      const t = samples > 1 ? open + shutter * (i + 0.5) / samples : t0;
      this.#sample(Math.max(0, Math.min(DURATION, t)), i, samples, frame);
    }
    gl.disable(gl.BLEND);
    this.#post(t0, 1 / samples, frame);
  }

  #post(t, invN, frame) {
    const gl = this.gl;
    const g = gradeAt(t);
    // bloom pyramid
    let src = this.accum, scale = invN;
    gl.useProgram(this.progDown.p);
    this.mips.forEach((m, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo);
      gl.viewport(0, 0, m.w, m.h);
      this.#bindTex(0, src.tex);
      this.#uniforms(this.progDown, { uSrc: 0, uTexel: [1 / src.w, 1 / src.h], uScale: scale, uKaris: i === 0 ? 1 : 0 });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = m; scale = 1;
    });
    gl.useProgram(this.progUp.p);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.mips.length - 1; i > 0; i--) {
      const from = this.mips[i], to = this.mips[i - 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
      gl.viewport(0, 0, to.w, to.h);
      this.#bindTex(0, from.tex);
      this.#uniforms(this.progUp, { uSrc: 0, uTexel: [1 / from.w, 1 / from.h], uRadius: 1.0 });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
    // anamorphic streak from the quarter-res mip
    gl.useProgram(this.progStreak.p);
    const passes = [[this.mips[1], this.streakA, 1, g.streakThreshold], [this.streakA, this.streakB, 4, 0], [this.streakB, this.streakA, 14, 0]];
    for (const [a, b, stepPx, th] of passes) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
      gl.viewport(0, 0, b.w, b.h);
      this.#bindTex(0, a.tex);
      this.#uniforms(this.progStreak, { uSrc: 0, uTexel: [1 / a.w, 1 / a.h], uStep: stepPx, uThreshold: th });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // overlay (titles / code HUD) drawn by the timeline on a 2-D canvas
    if (this.overlayCanvas) {
      gl.bindTexture(gl.TEXTURE_2D, this.texOverlay);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.overlayCanvas);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.W, this.H);
    gl.useProgram(this.progComp.p);
    this.#bindTex(0, this.accum.tex);
    this.#bindTex(1, this.mips[0].tex);
    this.#bindTex(2, this.streakA.tex);
    this.#bindTex(3, this.texOverlay);
    const vh = Math.round(this.W / SCOPE / 2) * 2;
    this.#uniforms(this.progComp, {
      uHDR: 0, uBloom: 1, uStreak: 2, uOverlay: 3,
      uInvN: invN, uOut: [this.W, this.H], uView: [0, (this.H - vh) / 2, this.W, vh],
      uExposure: g.exposure, uBloomAmt: g.bloom, uStreakAmt: g.streak, uCA: g.ca, uGrain: g.grain,
      uFade: g.fade, uFrame: frame, uVignette: g.vignette, uRaw: this.raw ? 1 : 0,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  readPixels() {
    const gl = this.gl;
    const px = new Uint8Array(this.W * this.H * 4);
    gl.readPixels(0, 0, this.W, this.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }
}
