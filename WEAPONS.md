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
| 2 | `lanternstring` | bow | Lanternwood | 40 m | slow | 6 | 20 full draw, ×2 on the head | backstep, kick | fights from range: reaches what melee cannot (across a spore cloud, a flier the moment it lands) | firefly `#C8FF5A` |
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
  turns with it), `Stab` (a real lunge: the head moves 0.55 m forward and 0.2 m down, and the lead hand reaches 0.81 m),
  `Parry`, `Block`, `Greatsword Guard`, `Greatsword Idle`, `Dash`, `Roll`, `Backstep`, `Kick (Front)` (the
  left foot goes 0.92 m forward at 1.18 m high) and `Punch (Cross)` (the right fist goes 0.46 m forward).

Every weapon below works today with the clips as they are. But until the six clips below are remade, the hammer, the
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

## 1. The Drifter's Broadsword

- **id:** `broadsword` (it exists: `tools/props/sword.py` → `public/models/sword.glb`, `scabbard.glb`)
- **family:** sword
- **found:** he starts with it in Dragon Meadow. It is the sword in his concept art (`art/hero/hero-front-v1.png`).
- **look:** a straight double-edged broadsword with steel, a brass cross-guard with curled ends, a red-brown wrapped
  grip and a brass pommel. 1.32 m as built; shown at ×0.9 on him, so 1.19 m.
- **carried:** in its leather scabbard across his back, the pommel above his right shoulder and the tip at his left
  hip (what `src/hero.js` does today).
- **moveset:**
  - Light `J`: a 3-hit combo, `Slash (Diagonal)` → `Slash (Horizontal)` → `Stab`, all at ×1.0. Damage 10, 10, 14.
  - Heavy (hold `J`): `Greatsword Swing` at ×1.6 (2.0 s), damage 26, so it staggers the troll.
  - Guard `K`: `Greatsword Guard`, looped. It blocks 70 % of a hit from the front 120°.
  - Parry: tapping `K` within 0.2 s before a hit lands plays `Parry` instead. It takes 0 damage, sparks, and the
    attacker staggers for 0.6 s.
  - `L` rolls. When drawn, `Greatsword Idle` is the stance.
- **plays differently:** this is the baseline: medium reach, medium speed, no weight penalty. Its own trick is the
  **riposte**: the next `Stab` within 1.0 s of a successful parry does ×2.5 (35). Good timing pays more than raw
  damage.
- **trail / hit:** the gold trail that exists (`src/vfx.js`). Blade trail base `[0, 0.30, 0]`, tip `[0, 1.13, 0]`
  in sword space.
- **answers:** `chalk-hob` (the roll and the parry against one attacker at a time) and the `barrow-troll` (a parried
  punch opens a riposte).
- **build:** already built. In `sword.glb` the blade runs along +Y: guard at y 0.105 m, tip at 1.13 m, pommel
  bottom at −0.19 m, so 1.32 m in all. The blade is 0.08 m wide at the guard and the grip is 0.22 m long. In
  `scabbard.glb` the mouth is at 0 and the chape at −1.075 m. Seat: the sword points down into the scabbard, guard at the mouth. Nothing to do in 5b
  except copy both files into `public/models/weapons/broadsword.glb` as the `weapon` and `carrier` nodes, so all
  seven load the same way.

## 2. Lanternstring

- **id:** `lanternstring`
- **family:** bow
- **found:** in Lanternwood, inside the hollow of the Lantern Oak (around (100, 975)). A Springwell hunter hung it
  there for luck, on a peg of the glowing fungus, and never came back for it. Its string is spun with the fungus
  thread, which still glows faintly.
- **look:** a tall longbow taller than his shoulder: 1.60 m from tip to tip. Bark-brown yew limbs, a moss-green
  leather grip, pale horn nocks at the tips, and a thin string glowing firefly green. Carried with a leather quiver
  of grey-fletched arrows.
