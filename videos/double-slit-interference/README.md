# Young's Double-Slit Interference — silent teaching film

A silent, English-captioned motion-design lesson for senior-secondary physics students.
Every frame is drawn in code (HTML Canvas 2D, plain JavaScript modules), then captured in headless
Chromium and encoded to MP4 with ffmpeg. No AI image generation, stock footage or voiceover.

- **Finished film:** `out/double-slit-interference.mp4` (9 min 26 s, 1920×1080, 30 fps, H.264, silent)
- **Poster frame:** `out/poster.jpg`
- **Editable source:** everything in this folder

## Lesson flow

| # | Section | What students should take away |
|---|---|---|
| — | Opening (3D lab) | Predict two bright bands, see many fringes. Hook: *how can adding light make darkness?* |
| 1 | When waves meet | Superposition. In phase → constructive (double amplitude, 4× brightness); ½λ out → destructive; a whole λ shift → constructive again. |
| 2 | Two slits, two sources | Top-view wave field: diffraction at each slit, coherent (in-step) sources, lines of constructive and destructive interference, fringes where they meet the screen. |
| 3 | Path difference | δ = r₂ − r₁, shown with straightened paths and the waves arriving at P. Bright: δ = mλ; dark: δ = (m + ½)λ. Misconception: dark fringes still receive light from both slits. Quick check. |
| 4 | Where are the fringes? | Zoom on the slits: δ = d sinθ. Big triangle: tanθ = y/D. Small angles (D ≫ d and y ≪ D): δ ≈ dy/D → yₘ = mλD/d → Δy = λD/d, evenly spaced. |
| 5 | Slit separation | Live field with changing d; graph of δ against y explains *why* larger d gives closer fringes; real-scale strips with a millimetre ruler (d = 0.40 mm vs 0.80 mm → Δy ≈ 2.0 mm vs 1.0 mm); effect of λ and D. Quick check. |
| 6 | Try a calculation | λ = 600 nm, d = 0.30 mm, D = 1.5 m → Δy = 3.0 mm, with a measuring tip. |
| 7 | Summary | Four key ideas, then the answer to the opening question (energy is redistributed, not destroyed). |

"Pause and think" questions show a countdown before the answer appears, so the film also works when a teacher pauses it in class.

## Physics notes and deliberate simplifications

- The top-view wave fields are computed exactly from two point sources (`src/field.js`): each slit radiates `a(r)·cos(kr − ωt)`; the time-averaged view shows `|Σ a·e^{ikr}|²`. The positions of P, the marked fringes and the nodal/antinodal lines are solved from the same exact geometry, so the picture and the numbers agree.
- Those diagrams are **not to scale** (d is a few wavelengths and the screen is close) so that individual waves are visible. Because of this, fringe spacing in the diagrams grows slightly away from the centre; the film states that real set-ups use tiny angles, where Δy = λD/d holds and fringes are evenly spaced.
- Real-scale fringe strips use cos²(πy/Δy) multiplied by a single-slit envelope (slit width 0.08 mm stated on screen), so the brightness fade is shown honestly without changing the spacing.
- Brightness ∝ amplitude² is used for the 4× statement.
- The 532 nm laser is drawn in one consistent mint-green; the red/blue comparison uses approximate wavelength colours.

Numbers shown on screen (all checked): 532 nm × 1.5 m / 0.40 mm = 1.995 mm ≈ 2.0 mm; / 0.80 mm ≈ 1.0 mm;
600 nm × 1.5 m / 0.30 mm = 3.0 mm; sin 0.2° = tan 0.2° = 0.003491 (4 s.f.); D/d = 1.5 m / 0.3 mm = 5000.

## Preview and edit

Requires Node.js 20+ and ffmpeg. Playwright's Chromium is only needed for rendering.

```bash
npm install            # installs playwright (only needed for stills / render)
npm run preview        # then open http://127.0.0.1:8080/index.html
```

The preview page plays the film live in the browser with a scrubber, chapter buttons and keyboard
controls (Space = play/pause, ← / → = 5 s). Append `?t=120` to start at 2:00.

Structure:

```text
index.html            canvas + fonts + preview controls
src/main.js           timeline, preview player, frame API (window.FILM)
src/core.js           palette, easing, rich text ($math$, {colour:…}, **bold**), equations, shapes
src/widgets.js        captions, chapter cards, quick-check card, fringe strips, ruler, lamp
src/field.js          two-source wave field and exact geometry helpers
src/scenes.js         scene order
src/scenes/*.js       one file per section; timings are local seconds inside each scene
render/server.mjs     tiny static server (no dependencies)
render/stills.mjs     render chosen times to JPEG for review
render/render.mjs     parallel frame capture → ffmpeg → MP4
fonts/                Inter, Space Grotesk, STIX Two Text, JetBrains Mono (SIL OFL) and a DejaVu Sans
                      symbol subset for ≪ ≫ ∝ (Bitstream Vera/DejaVu licence); licences included
```

To change wording, edit the `caption(...)` calls in the relevant scene file; each takes a start and end
time in seconds. To change a scene's length, edit its `dur` and the timings inside it.

## Render

```bash
npm run render                               # full film → out/double-slit-interference.mp4
node render/render.mjs --from 60 --to 90     # a section only → out/partial-60-90.mp4
node render/stills.mjs out/stills 30 95 200  # review frames at given times (seconds)
```

A full render takes about 10 minutes on 4 CPU cores.
