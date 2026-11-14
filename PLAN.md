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

> **Phases 1–5 only.** Every Phase 6 lane follows the Phase 6 look at the end of this file (`refs/world/mix-day.png`
> is the master picture); where the two disagree, Phase 6 wins.

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
- WASD/arrows move relative to the camera; Shift runs (`Run`, 6 m/s — hero-motion cut the sprint stride for it), default `Walk` (~1.6 m/s);
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

### Lanes weapon-<id> — one Sonnet builder per weapon (Phase 5b)
Each lane owns exactly `tools/weapons/<id>.py` and its output `public/models/weapons/<id>.glb` (+ `shots/weapon-<id>*.png`).
Brief: WEAPONS.md → "How to build each weapon" and your entry; copy the pattern of `tools/props/sword.py` (run Blender
unsandboxed: `blender -b -P tools/weapons/<id>.py -- public/models/weapons`). Commit the first working mesh at once.
- **CHECK (all weapon lanes):** the script prints total length, grip→tip, carrier length and triangle count, and they
  match the entry's build note (±10 %) and the limits (weapon ≤ 4,000 tris, carrier ≤ 2,000); the glb has nodes
  `weapon` and `carrier`; a Blender render `shots/weapon-<id>.png` shows it beside `public/models/sword.glb` with the
  same camera — LOOK: it reads as the entry's look (silhouette, materials, palette), the right size next to the sword.

### Lane weapon-lanternstring
Your entry is WEAPONS.md "## 2. Lanternstring". Files: `tools/weapons/lanternstring.py` → `public/models/weapons/lanternstring.glb`. CHECK above.

### Lane weapon-reedholt-leister
Your entry is WEAPONS.md "## 3. Reedholt Leister". Files: `tools/weapons/reedholt-leister.py` → `public/models/weapons/reedholt-leister.glb`. CHECK above.

### Lane weapon-tidebell-maul
Your entry is WEAPONS.md "## 4. Tidebell Maul". Files: `tools/weapons/tidebell-maul.py` → `public/models/weapons/tidebell-maul.glb`. CHECK above.

### Lane weapon-wreckers-axe
Your entry is WEAPONS.md "## 5. Wrecker's Axe". Files: `tools/weapons/wreckers-axe.py` → `public/models/weapons/wreckers-axe.glb`. CHECK above.

### Lane weapon-windgap-warden
Your entry is WEAPONS.md "## 6. Windgap Warden". Files: `tools/weapons/windgap-warden.py` → `public/models/weapons/windgap-warden.glb`. CHECK above.

### Lane weapon-ribfire-staff
Your entry is WEAPONS.md "## 7. Ribfire Staff". Files: `tools/weapons/ribfire-staff.py` → `public/models/weapons/ribfire-staff.glb`. CHECK above.

### Lanes rig-<id> — one Opus rigger per monster (Phase 4c)
Each lane owns `art/bestiary/<id>/` (except `concept.png`, `hunyuan.glb`) and `public/models/bestiary/<id>.glb`. The
mesh `art/bestiary/<id>/hunyuan.glb` is already paid for — never call Higgsfield. Rigging runs on the Mac Studio
through `tools/bestiary/studio-rig.sh` (run it with dangerouslyDisableSandbox: true; several lanes may run at once).
Your entry is `BESTIARY.md` → your monster (look, body plan, clips). Eddie's rules: golems and big creatures have LONG
arms; the hero's and troll's lessons — joints go where the body BENDS, checked by eye on the textured skeleton.
1. `tools/bestiary/studio-rig.sh <id> rig` → open `art/bestiary/<id>/skeleton.png` (2/5 scale of the Studio render)
   and `markers.png`. The command prints `SCALE {W,H,S,cx,cz}`: a pixel (px, py) in skeleton.png is world
   x = (px·2.5 − W/2)·S/W + cx, z = cz − (py·2.5 − H/2)·S/W (metres, the mesh is 1.80 m tall, x across, z up).
2. Write `art/bestiary/<id>/markers-fixed.json` with every joint the auto pass got wrong — `lshoulder`/`rshoulder`
   (where the arm meets the torso, on the arm's centre line — never up in a shoulder hump, hull, cap or moss),
   `lelbow`/`relbow`, `lwrist`/`rwrist` (where the hand starts), `groin` (between the legs), `lknee`/`rknee`, `chin`
   (under the jaw) — each `[x, z]`. Rerun `rig art/bestiary/<id>/markers-fixed.json` until every joint sits on a
   bend. A worked example: `art/troll/rig/troll-markers-fixed.json` and `art/troll/rig/troll.skeleton.png`.
3. `tools/bestiary/studio-rig.sh <id> clips "Idle" … (your entry's clips, Idle first, only clips that exist in the
   hero's 51) [-- pose offsets]` → open `art/bestiary/<id>/idle.png` (front + side). If the hanging arms sink into
   the body, or the head tips up, add offsets (`leftUpperArm=Y,-20 rightUpperArm=Y,20 neck=X,10 head=X,10`, see
   `tools/monster/pose_offset.py`; the troll needed 28°) and rerun clips.
4. Commit `art/bestiary/<id>/{markers-fixed.json,skeleton.png,markers.png,idle.png}` and
   `public/models/bestiary/<id>.glb` (only your files).
- **CHECK:** skeleton.png — every joint on a bend (reviewer looks, joint by joint); idle.png — arms hang clear of the
  body at full length, head looks ahead, feet flat; the glb lists exactly the entry's available clips; ≤ 8 MB.

## Phase 6 — Asterholm made mesmerizing (Eddie 2026-11-12: "redesign the world, keep the creatures, beautiful and mesmerizing")

**Status: concepts drawn, waiting for Eddie's go on the look.** Spend: 11 credits (4 concepts); everything below is
code and Blender, free. Creatures, hero, pet, dragon, weapons, the map and its eight lands all stay.

**The picture is the spec — open all four:** `refs/world/day.png` (meadow, golden afternoon), `refs/world/night.png`
(same view at night), `refs/world/ring-night.png` (the Old Ring at night), `refs/world/island.png` (the whole island).
The game will match their mood, palette and parts, not their painted detail.

**The world rule, so the glow is physics and not decoration:** Asterholm's plants drink sunlight by day and give it
back at night; pressure wakes them, so a footstep sends a ring of light through the grass. Skystone floats; the springs
on its islands pour off the edges as waterfalls that turn to mist before they land.

**Goal check:** `node tools/shot.mjs shots/world-day.png "tod=day" 6000` and the same with `tod=night` exit 0 with
`errors []`, fps ≥ 50, `node tools/controls-check.mjs` 7/7, and the two shots read like `refs/world/day.png` and
`refs/world/night.png`: jade grass with gold tips; giant bell flowers and spiral ferns; colossal pale trees with
curtains of vines; floating islands with waterfalls; at night glowing grass tips, flowers and vines, the light ring at
the hero's feet, drifting seed lights, stars and aurora.

**Contract change (main.js, orchestrator):** `ctx.tod` 0..1 time of day and `ctx.night` 0..1 glow amount (writer: sky;
`?tod=day|dusk|night` pins it, default a 6-minute day); `ctx.sunDir` and `ctx.fogColor` become live (writer: sky).
main loads `flora`, `landmarks`, `water`, `skyisles`, `motes`, `birds` after `ring`.

**Order:** sky, field, flora models, skyisles, motes and world-doc start together (no shared files). flora-place
starts when the three flora models pass. ring-glow starts when the monster and combat lanes pass (they read the ring).
Last: a day→night walk clip (`auto=walk&tod=cycle`), final review, show Eddie.

**Eddie, later the same hour: "make it a mixture of the world I showed you and the Pandora feel" — and "we should
add towns, and castles, and cities".** So the day leans to the reference videos (crisp stylized 3D, dense saturated
yellow-green grass full of small flowers, the rock island with puff trees over mirror water, birds, depth of field)
and the night leans to the glow (grass, flowers and vines light up, seed lights, aurora). The scale and wonder are
shared: giant vine trees, bell flowers, spiral ferns, floating islands with waterfalls. **The mixed day frame is the
master picture:** `refs/world/mix-day.png` (except its castle, which is too white and spired: the castle follows
`mix-settlements.png`); towns, castle and city: `refs/world/mix-settlements.png`.
Settlements follow the Sanctuary lesson (`~/.claude/projects/-Users-eddie/memory/sanctuary-castles-villages.md`):
castles HUGE and mostly grey stone, every wall reads as STACKED stone (never plaster), not Disney; warm windows at
night, chimney smoke; they emerge from the haze. Read-only code to borrow from:
`~/PROJECTS CODING/sanctuary-world` → `settlements.ts` (masonry shader, window glow, clearance).