- **carried:** on his back. The quiver lies along the strap with its fletchings above his right shoulder, and the
  bow is lashed alongside it. In the hand, the bow is in his **left** hand; in the shared gesture the left hand ends
  furthest forward.
- **moveset:**
  - Light `J`: a quick shot, `Bow Draw & Release` at ×2.0. The arrow leaves at the release (1.17 s clip time, so
    0.58 s real). Damage 6.
  - Heavy (hold `J`): a full draw. Play `Bow Draw & Release` at ×1.0 and hold the clip at 0.96 s (arms drawn) while
    `J` is held. The camera moves over his right shoulder (field of view 55° → 45°). Letting go fires. Damage grows
    from 6 to 20 over 1.0 s of draw, and at full draw the arrow pierces small foes.
  - `K`: no guard; the bow cannot block. `K` is `Backstep`: a 0.33 s hop that the code moves 2.5 m back.
  - Light `J` with a foe within 1.5 m: `Kick (Front)` instead of a shot. Damage 4; it pushes the foe 3 m back
    (the left foot lands at 0.67 s).
  - `L` rolls.
- **plays differently:** this is the only ranged weapon besides the staff. It reaches what melee cannot: across a
  cloud, up a ledge, wherever a flier lands. Arrows fly at 30 m/s with half gravity, and the most range it is any good at is 40 m. **Headshots (the
  top 20 % of a monster's `height`) do ×2**: a full-draw headshot is 40 and staggers the troll. Ammunition is
  unlimited. Low damage when close: you win by spacing, the backstep and the kick.
- **trail / hit:** the arrow carries a thin firefly-green streak (`#C8FF5A`), a `trail` from the nock to the head.
  On a hit the arrow sticks in the target for 10 s and puffs a few gold-green motes (`sparks`, n 6).
- **answers:** `lantern-cap` (its spore clouds deny the ground and two hits kill it: shoot it from outside the cloud)
  and `gapshrike` in the Greyspine (it can only be hit on the ground, mantled for 2 s after a stoop; wherever you
  rolled to, an arrow reaches it inside that window).
- **build:**
  - Limbs: along ±Y from the grip, 0.80 m each, so 1.60 m from tip to tip. Each is a lofted ellipse 0.032 × 0.022 m
    at the grip, tapering to 0.012 × 0.009 m at the tip. The tips curve back 0.15 m toward −X (the strung bow
    follows the string).
  - Grip: 0.12 m long, radius 0.018, centred on the origin.
  - Nocks: horn cones 0.04 m long at each tip.
  - String: a cylinder of radius 0.002 between the two tips, at x = −0.15 (brace height 0.15 m), lightly emissive
    `#C8FF5A`.
  - Arrows shoot toward +X. The arrow is a third node, `arrow`: origin at the nock, head along +Y. Shaft 0.75 m,
    radius 0.004; three fletches 0.10 m long; an iron leaf head 0.05 m long.
  - Carrier: a quiver, a leather tube 0.62 m long, radius 0.06 at the top and 0.05 at the bottom, with 8 fletchings
    standing 0.12 m out of the top. Top anchor at the quiver mouth. Seat: the bow's origin sits at (0.08, −0.30, 0)
    with its limbs along the carrier's Y, so the upper tip rises 0.50 m above the top anchor and the lower tip runs
    0.13 m past the hips anchor.

## 3. Reedholt Leister

- **id:** `reedholt-leister`
- **family:** spear
- **found:** in Mirrormere, on the rack outside the headman's stilt-house in Reedholt (around (−1000, 1560)). The
  eel-fishers spear eels with these, and they give one to anyone who will help with what lives in the reeds.
- **look:** a long ash pole ending in a flat fan of three barbed iron tines bound on with tarred cord. A small iron
  cap on the butt, and a turquoise ribbon tied below the tines (the village's mark). 2.10 m long.
- **carried:** on his back in a two-loop leather sling. The tines stand 0.65 m above his right shoulder and the butt
  ends behind his left knee.
- **moveset:**
  - Light `J`: up to three quick pokes with `Stab` at ×1.25 (0.74 s each). Damage 8 each.
  - The 4th press, or a press after a hit: `Slash (Horizontal)` at ×1.0, a wide sweep with the pole. Damage 6; it
    knocks small foes 2 m back.
  - Heavy (hold `J`): a lunge. `Dash` at ×1.0 (0.5 s) while the code moves him 5 m forward in 0.35 s, then a `Stab`
    at the end. Damage 22; it pierces small foes. Holding for 0.8 s or more makes it an 8 m lunge.
  - Guard `K`: `Block` (0.75 s). It stops only 40 % of a hit, because a pole is a poor shield.
  - `L` rolls.
- **plays differently:** the longest melee reach in the game: 2.4 m to the end of the tines. **Hits that land with
  the last 0.5 m of the leister do ×1.3**, so the fight is about keeping the foe exactly at the end of the pole.
  The lunge crosses gaps: the jump between Reedholt's stilt-walks and boats, or the space a ranged foe keeps.
- **trail / hit:** a milky lake-turquoise trail (`#72D9D1`) from the ribbon to the tine tips. A sweet-spot hit adds
  a spray of turquoise droplets (`sparks`, n 10).
- **answers:** `stiltstalker` (a reach duel: its spear strikes from 3.5 m and sticks in the mud for 1 s; the lunge
  covers that gap and lands with the tines) and `old-glim` (strike down into the water from the stilts; the lunge
  carries him from platform to platform).
- **build:**
  - The origin is the rear-hand grip, 0.50 m from the butt. Butt cap at y −0.50 (an iron cone 0.05 m long). The
    tine tips are at +1.60, so the total is 2.10 m.
  - Pole: a lofted ring, radius 0.018 at the butt tapering to 0.015 below the tines (+1.30), with a slight random
    bend of ≤ 0.01 m.
  - Tines: three flat iron blades, 0.30 m long (+1.30 → +1.60), 0.012 m wide and 0.004 m thick. They splay in the
    X–Y plane at x −0.05, 0 and +0.05 at their tips. Each has two backward barbs 0.03 m long.
  - Binding: 0.08 m of tarred cord at +1.26 to +1.34, and the ribbon is a strip 0.25 × 0.03 m hanging from +1.24.
  - Carrier: two leather loops (radius 0.03) at carrier y 0 and −0.90, joined by a strap 0.04 m wide. Seat: the
    weapon's origin is at carrier y −0.95, tines up, so the tips stand 0.65 m above the top anchor and the butt
    runs 0.48 m past the hips anchor.
  - Trail base `[0, 1.24, 0]`, tip `[0, 1.60, 0]`.

## 4. Tidebell Maul

- **id:** `tidebell-maul`
- **family:** hammer
- **found:** on Bellholm, half-buried in the shingle at the foot of the leaning Bell Tower (around (−1190, −750)). It
  is the bronze clapper of the tower's great bell. It fell when the tide finally swung the bell too hard, and a
  fisher lashed it crosswise onto a broken oar to make a mooring mallet.
- **look:** a bronze egg-shaped clapper head, mottled green with verdigris and lashed crosswise onto a pale
  weathered oar shaft with iron bands and tarred rope. The clapper's iron ring still stands up from the top of the
  head. 1.33 m long, and it looks heavy.
- **carried:** on his back, hanging in a rope sling, the head behind his right shoulder and the oar shaft running
  down to his left hip.
- **moveset:**
  - Light `J`: `Hammer Overhead Smash` at ×2.0 (2.36 s). Damage 26, so every hit staggers. If it hits the ground,
    it adds a dust ring (`dust`) and a 1.5 m shockwave that does 8.
  - Heavy (hold `J`): `AoE Ground Slam` at ×1.0 (2.0 s). The bell rings: `blast` radius 4 m, damage 18 to everything
    inside, small foes knocked down, the troll staggered.
  - Guard `K`: `Greatsword Guard`, holding the head as a shield. It blocks 90 %, but he cannot parry and walks at
    half speed while guarding.
  - `L` rolls at ×0.85, with 30 % shorter invulnerability.
  - When drawn he is 15 % slower.
- **plays differently:** the slowest, heaviest weapon. You trade hits instead of avoiding them: **from 40 % of the
  way into a smash to its end he does not flinch** (no `Hit (Front)`, though he still takes damage). Every hit
  staggers. It **shatters stone**: the troll's fallen cover stones, and armour plates on armoured foes.
- **trail / hit:** a wide verdigris trail (`#4CC79E`) across the head only, heavy and short (it fades in 0.15 s).
  On a hit: bronze sparks (`sparks`, n 16), `shake` 0.3 for 0.25 s, `hitstop` 90 ms. The ground slam adds a white
  `blast` ring.
- **answers:** `tolling-warden` (its anchor stays down 1.2 s after Anchor fall; a smash at ×2.0 lands inside that,
  since its hit window is 0.42–1.0 s in real time, and every hit staggers it off its beat) and `rime-warden` at
  Wyrmcrown (light hits bounce off its armour; heavy hits crack it and shatter its ice wall).
- **build:**
  - The origin is the lower grip, 0.25 m above the butt. Butt at y −0.25; head centre at +0.95; the top of the ring
    at +1.08. Total 1.33 m.
  - Shaft: an oar loom of oval section 0.026 × 0.020 m, pale grey-brown wood. Tarred rope wraps 0.10 m long at the
    grip (−0.05 to +0.05) and under the head.
  - Head: a bronze egg 0.22 m long along X (the striking faces are ±X) and 0.16 m across, centred at +0.95. Vertex
    colours mix bronze `#A7703A` and verdigris `#4E9E83` by noise. Two iron bands (0.02 m wide) hold it to the
    shaft.
  - Ring: an iron torus, radius 0.05 with a 0.012 tube, standing up from the head's top.
  - Carrier: a rope sling, two loops at carrier y 0 and −0.70. Seat: the origin is at carrier y −0.70, head up, so
    the head's centre sits 0.25 m above the top anchor and the butt sits at the hips anchor.
  - Trail base `[0, 0.82, 0]`, tip `[0, 1.06, 0]`.

## 5. Wrecker's Axe

- **id:** `wreckers-axe`
- **family:** axe
- **found:** at the Undercliff, in the old beachcomber's sea cave. His cave is stacked with salvage from wrecks.
  This boarding axe came off a ship that broke on the Needle, and he trades it for a crab-pot pulled out of the
  tide pools.
- **look:** a one-handed bearded axe. Dark slate-grey iron head with a bright ground edge, its long beard hooking
  down to catch rope and rails. A kelp-brown ash haft with a slight S-curve and a black tar-twine grip. 0.80 m long.
- **carried:** on his back in a small leather frog, the head behind his right shoulder and the haft hanging
  0.6 m down his back.
- **moveset:**
  - Light `J`: two quick chops, `Slash (Diagonal)` at ×1.3 → `Slash (Horizontal)` at ×1.3. Damage 11 each.
  - Heavy (hold `J`): throw. `Throw` at ×1.0; the axe leaves his hand at 0.60 s spinning 12 turns a second,
    flies at 16 m/s up to 18 m, and sticks in the first thing it hits. Damage 30, so it staggers the troll. Then
    it drops to the ground below the hit.
  - While the axe is away, he fights **bare-handed**: `J` = `Punch (Cross)` (damage 4) and hold `J` =
    `Kick (Front)` (damage 6, push 3 m). Walking within 1.2 m of the axe picks it up without a key.
  - `K`: a hook-parry with `Parry`. The beard catches the attacker's weapon: 0 damage and it staggers for 0.8 s
    (longer than the sword's), but there is no riposte bonus.
  - `L` rolls.
- **plays differently:** fast and short, with only 0.9 m of reach. **The throw is the biggest single hit you have
  early on, and it disarms you**: every throw is a commitment you must walk back for. **The beard hooks a guard
  open**: a `Slash (Horizontal)` that hits a guarding or armoured front pulls it aside for 1.0 s, and any hit in
  that time lands in full. It also chops wood (barricades, thorn thickets).
- **trail / hit:** a short sea-foam trail (`#C4F2FF`) on the edge. The thrown axe trails a spinning ring of the
  same colour. A stuck axe adds a thunk: `hitstop` 60 ms and wood chips (`dust`, size 0.3).
- **answers:** `wreckback` (its shelled front turns every hit: hook it open, or flank it) and `driftwight` (deadly
  at range: a thrown axe during its 1.1 s net gather interrupts the cast while you close in).
- **build:**
  - The origin is the grip centre, 0.18 m above the butt. Butt knob at y −0.18 (a sphere of radius 0.022). The top
    of the head is at +0.62, so the total is 0.80 m.
  - Haft: an oval loft 0.030 × 0.022 m with an S-bend of ±0.012 m in X. Tar-twine wrap from −0.10 to +0.10, and a
    brass ring (radius 0.02, 0.02 m tall) at +0.40.
  - Head: the eye wraps the haft from +0.48 to +0.62. The edge runs from the toe at (x 0.15, y 0.64) down to the
    heel of the beard at (x 0.12, y 0.38), and the poll sits at x −0.04. It is 0.024 m thick at the eye, tapering
    to 0.003 m at the edge. The edge band (the outer 0.02 m) is bright `#C9CED4`; the rest is slate `#3A3F45`.
  - Carrier: a leather frog, a loop of radius 0.035 that is 0.18 m tall, at carrier y 0. Seat: the origin is at
    carrier y −0.43, head up, so the head sits just above the top anchor.
  - Trail base `[0.13, 0.40, 0]`, tip `[0.15, 0.64, 0]`.

## 6. Windgap Warden

- **id:** `windgap-warden`
- **family:** greatsword
- **found:** in the Greyspine, at the Windgap Gate (around (1525, 1300)), standing point-down in the gatehouse
  floor where the last warden of the pass drove it before the fortress was abandoned. It has stood there in the
  wind ever since. The blade is clean; the grip has rotted to the wood and has been rewrapped in pine-green cloth by
  whoever passes.
- **look:** a two-handed greatsword as tall as he is, 1.79 m. A long cold-grey blade with a leather-wrapped ricasso
  and a pair of small parrying lugs, a wide straight granite-grey cross-guard, a long pine-green grip and a
  wheel pommel.
- **carried:** on his back on an open leather frame with three brass clasps. The hilt rises well above his right
  shoulder, higher than the broadsword's, and the tip ends behind his left thigh.
- **moveset:**
  - Light `J`: `Slash (Horizontal)` at ×0.85 (1.42 s), a 200° sweep. Damage 18 to every foe in the arc. A second
    press: `Greatsword Swing` at ×1.3 (2.5 s), damage 28.
  - Heavy (hold `J`): charge. Hold `Greatsword Guard` for up to 1.5 s while the blade's trail glows brighter, then
    let go: `Greatsword Swing` at ×1.6. Damage 28, rising to 50 at full charge.
  - Guard `K`: `Greatsword Guard`, the flat of the blade held as a wall. It blocks **100 %** from the front 140°,
    but cannot parry. Only the troll's ground slam breaks it.
  - From guard, `K` + `J`: `Kick (Front)`, a guard-break shove of 3 m (damage 6).
  - `L` rolls. When drawn, `Greatsword Idle` is the stance and he is 20 % slower.
- **plays differently:** the crowd weapon. **Every hit lands on every foe in the arc**, not just the first. The guard
  is a wall: you stand and take a charge on a narrow ledge instead of rolling off it. The charged swing is the
  biggest hit in the game, but it is slow and you are open while charging.
- **trail / hit:** a long, wide snow-blue trail (`#B4D8FF`, lasting 0.3 s instead of 0.2). While charging, the
  blade emits a slow drift of snow motes (`sparks`, n 2 every 0.1 s). On a hit: a granite-grey dust puff
  (`dust`, size 0.6), and a full charge adds `shake` 0.4 and `hitstop` 120 ms.
- **answers:** `scarhorn` (its ram charge throws you 4 m off the path; behind this guard it pushes you only 1 m, so
  you can stand with your back to the drop) and `ribmite-swarm` in the Redwaste below the Thousand Steps (one hit
  kills a mite, and the sweep hits them all).
- **build:**
  - The origin is the upper grip, just below the guard. Pommel bottom at y −0.31: a disc of radius 0.045, 0.03 m
    thick, at −0.27. Grip from −0.22 to +0.16, a ring of radius 0.017 wrapped in pine `#2A4030`.
  - Guard: a box 0.40 × 0.03 × 0.035 m at +0.18, granite `#66686C`.
  - Ricasso: +0.20 to +0.32, a 0.050 m diamond section wrapped in leather. Lugs at +0.32: two spikes 0.06 m long
    along ±X.
  - Blade: from +0.32 to the tip at +1.48, a diamond section 0.060 × 0.010 at +0.34, 0.045 at +1.25, and a point
    at +1.48. Steel `#A8B2BE`, metallic 1, roughness 0.3.
  - Total 1.79 m.
  - Carrier: a leather spine strip 1.00 × 0.08 × 0.01 m with three brass clasps (boxes 0.10 × 0.03 × 0.03 m) at
    carrier y 0, −0.45 and −0.90; the blade sits 0.03 m in front of the strip. Seat: the origin is at carrier
    y +0.25, blade **down** (weapon +Y = carrier −Y). So the guard is at +0.07, the pommel 0.56 m above the top
    anchor, and the tip 0.26 m past the hips anchor.
  - Trail base `[0, 0.40, 0]`, tip `[0, 1.48, 0]`.

## 7. Ribfire Staff

- **id:** `ribfire-staff`
- **family:** staff
- **found:** in the Redwaste, in the nomad camp below the Dragon's Ribs (around (2550, 1560)). The nomads cut it from
  the tip of a fallen rib and set a lump of salt-glass from the salt pan in its fork. They say the old dragon's heat
  never left its bones, and the salt-glass catches it. The elder lends it to anyone who will go inside the Ribs.
- **look:** a long, slightly curved staff of sun-bleached bone stained rust at the ends. At its head the rib splits
  into three curled bone tines that cradle a pale salt-glass crystal with an ember glowing inside. Rust-red cloth
  wraps at the grip and under the head, and an iron ferrule at the foot. 1.75 m long.
- **carried:** on his back in a two-strap sling, the ember head 0.45 m above his right shoulder (it glows softly
  through the fog, so you can see him from far off) and the foot behind his left thigh.
- **moveset:**
  - Light `J`: `Cast (One-Handed)` at ×1.2 (0.87 s). An ember bolt leaves the crystal at the release (0.79 s clip
    time) and flies at 25 m/s. It bends up to 15° toward a monster in front of him. Damage 8. Cost: 1 charge.
  - Heavy (hold `J`): `Channel (Two-Handed)`, looping its 0.25–1.75 s span while held, up to 3 s. A heat-jet
    8 m long from the crystal does 12 a second. He cannot move while channelling. Cost: 2 charges a second.
  - Tap `K`: `Conjure`. A salt-glass ward circle 2 m across forms at his feet for 4 s and stops one monster hit
    completely, then shatters. Cost: 2 charges.
  - Hold `K` for 0.5 s or more: `Summon`. Bone ribs burst out of the ground in a ring 10 m ahead (at the release,
    1.75 s) and pin whatever stands there for 2.0 s. Cost: 4 charges. Cooldown 20 s.
  - Light `J` with a foe within 1.5 m: a staff shove instead, `Slash (Horizontal)` at ×1.3. Damage 4; it pushes 3 m
    and costs nothing. This is the panic button.
  - `L` rolls.
- **plays differently:** the only weapon with a resource. It has **6 ember charges that refill at one every 1.5 s**,
  shown as six pips on the health bar. You plan, kite and spend. It is weak up close and strong at range, and the
  ring of ribs sets up hits for the bolt. **The ember is a light**: within 12 m of the crystal, real bodies cast a
  shadow even in shade, and illusions do not.
- **trail / hit:** bolts are pure effects with no model: a small emissive sphere (`#FF7A30` with a salt-white core)
  carrying a `trail`. A hit bursts into ember sparks (`sparks`, n 12) and a heat shimmer puff (`dust`, size 0.4,
  warm tint). The jet is a stream of sparks along its length.
- **answers:** `marrowkeeper` (its copies die to one hit, so bolts pop them from range; in the Ribs' shade, where the
  sun casts no shadow, the ember's light gives the real one its shadow back) and `ribmite-swarm` (the jet burns a
  lane through the crowd).
- **build:**
  - The origin is the grip centre, 0.70 m above the foot. Foot at y −0.70 (an iron ferrule cone 0.06 m long). The
    crystal's centre is at +1.00, and the tops of the tines are at +1.05. Total 1.75 m.
  - Shaft: an oval loft 0.034 × 0.026 m at the foot thinning to 0.024 × 0.020 m at +0.85. It bows 0.06 m along X
    (a rib's curve). Bone `#DCCCA8`, with rust `#8A4A2A` stains near both ends by noise.
  - Wraps: rust-red cloth at −0.06 to +0.06 and at +0.80 to +0.86.
  - Tines: three bone horns, each 0.18 m long (radius 0.012 → 0.003), rising from +0.86 at 120° apart around the
    shaft and curling in over the crystal.
  - Crystal: an icosphere of radius 0.05 at +1.00, pale salt-glass `#F2E8DC` with roughness 0.3. Inside it, a core
    sphere of radius 0.025, emissive ember `#FF7A30` ×3.
  - Carrier: two leather straps (loops of radius 0.03) at carrier y 0 and −0.85. Seat: the origin is at carrier
    y −0.55, head up, so the crystal sits 0.45 m above the top anchor and the foot runs 0.28 m past the hips
    anchor.
  - Trail (for the shove) base `[0, 0.60, 0]`, tip `[0, 1.05, 0]`.

## Where the pickups stand until their lands exist

Only the meadow (`src/field.js`, `src/ring.js`) exists today. So for 5c's demo (*find a weapon, switch, fight with
it*), each pickup stands in the meadow ahead of the start, where the opening camera looks. Each stands upright, or
leans 10° with its business end up, so it rises above the waist-high grass. Every 2.5 s, 3 `sparks` in its trail
colour glint at its top. Its feet sit on `ctx.heightAt`.

| id | meadow test spot (x, z) | its land, once that land's module exists |
|---|---|---|
| `lanternstring` | (6, −14) | the Lantern Oak's hollow, Lanternwood |
| `reedholt-leister` | (−9, −22) | the headman's rack, Reedholt |
| `tidebell-maul` | (14, −30) | the shingle under the Bell Tower, Bellholm |
| `wreckers-axe` | (−16, −36) | the beachcomber's cave, the Undercliff |
| `windgap-warden` | (4, −44) | the gatehouse floor, Windgap Gate |
| `ribfire-staff` | (−6, −54) | the nomad camp below the Dragon's Ribs |

## What 5c needs from other files (not built here)

- `src/vfx.js`: `trail()` uses one gold material. Each weapon needs its own colour: `trail(obj, {base, tip, color})`.
  The axe and the greatsword also need their trail length (0.15 s and 0.3 s).
- `src/hero.js`: the back strap should carry any `carrier` node (its top anchor and direction), not only
  `scabbard.glb`.
- `ctx.heroAct`: the bow's full draw needs a clip held on one frame while a key is down (pause and resume), and the
  staff's channel needs a span to loop (0.25–1.75 s).
- `public/models/hero.glb`: the six clips in **Clip truth** should be remade with `kimodo-motion` (free) under the
  same names.
