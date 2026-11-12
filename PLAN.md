# Dragon Meadow — masterplan (2026-11-12)

Eddie saw two clips (`refs/ref-meadow.png`, `refs/ref-dragon.png`) of a Three.js + WebGPU + Blender
experience running in the browser and said: *"Yes, build it"* — a first walkable scene: one grass
field with fog, a hero you can walk around, a dragon overhead. Then: *"please orchestrate your
fleet to do this"*, and: *"you may build assets using local or highly detailed ones from
Higgsfield with cap"* (cap: 40 credits, spent only by the orchestrator, only if a local model fails).

**Goal check:** `node tools/shot.mjs shots/final-walk.png "auto=walk" 5000` exits 0, and the
picture reads like `refs/ref-meadow.png`: hero from behind, walking through dense wind-blown
grass with wildflowers, distance dissolving into pale haze, the dragon flying overhead.

## Look (from the two reference frames — open them, they are the spec)

- **Meadow:** dense, knee-to-thigh-high grass (0.5–1.0 m) to the horizon. Muted green, lighter
  yellow-green tips, cool teal in shade. Scattered wildflowers: white, orange-red, yellow — small
  dots, thicker near the camera. Visible wind: slow travelling gusts, not uniform wobble.
- **Air:** bright overcast, pale grey-white sky with a soft glow low ahead. Near grass crisp to
  ~30 m; beyond that it fades into haze; by ~250 m land is a soft silhouette. **No hard line where
  ground meets sky** — fog colour and sky horizon colour are the same (`ctx.fogColor`).
- **Land:** gentle rolling meadow around the start. Northward (−Z) it climbs to a grassy crest
  (~25 m high around z = −200), then drops as a cliff to a sea far below (`refs/ref-dragon.png`).
- **Hero:** seen from behind, lower-middle of frame, camera ~1.5–2 m up and ~4.5 m back.
- **Dragon:** large, slow wingbeats, banking curves above the meadow, sometimes passing close.
- **Lens:** soft. Slight bloom on the bright sky, mild vignette, gentle film grain. Optional soft
  near/far blur. Nothing neon, nothing saturated.

## Contract (src/main.js owns it — no lane edits main.js)

`main.js` creates `renderer` (WebGPURenderer, ACES, shadows on), `scene`, `camera`, then loads
modules in order `field → sky → hero → dragon`, then `post`. Each exports one async factory taking
the shared `ctx` and returning `{ update(dt, t) }`. A module that throws is logged to
`window.__errors` as `"<module>: message"` and the page keeps running without it.

| ctx field | writer | readers | meaning |
|---|---|---|---|
| `THREE, renderer, scene, camera, params` | main | all | `params` = URLSearchParams of the page |
| `heightAt(x, z)` | field (replace at create) | hero, dragon, sky | ground height in metres, pure JS, fast |
| `heroPos` (Vector3) | hero, every frame | field (grass push), sky (shadow follow) | hero feet position |
| `sunDir` (Vector3) | main, fixed | field, sky | direction TO the sun |
| `fogColor` (Color) | main, fixed | field, sky, post | haze/horizon colour |
| `time` | main | all | seconds since start |

Probes: each lane sets `window.__probes.<lane> = () => ({ ...facts })`; `tools/shot.mjs` prints them.
Units: metres, +Y up, the hero starts at the origin facing −Z.

## Tools every lane uses

- **See your work:** `node tools/shot.mjs shots/<lane>-<name>.png "<query>" <waitMs>` — needs a
  local port, so run it with `dangerouslyDisableSandbox: true`. Prints JSON `{ready, errors,
  consoleErrors, probes}`. Open the PNG with Read and LOOK. Captures queue on a lock (~15 s each).
  Never start your own dev server or browser.
- **Proven three r185 WebGPU/TSL code to borrow patterns from (read-only, do not import):**
  `/Users/eddie/Documents/wanderlight/src/life/grass.js` (camera-following blade lattice, wind,
  shading), `/Users/eddie/Documents/wanderlight/src/post/film.js` (PostProcessing, bloom, grade).
- **Commit:** `git add <your files> && git commit -m "<lane>: <what>" -- <your files>`. Retry after
  3 s on `index.lock`. Commit the first working step early, then as each piece lands.

## Lanes — one owner per file, nobody touches main.js

### Lane field — `src/field.js` (Opus)
Terrain + grass + wildflowers + sea.
- Terrain mesh ~800 × 800 m from one JS height function; publish it as `ctx.heightAt`. Rolling ±3 m
  near the origin; crest ~25 m around z = −200; cliff drop to a sea plane at y = −40 beyond it.
- GPU grass: instanced tapered blades whose identity is hashed from the world cell, on a lattice
  that follows the camera (wanderlight pattern). Dense near (≥150k blades), thinning with distance,
  fade by ~80 m; terrain colour carries the meadow beyond. Wind: travelling gusts in TSL. Blades
  bend away from `ctx.heroPos` within ~0.8 m.