**Where they stand (fixed here so no lane waits on another):** Castle Crestwatch on the cliff headland at
(−122, −390) on its own chalk headland, seen ahead-left from the start; the town of Springwell at (−75, 500) at the foot of the Holloway; the
harbour city Asterhaven at (−1500, 650) where the Spill meets the sea, glimpsed far off from the meadow's rise;
Reedholt stays the stilt village on Mirrormere; the Windgap Gate stays a ruined fortress.

**Waves, because the desk ran at load 60 on 18 cores when this was written:** wave A now — `sky6`, the three
`flora-*` models, `town-kit`, `castle-kit`, `world-doc` (mostly Blender, one browser lane). Wave B when the monster,
combat and rig fleets finish — `field6`, `landmarks`, `water`, `skyisles`, `motes`, `birds`, `settlements`; then
`flora-place` and `ring-glow`. Wave C — `dragon-ride`, then the day→night walk clip and the final review.

**Contract rows added (main.js):** `tod`, `night` (writer: sky); `sunDir`, `fogColor` now live (writer: sky);
`keepClear` — an append-only list of `{x, z, r}` circles that ring, landmarks, settlements and water push at create,
so flora never grows through a wall, a stone or the lake. Load order: field, ring, landmarks, settlements, water,
flora, skyisles, sky, hero, springs, vfx, monster, combat, pet, dragon, birds, motes; stubs exist for each new one.

### Lane town-kit — `tools/world/town_kit.py` → `public/models/world/town-kit.glb` (Opus)
One glb, one named node per piece: `cottage_s`, `cottage_l`, `house`, `market`, `church` (nave + belfry), `well`,
`lantern`, `bridge` (one stone arch). Walls of visible stacked stone (geometry courses or a baked masonry texture, not
flat plaster); roofs red clay and slate; timber trim. Window panes carry a glow mask (vertex colour alpha 1) so one
material lights them gold at night. True scale: a cottage door 2.0 m.
- **CHECK:** the script prints each piece's size and triangles (each ≤ 3k, whole kit ≤ 25k); a Blender render of the
  kit beside the hero glb, by day and with the window mask lit, reads like the town in `mix-settlements.png`.

### Lane castle-kit — `tools/world/castle_kit.py` → `public/models/world/castle-kit.glb` (Opus)
Pieces: `wall` (10 m segment, crenellated, walkway), `tower_round` (conical slate roof), `tower_square`, `gatehouse`
(arched gate, portcullis), `keep` (40–60 m, battlements, corner turrets, spire), `banner`. Mostly grey stacked stone,
few colours. Window glow mask as in town-kit.
- **CHECK:** sizes and triangles printed (whole kit ≤ 40k); a render of a test castle (keep + 4 towers + walls +
  gate) beside the hero reads HUGE and stone like the castle in `mix-settlements.png`, not Disney.

### Lane settlements — `src/settlements.js` (Opus, wave B, after town-kit and castle-kit pass)
Assemble from the kits: Springwell (12–20 houses, church, well, lanterns, a bridge over the stream), Castle
Crestwatch (keep, curtain wall, 6–8 towers, gatehouse, a road down to the meadow), Asterhaven as a far city (a walled
hill of a few hundred merged houses climbing to a palace, a harbour) — far detail only, it is seen across the
island. Haze-matched materials so they emerge from the fog; windows glow by `ctx.night`; chimney smoke; push
`ctx.keepClear`; everything on `heightAt`.
- **CHECK:** default view at `tod=day` shows Crestwatch ahead-left like `mix-day.png`; `tod=night` shows lit
  windows; a fieldcam at Springwell reads like `mix-settlements.png`; fps ≥ 50; probe: settlements 3, max
  |base − heightAt| ≤ 0.1 m.

**From Eddie's two reference videos (watched 2026-11-12; frames in `refs/video/*-sheet.jpg`, local only — someone
else's footage, kept out of the public repo; posts instagram.com/reel/Dfg82wLNHmw and /DfmTQFqBYRQ):** the grey haze
in our old spec was one moment of the meadow clip, not the look. Within seconds the fog thins and shows the world:
- a towering rock island beside the meadow, crowned with round, cloud-puff trees and a house, with a big pale egg stone;
- mirror-still water at its foot with clean reflections, and small glowing lanterns on the shore;
- dense yellow-green grass full of orange, red and yellow flowers; flocks of birds; soft depth of field and bloom;
- a giant carved stone face on a clifftop over the sea;
- the dragon is ridden: the hero climbs on and flies over the island, coast and houses.
These join the Phase 6 look: the fog comes and goes, the landmarks are what it reveals.

### Lane landmarks — `tools/world/rockisle.py`, `tools/world/stoneface.py` → `public/models/world/*.glb`, `src/landmarks.js` (Opus)
One towering rock island 80–120 m tall near the start (round puff trees, a cottage, the egg stone), and the carved
stone face on the cliff crest (the Crest Stone). Both glow-veined at night like the ring stones.
- **CHECK:** default view (`tod=day`) shows the rock island the way `refs/video/meadow-walk-sheet.jpg` frames 3–8 do;
  `tod=night` shows its glow; fps ≥ 50; base sits on `heightAt` (≤ 0.05 m).

### Lane water — `src/water.js` (Opus)
A still lake at the rock island's foot with real reflections (planar or screen-space), lanterns' light doubled in it.
- **CHECK:** the reflection of the rock island reads in a `tod=day` shot like the reference frames 6–8; fps ≥ 50.

### Lane birds — `src/birds.js` (Sonnet)
Two or three flocks (instanced, flapping), wheeling over the meadow by day; at night they roost and the motes take over.
- **CHECK:** probe flocks ≥ 2 by day; birds visible in a `tod=day` shot; fps ≥ 50.

