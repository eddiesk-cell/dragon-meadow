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
| `heroRig` `{model, sheath, sword, rightHand}` | hero, at create | springs (cloth bones), combat (draw: re-attach `sword` to `rightHand`) | absent if the sword props failed to load |
| `windAt(x, z, t)` → Vector2 | field, at create | springs | the grass's own wind, for cloth |
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

### Lane pet — `src/pet.js` (Opus)
Eddie: *"he should have a little helper, like a fluffy pet that follow him around"*. Original design,
made in code (no model, no credits).
- A small round fluffy companion (~0.4 m body): cream fur with a soft peach blush, two long floppy
  leaf-shaped ears, a puff of a tail, big dark glossy eyes with a highlight, tiny paws. Real fluff:
  TSL shell fur (≥16 shells) with strands that sway with motion and wind — never a smooth ball.
- The grass is waist-high, so it **floats**: hovers 0.9–1.5 m above `heightAt`, bobbing gently, near
  the hero's right shoulder, 1–2.5 m away. Follows `ctx.heroPos` with a soft spring lag; faces where
  it is going; when the hero stops it turns to look at him, ears twitch; now and then it drifts off to
  sniff a flower and comes back. Squash-and-stretch on quick moves. Hops up when the hero jumps.
- `?pet=close` points the camera at it from ~1.2 m for proof.
- Probe: `window.__probes.pet = () => ({ dist, hover, speed })` — dist to the hero, height above ground.
- **CHECK:** `node tools/shot.mjs shots/pet-walk.png "auto=walk" 5000` → no `pet:` error,
  `0.8 ≤ dist ≤ 3`, `0.8 ≤ hover ≤ 1.8`. Picture: the pet visible beside the hero above the grass.
  `"pet=close"` picture: fluffy silhouette with visible fur strands, ears, eyes — cute, soft, lit like
  the meadow. `node tools/controls-check.mjs` still 7/7 ok.

### Lane springs — `tools/hero/springs.py`, `src/springs.js`, `tools/hero/build.sh`, and only a `ctx.windAt` export in `src/field.js` (Opus)
Eddie: *"could we put the spring joints for the cloths like his bandana and his clothes? so it's affected
by wind? so it looks more natural?"*. Reference picture: `art/hero/hero-front-nosword.png` (bandana knot at
the back of his head, two long green tails streaming to his left; linen shirt tails and the leather vest's
lower panels hang below the belt to mid-thigh). Rigged mesh: `art/hero/rig/hero-vrm.glb` (VRM bone names:
`hips`, `spine`, `chest`, `upperChest`, `neck`, `head`, `leftUpperLeg`, …; 49k verts, one material).
Skeleton over the body: `art/hero/rig/hero.markers.png`, shoulders fixed by hand in
`art/hero/rig/hero-markers-fixed.json` — do not re-rig.
- `tools/hero/springs.py` (Blender, `blender -b -P tools/hero/springs.py -- in.glb out.glb`, run unsandboxed,
  Blender is `$HOME/.local/homebrew/bin/blender`): adds bone chains named `spring_<part>_<n>`:
  **bandana** — 2 chains (one per tail, 3–4 bones from the knot to the tip) parented to `head`;
  **hem** — at least 4 chains around the body below the belt (front-left, front-right, back-left,
  back-right; 2 bones each, belt → hem) parented to `hips`. Find the cloth vertices by position (print the
  counts it picks so a silent zero shows), weight them along their chain with a smooth falloff from the
  root (the knot and the belt line stay 100 % on `head` / `hips`), keep ≤ 4 normalised influences per
  vertex, and keep the leg weights where the cloth lies on the thigh so the hem follows the legs AND swings.
  Print one line per chain: name, bones, vertex count. A chain with 0 vertices is a failure.
- `tools/hero/build.sh`: run springs.py after `kimodo_glb.py` and retarget the springs file, so
  `public/models/hero.glb` carries the chains plus all 51 clips. Prove retarget keeps the extra bones
  (bone count printed before/after) and the clips still play.
- `src/field.js`: add only `ctx.windAt = (x, z, t) => Vector2` — the same `WIND` direction and travelling
  gust fronts the grass uses (CPU version of the `front`/`ripple`/`gust` lines), so cloth and grass move together.
