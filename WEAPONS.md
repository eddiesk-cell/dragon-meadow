# Weapons the hero finds (Phase 5a)

Eddie: *"new weapons for main hero, his clothes stay the same for now, but he can find different weapons and use
them and switch them out"*.

Seven weapons, one per land on the travel loop (`WORLD.md`). Wyrmcrown has none: its reward is the dragon. Each
weapon lies just before the monster it answers (`BESTIARY.md`), so picking it up changes the next fight. Together
they cover every weapon family the hero has clips for: sword, bow, spear, hammer, axe, greatsword and staff.

## At a glance

Damage is against the Barrow Troll. It has 200 hp, and a hit of 25 or more (or 60 damage in a row) staggers it
(`src/monster.js`). A broadsword light hit (10) is the baseline. Trail colours are sRGB hex. Like the existing gold
trail, they are pushed to about ×1.8 HDR so they bloom.

| # | id | family | found in | reach | speed | light | heavy | defence | what it changes | trail |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `broadsword` | sword | Dragon Meadow (start) | 1.2 m | medium | 10·10·14 | 26 | guard 70 %, parry | the all-rounder: parry, then a riposte | gold `#FF9E38` (exists) |
| 2 | `lanternstring` | bow | Lanternwood | 40 m | slow | 6 | 20 full draw, ×2 on the head | backstep, kick | fights from range; the only weapon that hits fliers | firefly `#C8FF5A` |
| 3 | `reedholt-leister` | spear | Mirrormere | 2.4 m | fast pokes | 8, ×1.3 at the tines | 22 lunge over 5–8 m | block 40 % | spacing: a sweet spot at the tip; the lunge crosses gaps | lake turquoise `#72D9D1` |
| 4 | `tidebell-maul` | hammer | Bellholm | 1.5 m | very slow | 26, always staggers | 18 in a 4 m ring | guard 90 % | trades hits: cannot be flinched mid-swing; breaks stone and armour | verdigris `#4CC79E` |
| 5 | `wreckers-axe` | axe | The Undercliff | 0.9 m | fast | 11·11 | 30, thrown up to 18 m | hook-parry | throw it, fight bare-handed, fetch it back; hooks guards open | sea foam `#C4F2FF` |
| 6 | `windgap-warden` | greatsword | The Greyspine | 1.9 m, 200° arc | slow | 18·28 | 28 → 50 charged | guard 100 % from the front | hits every foe in the arc; a wall to stand behind | snow `#B4D8FF` |
| 7 | `ribfire-staff` | staff | The Redwaste | 25 m bolt, 8 m jet | medium | 8 a bolt | 12 a second, jet | salt ward (stops one hit) | 6 ember charges to manage; reveals, burns, roots | ember `#FF7A30` |

## Rules every weapon shares

- **Same buttons, different moves.** `J` or a left click is the light attack. Hold `J` for 0.35 s or more for the
  heavy. `K` is guard (or the weapon's own defence), `L` rolls, `R` draws and sheathes. These are Lane combat's keys.
  New keys: `E` picks up a weapon within 1.5 m and equips it at once; `Q` cycles through carried weapons; `1`–`7`
  pick one directly. You can switch whenever you are not attacking: the old weapon vanishes from his back and the
  new one appears there, in 0.3 s with no clip.
- **One weapon shows at a time, in one carry slot on his back.** This is the strap from `src/hero.js`: the carrier's
  top is pinned to the chest, its end to the hips, and contact keeps it on the skin. Each weapon brings its own
  carrier (scabbard, sling, quiver), so the slot holds anything. The hips are not used because both hips carry
  pouches and the hem is spring cloth; a hip weapon would fight both.
- **Clip speed** is heroAct.play's `speed`. **Hit windows** are in clip-time seconds (real time = clip time ÷
  speed). They were measured from the hero's own hand and foot motion in `public/models/hero.glb` (see Clip truth).
- **Heavier weapons slow him while drawn:** maul −15 %, greatsword −20 %, the rest 0 %. His walk and run clips
  stay the same; only the speed changes.
- **The hit effect** for every weapon is `ctx.vfx.sparks` in its trail colour plus `flash`. Heavy hits add `shake`
  and `hitstop`. Each entry lists only what it adds to this.

## Clip truth (measured 2026-11-12; read this before building 5c)

I loaded `public/models/hero.glb` in Blender and sampled the hands, feet and head on every frame of every weapon
clip. I also compared each clip's bone rotations at the same fraction of the way through.

- **`Hammer Overhead Smash` (4.71 s), `Greatsword Swing` (3.25 s) and `AoE Ground Slam` (2.00 s) are the same
  motion as `Slash (Diagonal)` (1.42 s), just slowed down.** Their upper-arm rotations agree to within 0.0015 at
  every matching fraction. In all four, the hands stay between 1.0 and 1.3 m (chest height): nothing goes overhead,
  and nothing reaches the ground.
- **`Bow Draw & Release`, `Throw`, `Pistol Aim & Fire`, `Cast (One-Handed)`, `Conjure`, `Summon` and
  `Channel (Two-Handed)` are cuts of one shared gesture:** the arms open wide at shoulder height (hands 1.25 m
  apart), then both hands push forward together (the left hand ends 0.59 m in front of the hips). It reads well as
  spellcasting. It does not read as a bow draw (no side-on stance, no hand at the jaw) or as a throw (the arm never
  goes behind the head).