### Lane dragon-ride — `src/dragon.js`, `src/ride.js` (Opus, after Phase 6 passes)
Walk to the dragon when it lands, press E to climb on, fly with the same keys, E to land. As in the dragon clip.
The free-flying dragon and the ridden one both keep clear of solid things: the rock island (`ctx.landmarks.rockisle`,
already skirted by the figure-eight), grove trees (`ctx.flora.trees` {x, z, r, top}) and Crestwatch's towers
(`ctx.settlements`). Probe the closest approach to each along the path, as `dragon.isleGap` does.
- **CHECK:** `auto=ride` clip: hero mounts, flies a loop over the rock island and lake, lands; controls-check 7/7.

### Lane sky6 — `src/sky.js`, `src/post.js` (Opus)
Day–night cycle driving `ctx.tod`, `ctx.night`, `ctx.sunDir`, `ctx.fogColor`, sun and moon light. Sky dome: warm
pastel clouds and sun shafts by day (`day.png`), deep indigo with stars and a slow green–violet aurora by night
(`night.png`). Bloom tuned so only glowing things bloom at night; nothing neon by day.
- **CHECK:** shots at `tod=day`, `tod=dusk`, `tod=night` exit 0, errors [], fps ≥ 50; side by side with `day.png` and
  `night.png` the sky, light and haze colours match; the horizon has no hard line.

### Lane field6 — `src/field.js` (Opus)
Grass in jade and teal with pale gold tips (day), tips glowing cyan–teal by `ctx.night`; the footstep light ring: each
step of `ctx.heroPos` starts a ring that spreads ~3 m and fades over ~2 s, brighter at night. Small pale star flowers
replace the dot flowers. Keep `heightAt`, `windAt` and the ring hook unchanged.
- **CHECK:** `tod=day` and `tod=night` shots match the grass in `day.png` / `night.png`; `auto=walk&tod=night` shows
  rings behind the walking hero; controls-check 7/7; fps ≥ 50.

### Lanes flora-<id> — one Sonnet builder per Blender model (`tools/flora/<id>.py` → `public/models/flora/<id>.glb`)
`bellflower` (2–4 m stem bending over, 3–6 drooping bells, petals lilac and peach, inner glow mask), `fern` (1–2 m
spiral fronds, violet vein glow mask), `vinetree` (25–40 m pale buttressed trunk, broad canopy, 30+ hanging vine
strands, vine glow mask). Glow mask = vertex colour alpha (1 glows), so one material drives day and night.
### Lane flora-bellflower
### Lane flora-fern
### Lane flora-vinetree
- **CHECK (each):** the script prints height and triangles (≤ 6k bellflower, ≤ 4k fern, ≤ 40k vinetree); a Blender
  render beside the hero glb at true scale reads like the matching plant in `day.png`, and a dark render with the glow
  mask lit reads like `night.png`.

### Lane flora-place — `src/flora.js` (Opus, after the three flora lanes pass)
Instance the three models: bell flowers and ferns in drifts round the meadow edges (none on the path or in the Old
Ring), vine trees in groves on the rises, as in `day.png`. Sway with `ctx.windAt`; glow by `ctx.night`. Light the glow mask as alpha² (fern.glb: thin vein triangles, rachis and
coils 1, coil leaflets 0.85 fading out, leaf blades 0), so veins stay thin lines on dark leaves; `tools/flora/beside_hero.py` renders a model that way.
- **CHECK:** `tod=day` and `tod=night` default views read like `day.png` / `night.png`; fps ≥ 50; no plant floats or
  sinks (probe: max |base − heightAt| ≤ 0.05 m).

### Lane skyisles — `src/skyisles.js`, `tools/flora/skyisle.py` (Opus)
5–9 floating islands of pale stone, 40–200 m across, 150–600 m up and 0.5–3 km out, with trees on top, roots hanging
below, waterfalls off their edges (scrolling, fading to mist), and a slow bob. Glowing vines at night.
- **CHECK:** default and `tod=night` shots show islands where `day.png` / `night.png` have them; waterfalls move in
  `auto=walk` clip frames; fps ≥ 50.

### Lane motes — `src/motes.js` (Sonnet)
Drifting seed lights (instanced, additive): a few pale pollen specks by day, hundreds of slow glowing seeds at night,
densest near the hero, rising gently.
- **CHECK:** `tod=night` shot shows seed lights like `night.png`; probe count ≥ 300 at night, ≤ 80 by day; fps ≥ 50.

### Lane ring-glow — `src/ring.js` (Opus, after monster and combat pass)
The Old Ring in `ring-night.png`: cyan-green glowing moss veins on the stones, gold light from the barrow door, teal
mist at night; by day the same moss is soft green.
- **CHECK:** `ring=1&tod=night` and `fight=1&tod=night` read like `ring-night.png`; the ring probe still reads stones
  11, fallen 3; the monster and combat probes are unchanged.

### Lane world-doc — `WORLD.md` (Opus)
Rewrite each land's Look and palette in the new language (`island.png`, `mix-day.png`, `mix-settlements.png`); keep
geography, connections, the travel loop and every creature's home. Add Castle Crestwatch, the town of Springwell
(grown from a village) and the city of Asterhaven at the positions above, each with its people, landmark and why it
stands there.
- **CHECK:** every land keeps its position, landmark and connection; every BESTIARY creature's land still exists;
  each Look names its day and night palette and what glows.

## Phase 4 follow-ups (2026-11-13, from the ten rig reviews)

All ten creatures are rigged and passed review (`public/models/bestiary/*.glb`), but none has been seen inside the
game yet. The reviewers flagged the same gaps, and these lanes close them. Later, once `springs` passes: creature
spring chains (Gapshrike wings, bell clapper, cloaks), the props (Tolling Warden's anchor, Stiltstalker's reed
spear, built from code), and a Kimodo `ram_charge` for the Scarhorn.