- Wildflowers: white / orange-red / yellow heads on a few percent of blades or a separate layer.
- Probe: `window.__probes.field = () => ({ blades, h0: heightAt(0,0), crest: heightAt(0,-200), sea: heightAt(0,-320) })`.
- **CHECK:** `node tools/shot.mjs shots/field-default.png "" 3000` → no `field:` error; probes
  `blades ≥ 150000`, `crest − h0 ≥ 15`, `sea ≤ −30`. Picture: dense tall grass fills the lower
  half, flower dots visible, no bare ground patches near the camera. Two captures 1 s apart differ
  in blade sway (wind moves).

### Lane sky — `src/sky.js`, `src/post.js` (Opus)
Sky, fog, light, shadow, lens.
- Sky dome/background: pale grey-white, soft warm glow toward `ctx.sunDir`, horizon = `ctx.fogColor`.
- Fog matching the Look distances (exponential or height fog). Hemisphere + sun light; the sun
  casts a soft shadow whose camera follows `ctx.heroPos` (small frustum, ~40 m).
- `post.js`: `createPost(ctx)` → `{ render() }` with THREE.PostProcessing: subtle bloom, vignette,
  grain, tone/grade. Must fall back to `renderer.render` if a node fails.
- Probe: `window.__probes.sky = () => ({ fog: scene.fog?.type, shadow: sun.castShadow })`.
- **CHECK:** `node tools/shot.mjs shots/sky-default.png "" 3000` → no `sky:`/`post:` error.
  Picture: no hard ground/sky line, distant land fades to haze, sky brightest low toward the sun,
  bloom visible but soft, vignette darkens the corners slightly.

### Lane hero — `src/hero.js` (Sonnet)
`public/models/hero.glb` (the Drifter: 1.80 m, 51 clips incl. `Idle`, `Walk`, `Run`, `Sprint`,
`Jump`; clips are in place — no root motion).
- AnimationMixer with 0.25 s crossfades. Third-person camera behind and above; mouse/touch drag
  orbits (pitch clamped), camera never dips under `heightAt + 0.4`.
- WASD/arrows move relative to the camera; Shift runs (`Run`, ~5 m/s), default `Walk` (~1.6 m/s);
  Space jumps (simple gravity, `Jump` clip). The body turns smoothly toward travel. Feet on
  `heightAt`. Write `ctx.heroPos` every frame. Hero casts shadow.
- `?auto=walk` / `?auto=run` hold the same input flags W / Shift+W set (same code path), for proof.
- Probe: `window.__probes.hero = () => ({ clip, x, z, feetGap: y - heightAt(x,z) })`.
- **CHECK:** `node tools/shot.mjs shots/hero-walk.png "auto=walk" 4000` → `clip: "Walk"`,
  `|feetGap| < 0.05`, distance from origin ≥ 4 m; `"auto=run"` → `clip: "Run"`. Picture: the hero
  seen from BEHIND (back to camera), mid-stride, feet on the ground, lower-middle of frame.

### Lane dragon — `src/dragon.js` (Sonnet)
`public/models/dragon.glb` (winter dragon, ~7 m wingspan as shipped, clips incl. `fly`, `hover`;
head at +Z).
- Scale to ~16–20 m wingspan. Fly a smooth looping path (circle/figure-eight, radius 50–90 m)
  around the meadow ahead of the start, 20–45 m above `heightAt`, nose along the path tangent,
  banking into turns. Loop `fly`; occasionally `hover` is fine.
- `?dragon=near` parks it in clear view about 30 m in front of the start camera for proof.
- Probe: `window.__probes.dragon = () => ({ clip, alt: y - heightAt(x,z), speed })`.
- **CHECK:** `node tools/shot.mjs shots/dragon-near.png "dragon=near" 3000` → no `dragon:`
  error, `clip: "fly"`, `alt ≥ 15`, `speed > 4`. Picture: the dragon large in frame, wings spread,
  textured (not grey/black), facing along its travel direction.

## Review (Opus, never the builder)

Mechanical first: the lane's commit exists and touches only its files; the reviewer re-runs the
CHECK itself into `shots/judge-<lane>-r<round>-*.png`; the probe numbers meet the CHECK. Then the
eye: open the fresh shots next to the reference images and answer the CHECK's picture lines
yes/no. Pass only if every line passes. Errors attributed to another lane's module are not this
lane's fault. Failed review → back to the same lane with the findings; after the third failed
review the orchestrator takes the lane over.

## Board

| lane | owner | status |
|---|---|---|
| scaffold (main, shot tool, plan) | orchestrator | ✅ |
| field | Opus builder | queued |
| sky + post | Opus builder | queued |
| hero | Sonnet builder | queued |
| dragon | Sonnet builder | queued |
| integration + final look | orchestrator + Opus reviewer | waiting |

Not in this pass: touch controls on phones, a quality switch for weak devices, Higgsfield models.