- **These clips are distinct and fine as they are:** `Slash (Horizontal)` (a real sweep across the body; the head
  turns with it), `Stab` (a real lunge: the head drops 0.55 m forward and the lead hand reaches 0.81 m),
  `Parry`, `Block`, `Greatsword Guard`, `Greatsword Idle`, `Dash`, `Roll`, `Backstep`, `Kick (Front)` (the
  left foot goes 0.92 m forward at 1.18 m high) and `Punch (Cross)` (the right fist goes 0.46 m forward).

Every weapon below works today with the clips as they are. But until four clips are remade, the hammer, the
greatsword's heavy attack and the bow will look like the sword's diagonal chop or the spell gesture.
**Remake these clips for free, locally, with the `kimodo-motion` skill. Keep the names so no code changes:**

| clip | motion to ask for | done when (measured the same way as above) |
|---|---|---|
| `Slash (Diagonal)` | two-handed sword cut from above the right shoulder down across to the left hip | right hand starts ≥ 1.6 m high and ends ≤ 0.9 m high, on his left side |
| `Hammer Overhead Smash` | lift a heavy two-handed hammer high over the head and smash it straight down in front | hands go ≥ 2.0 m high, then ≤ 0.6 m high and ≥ 0.4 m in front |
| `Greatsword Swing` | huge two-handed sweep from right to left, the whole body turning | hands travel ≥ 2.5 m along a level arc 1.0–1.3 m high |
| `AoE Ground Slam` | small hop, then both hands drive the weapon into the ground | hands reach ≤ 0.4 m high; hips dip ≥ 0.3 m |
| `Bow Draw & Release` | side-on archer: left arm straight at the target, right hand draws to the jaw, holds, lets go | left hand ≥ 0.55 m from its shoulder; right hand within 0.15 m of the jaw for ≥ 0.4 s |
| `Throw` | one-arm overhand throw with the right hand, from behind the head forward | right hand ≥ 1.8 m high behind the head, then ≥ 0.5 m in front |

Each remade clip must also differ from `Slash (Diagonal)`: the rotation comparison above has to fail. Until they are
remade, use the hit windows measured below.

**Measured hit windows (clip time):**

| clip | window |
|---|---|
| `Slash (Diagonal)` | 0.25–0.60 s (hands fastest at 0.29–0.33 s; the twist peaks at 0.54 s) |
| `Slash (Horizontal)` | 0.45–0.95 s (lead hand fastest at 0.71 s) |
| `Stab` | 0.10–0.40 s (full reach at 0.25 s) |
| `Parry` | 0.12–0.40 s |
| `Kick (Front)` | 0.50–0.75 s (left foot furthest at 0.67 s) |
| `Punch (Cross)` | 0.18–0.38 s (right fist furthest at 0.29 s) |
| `Greatsword Swing`, `Hammer Overhead Smash`, `AoE Ground Slam`, until remade | 18–42 % of the clip, which is 0.57–1.37 s, 0.83–1.99 s and 0.35–0.85 s |
| the release in the shared gesture: when to spawn the arrow, bolt or axe | `Bow Draw & Release` 1.17 s · `Throw` 0.60 s · `Cast (One-Handed)` 0.79 s · `Summon` 1.75 s · `Conjure` 1.83 s (its end) · `Channel (Two-Handed)` arms open 0.25–1.75 s (loop this span) |

## How to build each weapon (5b: `tools/weapons/<id>.py`)

- **Follow `tools/props/sword.py`.** Build along +Z in Blender and call `upright()`; the glTF exporter turns +Z into
  +Y. Work in metres. Use flat or vertex colours from the land's palette in `WORLD.md`, roughness ≥ 0.3, nothing
  neon. Keep the weapon ≤ 4,000 triangles and the carrier ≤ 2,000.
- **Write one file, `public/models/weapons/<id>.glb`, with two nodes** (`club.glb` also uses named nodes):
  - `weapon`: the origin is the centre of the right-hand grip, where `rightHand` closes (for the bow, the left-hand
    grip). The business end points +Y, and the cutting edge or striking face points +X. That is the sword's frame,
    so combat's `GRIP_Q` fits every weapon.
  - `carrier`: the origin is its top anchor (pinned to the chest), and its body runs down −Y toward its end anchor
    (pinned to the hips), like `scabbard.glb`. The strap aims every carrier from the chest anchor toward the hips
    anchor, which is about 0.97 m along his back. A longer weapon runs past the hips anchor, as noted per entry.
  - The weapon's **seat** on the carrier is its origin's position in carrier coordinates, plus which way it points.
- **Print** the total length, grip to tip, carrier top to end, and the triangle count. The 5b CHECK picture is a
  render of each weapon beside the existing sword with the same camera.
- **Anything that sticks out past the hips anchor** must pass `tools/strap-check.mjs` and a walk clip: the stride
  must not kick it.

Every entry below has the same fields: id, family, where found, look, how it is carried, moveset, what plays
differently, trail and hit, which monsters it answers, and the build note.