### Lane bestiary — `src/bestiary.js` (Sonnet)
`?bestiary=1` is a gallery inside the real world (`main.js` already loads it last, so its camera update wins
over the hero's; without the param `createBestiary` returns null and costs nothing). Load every
`public/models/bestiary/*.glb` (ten models, all 1.80 m tall as rigged). Scale each one to its size in
`BESTIARY.md` (e.g. Marrowkeeper 3.5 m, so ×1.94). Stand each on its own low stone plinth at `ctx.heightAt`, in a
gentle arc on clear meadow (push `ctx.keepClear`). Each creature slowly turns and cycles its clips: Idle, then
each other clip in turn, back to Idle. Give each a small name + land label. The camera dollies slowly along the
arc. `&focus=<id>` frames one creature large, facing the camera, which the reviewer uses. Never ground by
hacking positions per frame: report feet instead (probe below), and the orchestrator fixes any model that floats
or sinks.
- **CHECK:** `node tools/shot.mjs shots/bestiary.png "bestiary=1" 12000` → no `bestiary:` error, and
  `__probes.bestiary()` lists all 10 ids loaded. Each entry has its height in metres (within 10% of `BESTIARY.md`),
  the clip playing, and `footY` (lowest skinned vertex minus plinth top, in cm, in Idle).
  Picture: every creature stands on its plinth at its own size, lit like the world, labels legible.
  `node tools/shot.mjs shots/bestiary-golem.png "bestiary=1&focus=rime-warden" 9000` and `…&focus=gapshrike…`
  show one creature filling the frame. Two shots of one focus taken 4 s apart show different poses (it animates).

### Lane rig-weights-fix — `art/bestiary/{wreckback,driftwight,stiltstalker}/` (not concept.png, hunyuan.glb) and their three `public/models/bestiary/<id>.glb` (Opus)
`wreckback/wreck.py:121`, `driftwight/nets.py:33` and `stiltstalker/fix_rig.py:110` each remove vertex groups
inside `for g in list(v.groups)`. That skips every other group, so old weights survive the rewrite: 32% on the
Gapshrike, hips on the Rime Warden. First collect `[g.group for g in v.groups]`, then remove. The fixed versions
are in `gapshrike/wings.py` and `rime-warden/warden.py`.
For each creature: fix the loop and print how many vertices are still in the groups meant to be cleared (before
and after the fix). Rebuild its glb through its own build path on the Studio, keeping the same clips and offsets,
re-render `idle.png`, and run the extremes pose test (`tools/rig/compare.py` rig vs itself, house-autorig skill).
- **CHECK:** the leftover count after the fix is 0 for all three, printed in the report. `idle.png` for each still
  passes its rig-lane CHECK (arms clear, head ahead, feet flat). The pose sheet shows no vertices pulled toward a
  wrong bone (no spikes or ribbons). The glb clip list is unchanged, and each glb is ≤ 8 MB.

### Lane rig-bell-damp — `art/bestiary/tolling-warden/` (not concept.png, hunyuan.glb) and `public/models/bestiary/tolling-warden.glb` (Opus)
In Hit (Front) and Stagger the chest throws back about 62° at the peak, so the bell tips behind the shoulders and
the creature looks headless for a few frames. Damp the spine, chest and upperChest pitch in those two clips the
way `bell.py` already damps head and neck. The hit should still read as a hit (keep about 40%).
- **CHECK:** printed worst bell tilt off rest per clip: Hit and Stagger ≤ 35°, every other clip unchanged ±2°.
  A render of the Hit and Stagger peak frames (front and side) shows the bell above the shoulders. The glb holds
  the same 9 clips and is ≤ 8 MB.

### Lane vfx2 — `src/vfx.js` (Sonnet, after wave A frees the desk)
From the monster and combat reviews:
- Warm the trail material at load the way the particle layers already are. The first cut froze the desk for about 4 s, and combat.js carries a `shortcut:` that the orchestrator removes afterwards.
- `flash()` turns the troll and its club pure white for about 0.3 s, so it reads as a white cut-out. Make it a warm additive tint at most 35% and 0.12 s long.
- `trail(obj, {base, tip, life})` gets a per-trail `life` (default 0.2, combat will pass 0.35).
- The trail's bright tip band draws after the flash (renderOrder) so arcs still read on a hit.
- **CHECK:** `node tools/clip.mjs shots/vfx2-fight.mp4 "auto=fight" 20` shows no `vfx:` error. In the frames at a hit flash, the troll keeps its texture under a warm glow (never a flat white shape). The first cut has no stall: the probe `__probes.vfx().maxFrameMs` stays under 120 after load.

### Lane hero2 — `src/hero.js` (Opus, after wave A frees the desk)
- `?auto=` holds W only for `walk` and `run`.
- `heroAct.play(name, {hold: true})` keeps the last pose until `stop()`, so Death can lie still.
- The camera never enters solid things: it raycasts from the hero's head to the camera against meshes with `userData.cameraBlock = true` and pulls in to the hit point minus 0.3 m. Ring stones, landmarks and buildings set that flag (Contract).
- **CHECK:** `auto=fight` with the camera driven behind a standing stone (`&camtest=1`, a scripted orbit through the barrow-door stones): no frame shows the camera inside stone. `node tools/controls-check.mjs` 7/7. After `heroAct.play('Death (Collapse)', {hold:true})` the pose is unchanged 2 s later (probe).

Contract additions (2026-11-13): `combat` also writes `ctx.heroPos` (rolls, lunges, knock-backs, respawn) — hero.js reads the
same Vector3. Any mesh the camera must not pass through sets `userData.cameraBlock = true`.

## Wave B follow-ups (2026-11-13, from the field6 / landmarks / water / skyisles reviews)

Contract rows added: `landmarks` (writer: landmarks) = `{ rockisle {x, z, y, r, top}, egg {x, z, y}, crestStone {x, z, y} }`;
`pond` (writer: water) = `{ x, z, level, inside(x, z) }`, inside > 0 means water there. The dragon's figure-eight now
slides sideways off the rock island and skirts its apron (orchestrator, src/dragon.js; probe `dragon.isleGap` ≥ 8 m).
Skyisles keeps the islands in the open sky left of the rock (option a); no move needed.

### Lane field-carve — `src/field.js` (Opus)
Today the field has ONE ground patch (ring owns it), so water cannot lower the ground and paints its surface over the
turf and grass instead (`shortcut:` in water.js), and it finds the grass by guessing its `aOffset` attribute.
- `ctx.addGroundPatch(x0, z0, sizeM)` → `{ tex, size }`, same texel layout as `ctx.groundPatch` (metres added, grass
  height ×, bare 0..1, light ×). Callable after field's create (water loads later). Up to 4 patches; terrain, grass,
  flowers and `heightAt` all read every patch. `ctx.groundPatch` keeps working unchanged for ring.
- Publish `ctx.grass = { blades, flowers }` (the two meshes).
- **CHECK:** `?carvetest=1` makes field itself add a 20 m patch at (0, −30) holding −2 m and grass ×0 inside r 6:
  probe `field.patches` = 2 and `heightAt(0,-30)` 2 m below its value without carvetest; the shot shows a bare dip with
  no blades; the ring's trampled circle still shows (`auto=fight`); `controls-check` 7/7; fps ≥ 50.

### Lane water2 — `src/water.js` (Opus, after field-carve passes)
- Carve the pond with `ctx.addGroundPatch` (bed −1.2 m, grass ×0 under water, damp bank) and draw the water as a plain
  depth-tested surface; remove the paint-over and the `aOffset` search (use `ctx.grass` for the mirror pass).
- **CHECK:** `shots/water2-shore-{day,night}.png` from the shore camera: the bank meets the water without a painted
  edge, no upside-down grass in the reflection, the lanterns doubled; the hero walking in (`auto=walk` into the pond)
  sinks to the knees at most; errors []; fps ≥ 50.

## Wave B follow-ups, part 2 (2026-11-13, from the settlements / flora-place / hero2 reviews)
Contract rows added: `settlements` also replaces `heightAt` (adds Crestwatch's headland and Asterhaven's hill, as ring
adds its bowl) — modules that load earlier and cached the old function miss the headland, harmless while they are far
from it. `flora.trees` (writer: flora) = [{x, z, r, top}] for flyers and the camera.
Queued after field-carve passes, `src/field.js` (Opus): publish `ctx.ground` = the terrain extents plus settlements'
far tile, so flora drops the GROUND rects it copies by hand (`shortcut:` in flora.js).
Queued with dragon-ride, `src/hero.js` (Opus): the camera treats grove trunks (`ctx.flora.trees`) as blockers.

### Lane hero3 — `src/hero.js` (Opus)
The camera treats grove trunks as solid: build one blocker per tree in `ctx.flora.trees` (a capsule or hull round the
trunk from the ground to the first boughs, radius from `r`), added to the same ray test as `userData.cameraBlock`
meshes. No per-frame cost growth: test only trees within 30 m of the hero.
- **CHECK:** `?fieldcam` is not enough — add `&camtest=tree`: the hero walks a circle round the nearest grove trunk with
  the camera swinging behind it; probe `hero.cam.inTrunk` = 0 over 20 s (and > 0 with the blockers switched off, to
  prove it can see). `controls-check` 7/7; fps ≥ 50 in a grove.

### Lane field-ground — `src/field.js` (Opus)
- Publish `ctx.ground` = the walkable ground's extents: the 800 m terrain square plus settlements' far tile (read the
  tile from `ctx.settlements` if it publishes one, else take a list other modules push to: `ctx.ground.rects.push(...)`),
  so flora can drop the rects it copies by hand.
- Ground patches: raise the slot count from 4 to 6 (ring + settlements + water2 + carvetest already fill 4) and make a
  full table log one clear error instead of throwing mid-create.
- **CHECK:** probe `field.ground` lists the rects; `?carvetest=1` with water2's patch present → `field.patches` counts every
  caller with no error; `controls-check` 7/7; default-view fps ≥ 50.

## Wave B follow-ups, part 3 (2026-11-13, from the water2 / field-ground reviews, both passed round 1)
Contract rows added: `water` also replaces `heightAt` — inside the pond the hero stands on a wading floor 0.45 m under
the surface, not the 1.2 m bed (modules loaded before water never wade; harmless). `ctx.pond` (writer: water) is the
meadow's own hollow flooded to -0.5 m (~2390 m², x -13..53, z -76..-28, deepest (14.4, -52.2)), no longer an ellipse:
read its shape only through `ctx.pond.inside(x, z)`. `ctx.ground.rects` (writers: field = the 800 m terrain, settlements
= its far tile [-760, 640, 400, 1500]) is what flora places on; ground patch slots are 6, 3 used by default (ring,
settlements, water). Shore camera for water shots: `fieldcam=6,1.8,-25,-10,0,-62`.

## Wave D (2026-11-13) — flight view, sound, a new dragon
Eddie, on the dragon: "The dragon we have now, the wings are attached to hind legs, they supposed to attached to
shoulders" and "Maybe you should make a new detailed dragon from Higgsfield". On sound: "Have you done sound design
yet?" — not yet; it joins here. The flight view comes from the dragon-ride review: from the saddle the land is a flat
grey plane with hard white shapes.

### Lane flight-view — `src/field.js`, `src/sky.js` (Opus)
From the dragon's back (80–130 m up) the world must read as a living land running to the horizon, as beautiful from
the air as it is on foot (refs/world/mix-day.png, refs/video/dragon-ride-sheet.jpg). Today, from 120 m
(`shots/flight-before-{n,s,w}.png`, from `fieldcam=0,120,100,0,0,-300`, `0,120,-150,0,0,200`, `150,120,0,-300,0,0`):
1. The meadow is a flat murky olive plane: grass blades only draw near the camera and the terrain under them is one dull
   colour. Give the ground the grass field's own colour and variation at distance (lit and shaded slopes, colour drift,
   flower drifts as colour, darker hollows) so the far meadow reads as grass, not felt.