- `src/springs.js` (`createSprings(ctx)`, loaded by main right after hero; read `ctx.heroRig.model`):
  every `spring_` chain is a damped spring (verlet per bone tip): it inherits the body's motion (inertia —
  tails trail behind when he runs or turns, swing up when he jumps), springs back toward its rest direction,
  feels gravity, drag and `ctx.windAt` at the hero. Collision spheres keep the hem out of the thighs and the
  bandana out of the head. Stable at 20–144 fps (substep), never explodes, no jitter at rest. Frame-rate
  independent. Probe: `window.__probes.springs = () => ({ chains, bones, maxSwingDeg })`.
- **CHECK:** `tools/hero/build.sh art/hero/raw/hero-hunyuan.glb art/hero/rig/hero-markers-fixed.json`
  prints every chain with > 0 vertices and `public/models/hero.glb` has 51 animations (count them).
  `node tools/shot.mjs shots/springs-front.png "fieldcam=0.6,2.5,-3.2,0,2.2,0" 6000` → no `springs:` error,
  `chains ≥ 6`; picture: bandana tails and shirt hem look like his reference, nothing torn or spiked.
  `node tools/clip.mjs shots/springs-idle.mp4 "fieldcam=0.6,2.5,-3.2,0,2.2,0" 8` and
  `node tools/clip.mjs shots/springs-run.mp4 "auto=run" 8` → pull 6 frames from each with ffmpeg and LOOK:
  idle — the tails visibly sway and flutter with the wind, the hem stirs; run — the tails stream behind his
  head and the hem swings with his legs, never through them. `node tools/controls-check.mjs` 7/7 ok.

### Lane slim — `tools/hero/slim.py` (Sonnet)
`public/models/hero.glb` is 28.7 MB, almost all two 4K PNG textures (normal + base colour). A web game hero
should be under 8 MB. Write `python3.12 tools/hero/slim.py <in.glb> <out.glb> [max_px=2048]` (python3.12 is
`$HOME/.local/homebrew/bin/python3.12`, it has Pillow): re-encode every embedded image to ≤ max_px on the long
side as JPEG (quality 88 for colour, 95 for a normal map), rewrite the BIN chunk with every bufferView offset and
length recomputed and 4-byte aligned, update `images[].mimeType`, leave everything else (meshes, skins, 51
animations) byte-identical. Self-check inside the script: the output parses, has the same counts of nodes,
meshes, skins, animations and accessors as the input. Never write into `public/models/` — test on a copy in
`$TMPDIR`; the orchestrator wires it into build.sh.
- **CHECK:** `python3.12 tools/hero/slim.py public/models/hero.glb $TMPDIR/hero-slim.glb` → prints sizes,
  output < 8 MB, 51 animations. Load both files headlessly in Blender (`blender -b`, import glTF, material
  preview or Eevee) and render the same front view of each to `shots/slim-before.png` / `shots/slim-after.png`;
  LOOK: the same character, same colours, no blockiness or seams.

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
| field | Opus builder | ✅ passed review, round 1 |
| sky + post | Opus builder | ✅ passed review, round 1 |
| hero | Sonnet builder | ✅ passed review, round 2 (camera framing) |
| dragon | Sonnet builder | ✅ passed review, round 2 (near view too small) |
| integration + final look | orchestrator + Opus reviewer | fixes in review: #load blocked drag, Space tap missed, movementX 0 on touch |

### Phase 2 — Eddie's new asks (2026-11-12, in his words, in this order)

1. **New hero:** *"a dragonquest hero with a bandana with a large sword on his back, clothing like an
   adventurer, you could use Higgsfield to create him then we could rig it ourself"*. Original design
   (not the Dragon Quest character). Concept `art/hero/hero-front-v1.png` → sword-less turnaround →
   Tripo H3.1 multiview (detailed) → house autorig → Drifter's 51 clips via retarget → `public/models/hero.glb`.
   The sword and scabbard are separate Blender-built props on a back socket, so he can draw the sword.
   Owner: orchestrator (paid credits). Spend so far: 2.75 + 2.75.
2. **World design:** *"We should design the world now, how each land is connected to each other."*
   Draft `WORLD.md` + `art/world-map.svg` for Eddie's taste call. Owner: Opus design lane.
3. **Pet:** see Lane pet.
4. **Monster + fight:** *"a monster so we could do a fight scene, where our hero can pull out his sword
   and fight (full special effects)."* Needs a monster model (paid — needs the cap raised past 40),
   then lanes by file: `src/combat.js` (draw, combo, block, roll), `src/monster.js` (AI, hits, death),
   `src/vfx.js` (sword trails, sparks, slash arcs, hit flash, shake, dust). Bipedal monster so our
   rigger and the Drifter's attack/hit/death clips fit.