2. The world shows its end: the 800 m terrain square's straight edge (south view), white void beyond it (west view), and
   the north sea mist becomes one white plane over the whole north from above. No end may show: land, coast or sea that
   dissolves into the haze in every direction, and the north mist stays a soft veil seen from above.
3. The haze milks the whole frame at altitude; distance should soften, not wash out.
Keep every ground-level view as it is (default view, the water and settlements shots), and fps ≥ 50 in flight.
- **CHECK:** `shots/flight-view-{n,s,w,e}-{day,dusk}.png` from the three cameras above plus `-150,120,0,300,0,0`
  (`&tod=day` / `&tod=dusk`): below the horizon no near-white region (min channel > 215) larger than 2 % of the frame,
  and no straight-edged end of the land; the land's mean HSV saturation below the horizon at least 1.5× the same
  camera's `flight-before` shot (print both). `auto=ride` frames from 30–45 s show the land clearly. The default view's
  day numbers (`tod=day`, sky6 metrics) stay within ±5 of HEAD's. errors []; fps ≥ 50 in all.

### Lane sound — `src/audio.js` (now a STUB, already loaded last by main.js), `public/audio/`, `tools/audio/` (Opus)
Sound design for the whole world, made locally and free (the `audio-sfx` and `audio-music-bgm` skills: AudioGen /
Stable Audio Open / MusicGen on this Mac — no paid audio service). Original sounds and music only.
- Beds: a day bed (wind through grass, distant birds) and a night bed (crickets, soft chimes as the flowers glow),
  crossfading with `ctx.night`; water lapping near `ctx.pond`; a town murmur and a far bell near the settlements.
- Hero: footsteps on the walk/run cadence (grass; stone on roads and in the ring), wading splashes in the pond, jump and
  land, sword swing and hit; the troll's grunt and impact.
- Dragon: wingbeats on the flap's downstroke, a roar when called and on landing, wind rush in flight rising with speed.
- Music: a gentle day theme and a night theme (instrumental, dreamy, mesmerizing), crossfading with `ctx.night`, under
  everything.
- Three.js `AudioListener` on the camera, `PositionalAudio` for world sources. Audio starts on the first key or click
  (browsers require it); `M` mutes. Read state from `ctx` and the modules' probes only; anything you need another module
  to publish goes in needsWiring. Files small (all of `public/audio/` < 10 MB, AAC `.m4a` or `.mp3` so Safari plays them);
  `public/audio/CREDITS.md` names the model and prompt behind every file.
- **CHECK:** `?audio=log` keeps a timeline of triggered sounds in the probe `audio.log`. `auto=walk` (20 s): footsteps
  within ±80 ms of the walk clip's foot contacts, day bed playing. `auto=ride`: wingbeats on downstrokes, roar on call
  and landing, wind rising in flight. `tod=night`: night bed and theme. A `tools/audio/capture.mjs` recording of
  `auto=walk` and `auto=ride` muxed onto their `clip.mjs` videos → `shots/sound-walk.mp4`, `shots/sound-ride.mp4`;
  integrated loudness −20 to −14 LUFS, peaks < −1 dBFS (print `ffmpeg ebur128`). controls-check 7/7; errors []; fps ≥ 50.

### Lane dragon2 — `art/dragon2/`, `public/models/dragon.glb` (Opus)
A new detailed dragon replaces the winter dragon, on the SAME 50-bone rig so every clip keeps working (fly, hover,
idle, idle_fire, idle_look, idle_roar, idle_shake, idle_wings, land, takeoff, walk) and `src/dragon.js` / `src/ride.js`
need no change. Concept (original design, Eddie has seen it): `art/dragon2/concept-b.png`; the same dragon without wings:
`art/dragon2/concept-b-wingless.png`; its Hunyuan3D v3 mesh: `art/dragon2/hunyuan.glb` (textured, ~300k faces). The old
rig's rest pose, which the concept was drawn on: `art/dragon2/rest-{quarter,side,front}.png` (`rest_render.py`).
1. **Wings at the shoulders.** Today `wing-{l,r}-shoulder` sit over the hind legs (head y −0.62, parented to `spine`,
   while `fore-l-upper` is at y −1.22 under `chest`). Move each wing root just behind and above the front-leg shoulder,
   on the wing-root mounds of the new body (behind the saddle), parented to `chest`; the clips' rotations carry over.
2. **Body.** Align the Hunyuan mesh to the rest pose (head on `head`, feet on the foot bones, tail along `tail1..7`,
   same overall size: the old body is 1.19 × 4.33 × 2.51 m), cut it to a web budget (≤ 60k triangles, one ≤ 2k base
   colour texture, glb ≤ 8 MB), and skin it: start from the old body's weights (nearest surface), then fix what the new
   shape needs; the saddle rides the chest/spine rigidly. Keep the glowing cyan spots as an emissive mask that lights at
   night as the world's plants do (`ctx.night`; alpha² convention in PLAN flora notes) — if that needs a dragon.js hook, it
   is needsWiring.
3. **Wings.** Build new wing geometry on the moved bones: bone struts along each finger and a membrane between them,
   textured from the concept (dusk violet near the body to ember orange at the trailing edge, fine veins, light shows
   through it with the sun behind), skinned to their own bones only.
4. Keep the empty `rider-seat` (ride.js reads it by name), now on the new saddle, parented as before.
- **CHECK:** `art/dragon2/turn-{quarter,side,front}.png` (rest pose, beside the concept) and
  `art/dragon2/clips-sheet.png` (every clip at its extremes, two angles): the wing roots sit over the front legs, nothing
  tears (print the worst edge stretch per clip, ≤ 6×), the saddle stays on the back. In game: `?dragon=near` by day and
  night, `auto=ride` (the probes and log as in Lane dragon-ride: over isle and lake, isleGap/treeGap ≥ 0, the hero on the
  saddle). controls-check 7/7, errors [], fps ≥ 50. The old model is kept as `public/models/dragon-winter.glb` for A/B.

### Lane hero-motion — `public/models/hero.glb`, `tools/hero/`, `art/hero/motion/`, `src/hero.js` (Opus)
Eddie: "I want the hero arms to hang down more naturally, and when he runs I want a strong run like a person sprinting
arms position look off now. The arms swing when run is off, you should get the animation of a professional runner and
copy that." Research, target numbers and what is wrong today: `art/hero/motion/RESEARCH.md`; reference picture:
`art/hero/motion/ref-sprint-stand-walk.png`; today's clips: `art/hero/motion/before-{idle,walk,run,sprint}.png`.
- New **Idle** (arms hanging at the sides, hands by the outer thighs), **Walk** (natural opposite arm swing) and **Run**
  (the Shift run becomes a strong sprint: arms pumping from the shoulder, elbows near 90°, front hand to chin height, back
  hand past the hip) — and **Sprint** the same as Run. Copy the real kinematics in RESEARCH.md: keep or replace the legs
  and hips as needed, but the arms must land in those ranges. Any source is fine (re-key the arms on the donor clips,
  Kimodo `~/ai-stack/kimodo/` with a better prompt or fixed retarget, or author curves from the numbers) as long as it is
  local and free. Bake into `hero.glb` with every other clip (51 animations), the spring bones and the skin untouched;
  make the build reproducible from `tools/hero/` (a script beside `build.sh`).
- Match stride to ground speed (hero.js: walk 1.6 m/s, run 5 m/s; the run may rise to 7 m/s if a sprint needs it — say
  so) so the planted foot does not skate. Loops seamless.
- Eddie, looking again: "When idling the arms should come down naturally, right now his elbows are out and they're
  awkward. When walk, arm swing naturally, when run(sprint) strong motion like real runner. When standing still it looks
  like he tilt back too much. His feet are not flat to the ground, they tilt up too, maybe that's why. The running
  sprinting, head wrong, shoulders wrong." So also: **feet flat** — in Idle and in every stance phase the sole lies on
  the ground (toe and heel within 2 cm of the same height; find why they tilt up — rig rest, retarget or clip — and fix
  it at the cause, in every clip it touches); **standing upright** — no backward lean (from the side, ear–shoulder–hip–
  ankle within ±4° of vertical, weight over mid-foot); **sprint head and shoulders** — head in line with the spine,
  eyes forward, chin level; shoulders low and relaxed (not shrugged or rounded), turning with the arm pump 15° at most.