Checks that exist now: `tools/shot.mjs` (picture + probes + fps), `tools/controls-check.mjs`
(real keyboard and mouse: walk, run, idle, jump, drag-orbit, camera-relative walk).

Not in this pass: touch walking on phones (drag-to-look works, walking needs a joystick), a quality
switch for weak devices, the sea is hidden by haze from the crest (`refs/ref-dragon.png` wants it
blue), Higgsfield models.

### Phase 3 — the fight (Eddie: *"a monster so we could do a fight scene, where our hero can pull out his sword and fight (full special effects)"*; cap raised to 60 credits: *"yes, raise the cap"*, then to 500: *"if we need to make more assets, please Cap at 500"*)

Design source: `WORLD.md` → "The first monster — the Barrow Troll in the Old Ring". Concept picture:
`art/troll/troll-front.png`. Every lane below reads both.

**Pipeline (each phase's trigger is the one before it landing — armed now):**

| # | phase | trigger | worker | CHECK |
|---|---|---|---|---|
| 0 | troll model: concept → Hunyuan3D → weld/prep → autorig (shoulders checked on the skeleton overlay) → 13 clips → `public/models/troll.glb` | now | orchestrator (paid credits) | 3.0 m tall, clips listed below, skeleton overlay shows joints where the body bends |
| 0 | Lane ring, Lane vfx | now | Opus | their CHECKs |
| 1 | hero action API in `src/hero.js`, `ctx.timeScale` in `src/main.js` | now | orchestrator | controls-check 7/7, strap-check passes |
| 2 | Lane monster | troll.glb landed | Opus | its CHECK |
| 2 | Lane combat | hero API landed | Opus | its CHECK |
| 3 | `?auto=fight` demo clip → final review → Eddie | monster + combat passed | Opus reviewer | the fight reads start to finish in one clip |

**Contract additions (writer → readers):**
- `ctx.heroAct` (hero): `play(clip, {loop, fade, speed, lockMove}) → Promise` (resolves when the clip ends; while
  it plays, locomotion does not override it), `busy()`, `face(x, z)`. Clips are the hero's 51 (see `hero.glb`):
  combat uses `Greatsword Idle`, `Greatsword Guard`, `Slash (Diagonal)`, `Slash (Horizontal)`, `Stab`,
  `Greatsword Swing`, `Roll`, `Backstep`, `Hit (Front)`, `Stagger`, `Death (Collapse)`.
- `ctx.timeScale` (main multiplies every dt by it; vfx owns hitstop).
- `ctx.ring` (ring): `{ center, radius, stones: [{ pos, radius, height, fallen }], barrow }`.
- `ctx.vfx` (vfx): `trail(obj3d, {base, tip}) → {stop()}`, `slash(pos, dir)`, `sparks(pos, normal, n)`,
  `flash(obj3d)`, `shake(amp, secs)`, `dust(pos, size)`, `blast(pos, radius)` (the roar's mist ring),
  `hitstop(ms)`.
- `ctx.monster` (monster): `{ pos, radius, height, hp, maxHp, alive, state, takeHit({ dmg, dir, point }),
  attack: { active, center, radius, dmg } }` — combat reads `attack` to hurt the hero.

### Lane ring — `src/ring.js`, plus only a trampled-grass circle hook in `src/field.js` (Opus)
The Old Ring at (325, 180): a shallow chalk bowl ~60 m across carved into `ctx.heightAt` (wrap the field's
function; blend smoothly at the rim), a grassy barrow mound in the middle with a dark low entrance, eleven
weathered standing stones (≈2.5–4 m, lichen and chalk) on a ring of ~22 m radius — three of them lying fallen
and half-sunk. Stones built in code (displaced, bevelled, never boxes) and lit like the meadow. Grass inside the
ring trampled short (a circle uniform the field's grass reads) so footwork reads. Mist pools in the bowl.
`?ring=1` puts the camera on the rim looking in. Publishes `ctx.ring`. Probe `{ stones, fallen, bowlDepth }`.
- **CHECK:** `node tools/shot.mjs shots/ring-rim.png "ring=1" 6000` → no `ring:` error, stones 11, fallen 3;
  picture: an ancient stone circle in a misty bowl in the same meadow light — reads at a glance, no boxes, no
  floating stones, grass short inside. `node tools/controls-check.mjs` 7/7.

### Lane vfx — `src/vfx.js`, plus only `ctx.timeScale` use for hitstop (Opus)
Full special effects for the fight, all in TSL, pooled (no allocation per hit), each a one-liner for the
callers in the contract: a bright tapering sword trail ribbon that follows a moving blade; slash arcs; sparks
with gravity on stone and steel; a white hit flash on a struck mesh; camera shake; dust puffs that drift with
`ctx.windAt`; the roar's ring of mist blowing outward; hitstop (`ctx.timeScale` dips for a few ms). Bloom
already exists in `post.js` — make the hot parts glow through it. `?vfx=demo` fires every effect in a loop in
front of the camera for proof.
- **CHECK:** `node tools/shot.mjs shots/vfx-demo.png "vfx=demo" 4000` and `node tools/clip.mjs shots/vfx-demo.mp4
  "vfx=demo" 8` → no `vfx:` error, fps within 5 of the plain scene; LOOK at 6 frames: each effect visible,
  readable, game-quality (trail tapers and fades, sparks arc and die, dust drifts, flash is brief).

### Lane monster — `src/monster.js`, `tools/monster/club.py` (Opus)
The Barrow Troll from `WORLD.md`, using `public/models/troll.glb` (rigged at 1.80 m like the hero — scale it ×1.67 to stand 3 m; built by the orchestrator, joints hand-placed in `art/troll/rig/troll-markers-fixed.json`, skeleton picture `art/troll/rig/troll.skeleton.png`; human clips fitted to his body with `tools/monster/pose_offset.py … leftUpperArm=Y,-28 rightUpperArm=Y,28 neck=X,12 head=X,12` so his arms clear his belly and he looks ahead; clips: `Idle`, `Walk`, `Run`,
`Sit` (asleep), `Stand Up`, `Channel (Two-Handed)` (roar), `Hammer Overhead Smash`, `AoE Ground Slam`,
`Punch (Cross)`, `Kick (Front)`, `Hit (Front)`, `Stagger`, `Death (Collapse)`). Club: a standing stone ripped
from the ring, made in Blender from code (`tools/monster/club.py` → `public/models/club.glb`), held in the right
hand. States: asleep in the barrow → wakes when the hero comes within ~25 m (stands, roars: `ctx.vfx.blast`)
→ stalks → telegraphed attacks with clear wind-ups (smash, ground slam with dust ring, punch, kick) whose hit
windows set `ctx.monster.attack` → reacts to hits (flash, stagger on heavy hits) → dies (collapse, mist clears).
Never walks through standing stones. Publishes `ctx.monster`. `?fight=1` starts the hero 12 m from the waking
troll. Probe `{ state, hp, dist }`.
- **CHECK:** `node tools/clip.mjs shots/monster-fight.mp4 "fight=1" 12` → no `monster:` error; 8 frames: it
  wakes, roars, approaches, swings with a readable wind-up, the club stays in its hand, feet on the ground.

### Lane combat — `src/combat.js` (Opus)
The hero draws the sword from his back (`R`, or on first attack): re-attach `ctx.heroRig.sword` to
`rightHand` mid-`Greatsword` draw, back to the sheath on `R` again. Attack `J` or a left click without drag: a
3-hit combo (`Slash (Diagonal)` → `Slash (Horizontal)` → `Stab`), hold for `Greatsword Swing`; block `K`
(`Greatsword Guard`, sparks on a blocked hit); roll `L` (`Roll`, brief invulnerability). Sword hits test the
blade against `ctx.monster` and call `takeHit`, fire `ctx.vfx` (trail on every swing, sparks, flash, hitstop,
shake on heavy hits). Monster hits hurt the hero (hit reaction, stagger, death and respawn at the ring's edge).
A small health bar for each. `?auto=fight` plays a scripted fight end-to-end for the demo clip.
- **CHECK:** `node tools/clip.mjs shots/combat-fight.mp4 "auto=fight" 20` → no `combat:` error; 10 frames: sword
  drawn from the back into the hand, a 3-hit combo with trails, sparks and hit flashes on the troll, a roll
  through an attack, the troll falls. `node tools/controls-check.mjs` 7/7 (walking still works sword drawn).

### Phase 4 — the bestiary (Eddie: *"you could make all the bestiary"*; Higgsfield cap 500, 54.5 spent)

Reading taken: the monsters of every land in `WORLD.md` as rigged, animated models ready for a monster AI,
plus a viewer to see them. Ambient animals (sheep, gulls…) are not in this pass. Creatures are the one asset
kind that goes to Higgsfield (`3d-asset-routing`); ~21.75 credits each (concept 2.75 + Hunyuan3D 19).

| # | phase | trigger | worker | CHECK |
|---|---|---|---|---|
| 4a | `BESTIARY.md` | now | Opus design lane | its CHECK below |
| 4b | concept per creature → `art/bestiary/<id>/concept.png`, contact sheet to Eddie | 4a passed | orchestrator (paid) | each concept matches its entry, true T-pose (bipeds), original |
| 4c | 3D → weld/prep → rig (markers + skeleton overlay checked by eye every time) → clips → slim → `public/models/bestiary/<id>.glb` | each concept | orchestrator (paid, Studio) | pose test clean, clips listed in its entry play |
| 4d | `src/bestiary.js`: `?bestiary=1` gallery — each creature on a plinth, turning, cycling its clips, name + land | first 3 models | Sonnet lane | every model in `public/models/bestiary/` shows, animates, no errors |

### Lane bestiary-design — `BESTIARY.md` (Opus)
Design the bestiary for all nine lands of `WORLD.md` (read it in full; the Barrow Troll and the winter dragon
already exist — list them, do not redesign them). 1–2 original monsters per land, ~12 new in total, each with:
`id`, land, role (roamer / guardian / boss), size in metres, a look paragraph a concept artist could draw from
(silhouette first, then materials and colour — tie it to its land's palette in WORLD.md), what it does in a
fight (2–4 attacks with readable wind-ups), **body plan** and its rig route, clips it uses, and its cost.
**Rig routes, and this decides the design:** our offline rigger is humanoid only (Mixamo skeleton), and the
Drifter's 51 clips (list in `public/models/hero.glb`) are humanoid. So: bipeds (two arms, two legs, any
proportions) are cheap and get those clips — make most of the bestiary bipedal. A non-biped (quadruped, serpent,
flyer, swarm) must name how it gets bones and motion: research Higgsfield's `3d_rigging` / `animation_actions`
(read-only — no paid calls), or a Blender rig from code with procedural motion (serpents and worms: a bone
chain; flyers: wing bones). At most 3 non-bipeds. Original designs only — nothing from an existing game.
- **CHECK:** every land in `WORLD.md` has ≥ 1 entry; every entry has all fields above; bipeds ≥ 75 %; each
  non-biped names a rig route with a source for it; total new cost ≤ 300 credits; `grep -c "^## " BESTIARY.md`
  ≥ 12. Reviewer reads it as a game designer: distinct silhouettes, each fight different, fits its land.

### Phase 5 — weapons the hero finds (Eddie: *"new weapons for main hero, his clothes stay the same for now, but he can find different weapons and use them and switch them out"*)

Weapons are props → built from code in Blender (free). Each weapon type uses a family of the hero's own clips.

| # | phase | trigger | worker | CHECK |
|---|---|---|---|---|
| 5a | `WEAPONS.md` | now | Opus design lane | its CHECK below |
| 5b | `tools/weapons/<id>.py` → `public/models/weapons/<id>.glb` (+ sheath/holster) | 5a passed | Sonnet lanes, one file each | renders match the entry; grip origin, sizes in metres |
| 5c | find + switch: pickups placed in the world, an inventory, switching keys, per-weapon moveset, carry spot and trail colour, in `src/combat.js` + `src/weapons.js` | Lane combat passed + 5b | Opus | demo clip: find a weapon, switch, fight with it |

### Lane weapons-design — `WEAPONS.md` (Opus)
6–8 original weapons for the hero, found across the lands of `WORLD.md` (where each is found and why it is
there). Cover the clip families the hero already has: sword (`Slash (Diagonal)`, `Slash (Horizontal)`, `Stab`),
greatsword (`Greatsword Swing/Guard/Idle`), hammer/axe (`Hammer Overhead Smash`), spear (`Stab`, `Dash`),
bow (`Bow Draw & Release`), staff (`Cast (One-Handed)`, `Conjure`, `Summon`, `Channel (Two-Handed)`). Each entry:
`id`, name, family, where found, look (silhouette, materials, size in metres, how it is carried — back, hip,
shoulder), its moveset from those clips, what makes it play differently (reach, speed, weight, special), its trail
/ hit-effect colour, and a Blender build note (parts, proportions) so a code builder can make it. The starting
sword is entry 1 (it exists: `tools/props/sword.py`).
- **CHECK:** ≥ 6 entries, ≥ 5 families; every clip named exists in the hero's 51; every entry has a build note
  with dimensions; reviewer reads it as a game designer: each weapon changes how the fight plays.

**Clothes (Eddie asked):** outfits can switch the same way weapons do if each outfit is a whole new hero model on
the same skeleton (same markers, same 51 clips — swapping is instant), about 22 credits an outfit. Layered,
mix-and-match clothes need a separate under-body plus garment meshes — a bigger job, later if wanted.