- Known: the donor clips' own stride speeds (`~/Documents/Character-Library/2026-10-25-world-of-dreams-drifter/
  MOTION-REPORT.md`) are Walk 0.92, Jog 3.26, Run 7.07, Sprint 8.34 m/s, against the game's 1.6 walk and 5 run — a
  likely source of foot slide; measure it.
- Eddie: "When we do it right, save the positions and animations for future use." Once he approves, the orchestrator
  files the clips, the poses and the build script in `~/Documents/Character-Library/motion/` (not this lane's job; keep
  the build reproducible so it can be). Eddie: "Get rid of the wrong ones" — read as: the old awkward Idle, Walk, Run
  and Sprint are REPLACED, not kept beside the new ones — in `hero.glb` and in the library's drifter donor
  (`rigged/drifter-v2-textured-51clips.glb`, which future characters copy from); the old files go to `~/.Trash/`.
- **CHECK:** `art/hero/motion/after-{idle,walk,run}.png` with `tools/hero/clipsheet.py` (same cameras as before), and
  printed per clip: shoulder sagittal range, elbow min/max, hand height at the front of the swing vs chin, hand behind
  the hip at the back, arm–leg phase (opposite), idle hand-to-thigh gap and elbow angle — each inside RESEARCH.md's
  ranges. In game: `clip.mjs` of `auto=run` and `auto=walk` seen from the side (`shots/hero-motion-{run,walk}.mp4`),
  planted-foot slide < 0.3 m/s; printed foot pitch (sole vs ground) in idle and at mid-stance, and the idle side lean; controls-check 7/7; errors []; fps ≥ 50; the probe `hero.strapSkin` > 0 (springs kept).

## Phase 4 finish — every creature and prop built and rigged (Eddie 2026-11-14: "work on getting all 3D assets and rig them")

Missing on 2026-11-14: the Rootbinder's mesh (its first paid mesh was lost), Old Glim and the Ribmites (built from code
by their rig routes), the Tolling Warden's anchor and the Stiltstalker's reed spear (props from code), and the
Scarhorn's `ram_charge` (a free Kimodo clip). Five lanes, one owner per file. The orchestrator wires the finished files
into `src/bestiary.js` (ROSTER, props in hands) afterwards and reviews the gallery. No lane spends credits.
Use Ponytail: shortest working code, reuse before writing, mark corners `shortcut:` (Ponytail 5). Before reading
code, read graphify-out/GRAPH_REPORT.md; if missing run `graphify update .`.

### Lane rig-rootbinder — `art/bestiary/rootbinder/` (not concept.png) and `public/models/bestiary/rootbinder.glb` (Opus)
Mesh: Hunyuan3D v3 job `c1cd9fd2-f643-4738-a366-6234fdd0fc07` (already paid; see art/bestiary/SOURCES.md). If
`art/bestiary/rootbinder/hunyuan.glb` is not there yet, poll that job with the Higgsfield `jobs_wait` tool (free) and
download its GLB to that path; never start a new generation. Then the "Lanes rig-<id>" steps 1–4 above, with BESTIARY.md
"## 5. The Rootbinder": long arms that reach the ground, legs two twisted trunks, a root crown (rigid on the head for
now; its spring chains come with the springs follow-up). Clips: Idle, Walk, Summon, Slash (Horizontal), Stab, Block,
Hit (Front), Stagger, Death (Collapse) (only those in the hero's 51).
- **CHECK:** the rig-<id> CHECK (skeleton.png every joint on a bend; idle.png arms clear at full length, head ahead,
  feet flat; the glb lists exactly the available clips; ≤ 8 MB), and `art/bestiary/rootbinder/clips.png` shows one
  key frame of each clip with no torn or spiked bark.

### Lane glim — `tools/bestiary/old_glim.py`, `art/bestiary/old-glim/` (not concept.png), `public/models/bestiary/old-glim.glb` (Opus)
BESTIARY.md "## 6. Old Glim", rig route C. Build her in Blender from code (no paid mesh): one eel 16 m long and 1.3 m
thick at real scale, blunt broad head, jutting lower jaw with fine needle teeth, a ribbon fin along back and belly;
milky turquoise, darker teal back, pale reed-gold belly; a row of lamp-orange spots down each flank in their own
material named `glim-lamps` (so the game can make them glow at night). A 24-bone spine chain from code plus a jaw bone,
smooth weights along the chain. Bake two loops for the gallery: `Swim` (a travelling S-wave, head steady) and `Coil`
(neck drawn into an S, ready to lunge); the fight states stay procedural in game code later.
- **CHECK:** `art/bestiary/old-glim/sheet.png` (side, top, front at rest, beside concept.png) reads as the concept;
  `art/bestiary/old-glim/swim.png` (8 frames of Swim, top view) shows a smooth wave with no kinks, pinches or
  stretched faces at the strongest bend; the glb holds the mesh, 25 bones and the clips `Swim`, `Coil`; ≤ 8 MB.

### Lane ribmites — `tools/bestiary/ribmite.py`, `art/bestiary/ribmite-swarm/` (not concept.png), `public/models/bestiary/ribmite.glb` (Opus)
BESTIARY.md "## 11. Ribmites", rig route I: one rigid mesh from code, no bones. A flat fist-sized beetle 0.3 m long,
long wedge head, six spindly legs; rust-red shell with ochre stripes, bone-white legs and jaws, a polished shell
(low roughness) that catches the sky. Tag each leg's vertices with a float attribute `leg` (1–6, 0 for the body) and
`legT` (0 at the hip → 1 at the foot) so the game can wiggle them in TSL.
- **CHECK:** `art/bestiary/ribmite-swarm/sheet.png` (top, side, three-quarter beside concept.png) reads as the
  concept; a render of 40 copies scattered on sand reads as a rust-red carpet; ≤ 1,500 triangles; the attributes
  `leg` and `legT` exist (printed per leg: vertex counts, legT range 0–1); glb ≤ 300 KB.

### Lane props — `tools/bestiary/anchor.py`, `tools/bestiary/reed_spear.py`, `public/models/props/` (Sonnet)
Built in Blender from code like `tools/monster/club.py`. The Tolling Warden's ship's anchor (BESTIARY "## 8"):
black-green iron, stock, shank, two flukes, ring; a rust chain of 8 links as an 8-bone skinned chain from the ring,
the last link with an empty `grip` where the fist holds it. Sized for the rigged 1.8 m warden (it reads huge in its
fist). The Stiltstalker's reed spear (BESTIARY "## 7"): woven reed shaft twice the creature's height (3.6 m for the
1.8 m rig), a bone or flint head, reed-gold bindings; an empty `grip` one third down the shaft.
- **CHECK:** `art/bestiary/props.png` renders each prop front and side with a 1.8 m figure for scale; anchor.glb has 8
  chain bones and a `grip` empty, reed-spear.glb a `grip` empty; each ≤ 1 MB.

### Lane scarhorn-charge — `art/bestiary/scarhorn/` (not concept.png, hunyuan.glb) and `public/models/bestiary/scarhorn.glb` (Opus)
The `ram_charge` clip (BESTIARY "## 9"): generate it with Kimodo on this Mac (skill kimodo-motion,
`~/ai-stack/kimodo/kimodo-generate.sh`, steps 100) from "a person lowers their head and charges forward hunched over,
then skids to a stop", retarget it onto the Scarhorn rig the way its other clips were built (art/bestiary/scarhorn/
build.sh), and add it as `Kimodo: ram_charge` to scarhorn.glb, keeping every existing clip unchanged.
- **CHECK:** the glb's clip list = the old list + `Kimodo: ram_charge`; `art/bestiary/scarhorn/charge.png` (6 frames,
  side view) shows the head lowering with horns forward, a fast forward charge and a skid stop; feet do not slide
  backwards or sink; ≤ 8 MB.

**Phase 4 finish — status 2026-11-14:** all five lanes PASSED independent review r1; the gallery PASSED r4 (the Tolling
Warden's anchor took four rounds; report `shots/review-phase4.md`). Open, not blocking: in Throw the anchor swings 1–1.5 m
above the fist; its stock stands out of the warden's back while he lies fallen and leans on his shin when he stands; a
fluke crosses his upper arm mid-throw; anchor `grip` empty hangs off the rig, not the last link; Old Glim 1.12 m wide
(spec 1.3) and her head lands on neighbours in Coil; Rootbinder's hands stop at mid-shin in Idle; the Marrowkeeper and
Rime Warden plinths nearly touch.

## Wave E (2026-11-14) — backlog polish (Eddie: "keep orchestrating without asking me")

Three lanes, one owner per file, no credits. Each commits only its own file (`git commit --only <file>`), first working
step first. Independent review after each; three failed reviews and the orchestrator takes it.
Use Ponytail: shortest working code, reuse before writing, mark corners `shortcut:` (Ponytail 5). Before reading
code, read graphify-out/GRAPH_REPORT.md; if missing run `graphify update .`.

### Lane field-keepclear — `src/field.js` (Sonnet)
Grass grows through the gallery plinths: field.js ignores `ctx.keepClear` (a list of `{x, z, r}` pushed by
`src/bestiary.js` before/while the field exists). Blades and flowers inside any keepClear circle must not draw.
- **CHECK:** `node tools/shot.mjs shots/e-keepclear.png "bestiary=1&still=1" 8000` and
  `shots/e-keepclear-warden.png "bestiary=1&focus=tolling-warden&clip=Idle" 8000`: no blade or flower stands on or
  pokes through any plinth top; `shots/e-keepclear-walk.png "auto=walk" 5000` looks the same as before (no bare
  circles without the gallery); fps within 5% of before.

### Lane bestiary-polish — `src/bestiary.js` (Sonnet)
From `shots/review-phase4.md` rounds 1 and 4: (a) in `Throw` the anchor swings 1–1.5 m above a fist held at the hip;
(b) Old Glim's head lands on the creatures in front of her in `Coil` — lay her further back or lower so she never
overlaps them in the whole-gallery view; (c) the Marrowkeeper and Rime Warden plinths nearly touch — space the arc so
every pair of plinths shows clear grass between them.
- **CHECK:** `bestiary=1&focus=tolling-warden&clip=Throw` at 5000, 10500, 11000, 12000 ms: the anchor is never above
  the fist unless the chain is taut below a fist raised above the shoulder; `bestiary=1&still=1` at 15000 ms: clear
  grass between every two plinths, Old Glim touches no creature in Swim or Coil (`&focus=old-glim&clip=Coil`); the
  Idle and Death behaviour that passed round 4 is unchanged (same shots as round 4, Idle 4000/15000, cycle 26300/27000).

### Lane sky-rim — `src/sky.js` (Sonnet)
A 1-px bright rim line shows under the left cloud bank (the `clouds()` rim term).
- **CHECK:** `shots/e-sky-before.png` and `shots/e-sky-after.png` from `node tools/shot.mjs <out> "auto=walk" 5000`,
  plus 4x crops of the left cloud bank's underside: the line is in the before crop and gone in the after crop; the
  clouds are otherwise unchanged.

**Lane sky-rim — parked 2026-11-14:** the rim line could not be reproduced (views tried: `auto=walk`, default,
`auto=walk&tod=0.5`; crops in `shots/e-sky-*.png`); nothing changed. Not tried: dusk/sunset, where the rim term is
strongest. The only thin bright lines seen are seams on the top-left sky island (skyisles geometry, not `clouds()`).

## Wave F (2026-11-14) — ambient life (Eddie: "ambients and little creatures and minor things that adds to the overall visual aesthetic"; "for now lets keep it as an \"experience\"")

**Decision (Eddie 2026-11-14): Dragon Meadow is an EXPERIENCE for now, not a game.** No goals, scores or fail states;
new work serves the walk, the ride and the look. Combat and the bestiary stay as they are.
Four lanes, each owns ONE new file (stubs exist, `src/main.js` already loads them; lanes never edit main.js). No
credits: everything from code (TSL, instanced quads or tiny meshes), like `src/motes.js` and `src/birds.js`. Master
look: `refs/world/mix-day.png` by day, `refs/world/night.png` by night; world facts in `WORLD.md`. Each lane must
cost < 3% fps (measured with its `?<name>=off` switch against on, alternated three times), respect `ctx.keepClear`,
`ctx.heightAt`, `ctx.night`, `ctx.windAt`, and stay quiet enough that the meadow still reads calm: life you notice on
the second look. Two lanes run at a time (the desk is loaded); independent review after each.
Use Ponytail: shortest working code, reuse before writing, mark corners `shortcut:` (Ponytail 5). Before reading
code, read graphify-out/GRAPH_REPORT.md; if missing run `graphify update .`.

### Lane flutter — `src/flutter.js` (Sonnet)
Butterflies by day: 20–40 within ~30 m of the hero, in the reference's flower colours (lilac, peach, pale gold),
wandering between flowers with a real flutter (two wings flapping, a bobbing path, brief rests on bellflowers and
grass tips), thinning out at dusk. Fireflies from dusk: firefly gold, slow drifting blinks low over the grass,
densest near trees and water; they must not look like the motes (which rise and are pale): fireflies blink and wander.
- **CHECK:** `shots/f-flutter-day.png` (`auto=walk`, 6000 ms) shows several butterflies readable as butterflies at
  hero distance; `shots/f-flutter-close.png` (a view that puts one within 3 m) shows two wings and colour;
  `shots/f-flutter-night.png` (`auto=walk&tod=night`) shows gold fireflies distinct from the motes; two shots 300 ms
  apart show wings in different poses; `?flutter=off` removes them; fps cost < 3%.

### Lane pondlife — `src/pondlife.js` (Sonnet)
At the water (`src/water.js` publishes where it is): dragonflies darting and hovering over the surface by day (thin
body, four glassy wings that catch the sun), expanding ripple rings where fish rise (and now and then a small fish
jumps), frogs on the bank that hop into the water with a ring when the hero comes within ~5 m. At night the
dragonflies are gone and the rings keep on, faintly lit.
- **CHECK:** `shots/f-pond-day.png` from the bank shows dragonflies and at least one ripple ring; a shot pair shows a
  frog on the bank then gone with a ring after the hero walks up (use the game's existing auto/camera params or a
  `?pondlife=demo` that stages it); `shots/f-pond-night.png` shows rings only; `?pondlife=off` removes them; fps
  cost < 3%.

### Lane critters — `src/critters.js` (Sonnet, after flutter or pondlife frees a slot)
Small meadow animals from code, 6–10 near the hero: a round long-eared hopper in the pet's family of shapes (see
`src/pet.js`; not a copy of the pet) that grazes, sits up to look, and bolts in hops into the long grass when the
hero comes within ~6 m, reappearing elsewhere later. Never on plinths, water, paths or inside settlements.
- **CHECK:** `shots/f-critters.png` shows two or three grazing at 8–20 m; a shot pair shows one bolting as the hero
  nears; none floats or sinks (feet on `ctx.heightAt`); `?critters=off` removes them; fps cost < 3%.

### Lane drift — `src/drift.js` (Sonnet, after flutter or pondlife frees a slot)
Things on the wind, driven by `ctx.windAt`: petals shed from bellflowers (their own lilac and peach), a few leaves
under the trees, dandelion-like seed tufts lifting from the grass in gusts. Sparse by default, a visible flurry when a
gust passes. Not the motes (those glow and rise); these tumble, catch the light and land.
- **CHECK:** `shots/f-drift-day.png` shows petals near bellflowers and leaves near trees, tumbling (two shots 300 ms
  apart differ in rotation); they follow the grass's wind direction; `?drift=off` removes them; fps cost < 3%.

**Wave E — status 2026-11-14:** field-keepclear PASSED r2, bestiary-polish PASSED r3 (report `shots/review-waveE.md`); pushed up to bb5f430. Open lows: at Throw 5000 a stock end reads as a short post; a thin anchor part leans between the legs at Throw 12000 / cycle 26300; chain loops heap at the fist; Old Glim shows only head and neck in the default view.

**Wave F — status 2026-11-14:** pondlife PASSED r2 (543bfa9; report `shots/review-waveF-pondlife.md`). Open: the demo cannot show frog-then-gone in one run (fixed frog site + held walk wanted); frog eyes read as two yellow balls; distant dragonfly wings are flat white. Push waits for the other three lanes (their commits are interleaved on main).

**Wave F — flutter PASSED r4** (after orchestrator takeover; report `shots/review-waveF-flutter.md`). The r4 medium (lens fade) applied as the reviewer specified. Open lows: fireflies near eye height line up along the far shore; flat-open butterflies read as two ovals; no steering round the pet.
