# The Asterholm bestiary

The monsters of every land in `WORLD.md`, designed to be built: rigged, animated, ready for a monster AI and the
`?bestiary=1` gallery. Ambient animals (sheep, gulls, seals, deer, goats…) are not here.

**Lands.** `WORLD.md` names eight lands; the Old Ring inside the meadow is the ninth fight place and already holds the
Barrow Troll. Every one of the eight lands gets at least one new monster. The troll and the winter dragon exist and are
listed, not redesigned.

### Roster

| build | id | name | land | role | size | body | rig | the fight teaches | credits |
|---|---|---|---|---|---|---|---|---|---|
| done | `barrow-troll` | The Barrow Troll | Dragon Meadow (Old Ring) | boss | 3.0 m | biped | B | wind-ups, cover | spent |
| done | `winter-dragon` | The winter dragon | Wyrmcrown | guardian | 16–20 m span | winged quadruped | shipped | not fought | 0 |
| 1 | `chalk-hob` | Chalk Hob | Dragon Meadow | roamer | 1.3 m | biped | B | the roll; who attacks next | 21.75 |
| 2 | `wreckback` | Wreckback | The Undercliff | roamer | 2.2 m | biped | B +S +R | flanking an armoured front | 21.75 |
| 3 | `lantern-cap` | Lantern-cap | Lanternwood | roamer | 1.6 m | biped | B +S | spotting; clouds that deny ground | 21.75 |
| 4 | `driftwight` | The Driftwight | The Undercliff | guardian | 3.2 m | biped | B +S +P | closing distance on a ranged foe | 21.75 |
| 5 | `rootbinder` | The Rootbinder | Lanternwood | guardian | 4.0 m | biped | B +S +P | attacks from below; read the ground | 21.75 |
| 6 | `old-glim` | Old Glim | Mirrormere | boss | 16 m long | serpent | C | a platform fight over water | 21.75 |
| 7 | `stiltstalker` | Stiltstalker | Mirrormere | roamer | 2.8 m | biped | B +S +P | a reach duel; the fastest wind-up | 21.75 |
| 8 | `tolling-warden` | The Tolling Warden | Bellholm | boss | 3.4 m | biped | B +S +R +P | rhythm; a shrinking arena | 21.75 |
| 9 | `scarhorn` | Scarhorn | The Greyspine | roamer | 2.6 m | biped | B +S | footing on a path with a drop | 21.75 |
| 10 | `gapshrike` | The Gapshrike | The Greyspine | guardian | 2.4 m, 7 m span | winged biped | B +S | an air foe; read its shadow | 21.75 |
| 11 | `ribmite-swarm` | Ribmites | The Redwaste | roamer | 0.3 m × 40–60 | swarm | I | crowds; sweeping weapons | 2.75 |
| 12 | `marrowkeeper` | The Marrowkeeper | The Redwaste | boss | 3.5 m | biped | B +S | which one is real (shadows) | 21.75 |
| 13 | `rime-warden` | The Rime Warden | Wyrmcrown | guardian | 4.5 m | biped | B +R +P | armour break: heavy hits only | 21.75 |
| | | | | | | | | **13 new** | **263.75** |

**Totals.** 13 new monsters: 11 bipeds (85 %; 12 of 15 = 80 % with the troll and dragon), 2 non-bipeds (`old-glim`,
`ribmite-swarm`; 3 with the existing dragon). New cost 12 × 21.75 + 2.75 = **263.75 credits** (≤ 300). That leaves 36.25
under the 300 line — one redo. Project spend afterwards: 54.5 + 263.75 = 318.25 of the 500 cap. Rigging, clips and props
are local and free.

**Build order.** The first three (`chalk-hob`, `wreckback`, `lantern-cap`) are plain bipeds with the cheapest rigs,
so the 4d gallery gets models early. The rest follow `WORLD.md`'s land build order.

**Concept rules (phase 4b).** Bipeds: front view, full body, feet visible, plain grey ground, a TRUE T-pose (arms
straight out at shoulder height, palms down, space between arm and body: the house-autorig rule). Draw extras (wings,
nets, capes, tails) clear of the limbs so the mesh does not fuse them.
**Eddie, 2026-11-12: golems and big creatures get LONG arms** (*"make sure golems arms and big creatures are not too
short, they should have long arms"*): in the T-pose concept the span is ~1.5× the height; hanging, the knuckles reach
the knees. Check it on the concept before paying for the 3D. The serpent: side view, laid straight. Original
designs only: nothing in this file is taken from an existing game.

### Rig routes

**B: biped (11 of 13).** Concept (2.75) → Hunyuan3D (19) → `tools/hero/prep.py` weld and clean → house autorig
(`autorig.sh`, free, ~20 s). Shoulders, elbows, wrists and head are placed by hand and checked on the skeleton overlay
every time (the troll's `art/troll/rig/troll-markers-fixed.json` route). Then `kimodo_glb.py`, then the Drifter's
clips by `retarget.py` (only the clips the entry lists, `Idle` first, as in `tools/hero/build.sh`), then `slim.py` →
`public/models/bestiary/<id>.glb`. Rigged at 1.80 m like the hero; the game scales it (the troll is ×1.67). A move the
51 clips lack comes from Kimodo text-to-motion (local, free, `kimodo-motion` skill), retargeted the same way, and is
listed as `Kimodo: <name>`.
- **+S, spring parts.** Tails, kelp, nets, capes, cloaks and wings become `spring_<part>_<n>` bone chains, added
  after the autorig by a copy of `tools/hero/springs.py` (it finds vertices by position, weights them along the chain
  and prints the counts, so a zero shows). They swing at runtime in `src/springs.js`'s damped chains. This is the
  route the hero's bandana and hem already use.
- **+P, props.** Held things (anchor, spear, net, blade) are built from code in Blender like `tools/monster/club.py`
  and parented to the hand bone. Free.
- **+R, rigid part.** A shell, bell or crown that must not bend is re-weighted 100 % to one bone after the autorig.

**Why not Higgsfield's rigger.** Checked read-only on 2026-11-12, with no paid calls. `3d_rigging` is Meshy's rigger.
Its parameters are `model_url`, `height_meters` ("of the rigged figure", default 1.7) and `animation_action_id` 0–696.
Its library holds 678 actions in five groups (WalkAndRun, BodyMovements, DailyActions, Dancing, Fighting), and all of
them are humanoid: every preview is under `cdn.meshy.ai/.../preview/biped/`, and a search for "quadruped" returns 0. For
bipeds it is a paid copy of our free rigger. For non-bipeds it cannot help.

**C: serpent chain from code** (`old-glim`). Mesh from Hunyuan3D as usual, then a Blender script
(`tools/bestiary/serpent_rig.py`) does the rigging. It slices the mesh along its long axis, puts one bone at each
slice's centroid (24 bones, head → tail), weights every vertex to its two nearest chain bones with a smooth falloff (≤ 4
influences, normalised) and prints the vertex count per bone (0 = fail). Motion is procedural in JS, with no clips: a
travelling wave down the chain (`bend_i = A_i · sin(k·i − ω·t)`, amplitude rising toward the tail) plus head aim. Coil,
lunge and dive are poses of the same wave. Sources in this repo: `tools/hero/springs.py` (bone chains added to a mesh
from code, vertices picked by position, weighted along the chain, shipped on the hero) and `src/springs.js` (a bone
chain driven every frame).

**I: instanced swarm** (`ribmite-swarm`). No skeleton. One rigid mesh (~1.5k triangles) is built from code in Blender
(`tools/bestiary/ribmite.py`), with the legs marked in a vertex-colour channel, and drawn as one InstancedMesh of
40–60. Legs scuttle by a TSL vertex wiggle phased by a per-instance hash. The swarm moves by boids in JS (separate,
align, seek the hero, scatter from a swing) and burrows by sinking under `ctx.heightAt`. Sources in this repo:
`src/field.js` (instanced blades with a hashed identity and TSL vertex motion) and `src/vfx.js` (pooled, no allocation
per hit).

Every wind-up below has a visible tell and a time. Every attack leaves an opening, which is when the hero hits back.

---

## The Barrow Troll (exists)
- **id:** `barrow-troll`
- **land:** Dragon Meadow, the Old Ring at (325, 180)
- **role:** boss (the first fight)
- **size:** 3.0 m (rig ×1.67)
- **look:** As in `WORLD.md` and `art/troll/troll-front.png`, not redesigned. A fat, moss-backed troll with
  stone-grey cracked skin and lichen rosettes; ferns, moss and tiny mushrooms on its head and shoulders; a rope belt
  with bronze charms and a bell; a hide loincloth. Its club is a standing stone ripped out of the ring.
- **fight:** Asleep in the barrow, it wakes and roars (`Channel (Two-Handed)`, the mist blows outward:
  `ctx.vfx.blast`). Then the club smash (`Hammer Overhead Smash`), the ground slam with its dust ring
  (`AoE Ground Slam`), a punch (`Punch (Cross)`) and a kick (`Kick (Front)`), all telegraphed. The fallen stones are
  cover. Built in `src/monster.js`.
- **body plan:** biped
- **rig route:** B, done: Hunyuan3D, autorig with hand-placed markers (`art/troll/rig/troll-markers-fixed.json`),
  club from `tools/monster/club.py`.
- **clips:** `Idle`, `Walk`, `Run`, `Sit`, `Stand Up`, `Channel (Two-Handed)`, `Hammer Overhead Smash`,
  `AoE Ground Slam`, `Punch (Cross)`, `Kick (Front)`, `Hit (Front)`, `Stagger`, `Death (Collapse)` (in `public/models/troll.glb`).
- **cost:** 21.75 credits, already spent (concept 2.75 + Hunyuan3D 19).

## The winter dragon (exists)
- **id:** `winter-dragon`
- **land:** Wyrmcrown (its nest); seen every day over Dragon Meadow
- **role:** guardian of the island. It is never fought: its trust is earned, and then it carries you to the Crown
  and between landmarks.
- **size:** 16–20 m wingspan in game (7 m as shipped)
- **look:** As shipped in `public/models/dragon.glb`, not redesigned.
- **fight:** None in this design. If a trust trial is wanted later, its `idle_roar` and `idle_fire` clips are ready.
- **body plan:** winged quadruped (non-biped)
- **rig route:** It shipped rigged and animated; there is no rig work. Source: `public/models/dragon.glb`.
- **clips:** `fly`, `hover`, `idle`, `idle_fire`, `idle_look`, `idle_roar`, `idle_shake`, `idle_wings`, `land`, `takeoff`, `walk` (+3 variants).
- **cost:** 0 (a free on-disk model).

## 1. Chalk Hob
- **id:** `chalk-hob`
- **land:** Dragon Meadow
- **role:** roamer (packs of 3–5; the first enemy you meet)
- **size:** 1.3 m (rig ×0.72)
- **look:** Silhouette: a squat, pot-bellied little biped with arms so long its knuckles brush the grass, and a flat,
  overhanging lid of living turf on its head like a cap. In the grass only the lid and two eyes show. Its body is packed
  chalk, white and crumbly, scored with flint-black cracks. A knapped flint nodule sits in its chest, glossy black with
  a blue-grey sheen, and its fingers are flint flakes. The turf lid grows sage and yellow-green grass with two or three
  poppies. The eyes are two poppy-red seeds with a faint glow. Palette: chalk white, sage, yellow-green, poppy red,
  flint black. Why it is here: when sea fog fills the hollows, the chalk under the turf stirs.
- **fight:** It teaches the roll and reading which hob comes next. Only one hob attacks at a time; the rest circle low.
  1. **Bowl** (`Roll`): tucks into a ball, chalk dust puffing at its feet (0.6 s), then rolls 6 m straight through you
     (knockdown). It uncurls dizzy for 1 s at the end of the roll, which is the opening.
  2. **Flint flick** (`Throw`): its arm cocks back and the flint fingers glint white (0.7 s), then a shard flies.
     Sidestep it.
  3. **Jab** (`Punch (Cross)`): 0.4 s, weak. A lone hob is a pushover.
  It dies two hits in, crumbling to chalk dust (`ctx.vfx.dust`); the turf lid drops and stays as a tussock.
- **body plan:** biped: short legs, very long arms (wrists placed by hand at the flint fingers)
- **rig route:** B. The turf lid rides on the head.
- **clips:** `Idle`, `Crouch Walk`, `Run`, `Stand Up` (it waits frozen on the first frame as a low mound, then rises),
  `Roll`, `Throw`, `Punch (Cross)`, `Hit (Front)`, `Stagger`, `Death (Collapse)`.
- **cost:** 21.75 credits (concept 2.75 + Hunyuan3D 19).

## 2. Wreckback
- **id:** `wreckback`
- **land:** The Undercliff (beach, tide pools, the mouths of the sea caves)
- **role:** roamer
- **size:** 2.2 m (rig ×1.22)
- **look:** Silhouette: a hunched biped hidden under an upturned rowing-boat hull worn as a shell on its back. From
  behind it is a boat walking on two thick legs. From the front you see a small head under the bow, one enormous
  barnacled crab claw for a right hand and a plain grasping left hand. Kelp hangs in strands from the gunwales. The hull
  is grey, sea-bleached clinker planks with flaking slate-blue paint. The hide is wet slate grey. The claw is a
  kelp-brown shell crusted with chalk-white barnacles, with foam-white salt crust in the joints. Palette: chalk, slate,
  foam, kelp brown. Why it is here: it takes the boats the sea wrecks on the Needle and wears the best one.
- **fight:** It teaches flanking: its front is armour.
  1. **Shell up** (`Block`): turns its hull to you. Frontal hits spark off (`ctx.vfx.sparks`) and do nothing, so hit
     the sides and the legs.
  2. **Claw smash** (`Hammer Overhead Smash`): the claw rises high and the barnacles rattle (1.0 s), then it slams the
     shingle. The claw sticks for 1.5 s: the opening.
  3. **Claw sweep** (`Slash (Horizontal)`): claw drawn back low (0.6 s), then a wide 180° sweep in front. Roll past
     its side.
  4. **Side-scuttle** (`Dash` with the body turned 90° in code, so it rushes sideways like a crab): it puts the hull
     back between you and it.
- **body plan:** biped with an oversized right forearm (the wrist marker goes at the claw's base)
- **rig route:** B +R (the hull re-weighted 100 % to `upperChest`, a rigid shell) +S (4 kelp chains from the gunwales,
  2 bones each).
- **clips:** `Idle`, `Walk`, `Crouch Walk` (the sideways scuttle), `Dash`, `Block`, `Hammer Overhead Smash`,
  `Slash (Horizontal)`, `Hit (Front)`, `Stagger`, `Death (Collapse)`.
- **cost:** 21.75 credits.

## 3. Lantern-cap
- **id:** `lantern-cap`
- **land:** Lanternwood (around the Lantern Oak, at dusk)
- **role:** roamer (in twos and threes)
- **size:** 1.6 m including the cap (rig ×0.89)
- **look:** Silhouette: a thin, stooping little biped under an enormous round mushroom cap twice as wide as its
  shoulders. It reads as a walking toadstool, with spindly arms, long fingers and stalk-thin legs. The cap is bark brown
  and moss-dappled on top. The gills underneath glow firefly gold and light its own body from above. The body is pale
  fungus-white flesh fading to moss green at the feet, and fine gold spores always drift up off it. Palette: deep green,
  moss, bark brown, firefly gold. Why it is here: the Lantern Oak's glowing fungus, walking. At dusk they stand still
  among the real glowing toadstools and look like more of them; the tell is that their spores drift UP.
- **fight:** It teaches spotting, and ground you cannot stand on.
  1. **Spore cloud** (`Conjure`): it crouches while the cap swells and the gills brighten (1.0 s), then bursts a gold
     cloud 3 m wide that lingers 4 s. Inside it the hero is slowed and the picture softens.
  2. **Puffball lob** (`Throw`): plucks a glowing puffball from under the cap (0.8 s) and lobs it in an arc. A gold dot
     marks where it will burst into a small cloud.
  3. **Cap butt** (`Punch (Cross)`): short and weak. Two hits kill it.
  It dies by bursting into gold spores, and its light goes out.
- **body plan:** biped with a very wide head mass (the head marker is placed by hand under the cap: the autorig's
  "a hat shifts the head joint band" limit)
- **rig route:** B +S (the cap rim as 4 short spring chains, so it wobbles as it walks).
- **clips:** `Idle`, `Walk`, `Crouch Walk`, `Conjure`, `Throw`, `Punch (Cross)`, `Hit (Front)`, `Death (Collapse)`.
- **cost:** 21.75 credits.

## 4. The Driftwight
- **id:** `driftwight`
- **land:** The Undercliff (the sea cave at the foot of the Whistling Chimney)
- **role:** guardian. You meet it on the travel loop's step 6, the first time you come home the back way.
- **size:** 3.2 m (rig ×1.78)
- **look:** Silhouette: tall, thin and stooped like a heron made of driftwood, a stick figure taller than a door,
  draped head to foot in torn fishing net that hangs in long tatters from its arms and shoulders. It has no face: a
  hollow of tangled driftwood with two glass fishing floats where eyes would be. Its wood is bleached silver-grey; the
  net and rope are kelp brown, strung with cork bobbers; the glass floats glow a pale foam-green. Its feet are always wet
  slate. Palette: chalk, slate, foam, kelp brown. Why it is here: the net it wears is every net the Undercliff ever lost.
- **fight:** It teaches closing distance: deadly at range, clumsy up close.
  1. **Net cast** (`Throw`): gathers the net into its hand while the floats flare green (1.1 s), then casts it 12 m. A
     hit roots you for 1.5 s and it reels you in. Roll sideways.
  2. **Kelp whip** (`Slash (Horizontal)`): drags a kelp rope back over the shingle, hissing (0.8 s), then lashes it 8 m
     in an arc. Inside 3 m it misses.
  3. **Surge** (`Channel (Two-Handed)`): raises both arms while the sea pools at its feet (1.5 s), then a wave runs
     across the cave floor. Stand on a rock or be knocked down.
  4. **Gaff** (`Stab`): its close-range answer, a short hook thrust (0.5 s), weak.
  It dies by collapsing into a heap of sticks and net.
- **body plan:** biped: very thin limbs, long arms
- **rig route:** B +S (6 net-tatter chains from the shoulders and arms; the whip as an 8-bone chain on the right hand,
  so the slash whips it out) +P (the cast net as a code prop thrown as a projectile, `tools/bestiary/net.py`).
- **clips:** `Idle`, `Walk`, `Throw`, `Slash (Horizontal)`, `Channel (Two-Handed)`, `Stab`, `Hit (Front)`, `Stagger`,
  `Death (Collapse)`.
- **cost:** 21.75 credits.

## 5. The Rootbinder
- **id:** `rootbinder`
- **land:** Lanternwood (on the Rootbridge over the Coldrun gorge, the way out to the Greyspine)
- **role:** guardian
- **size:** 4.0 m (rig ×2.22)
- **look:** Silhouette: very tall and narrow, like a stretched person grown out of roots. Its arms reach the ground
  while it stands, its legs are two twisted trunks, and a crown of bare roots spreads up and out like antlers. Inside
  its open ribcage of roots, a cluster of fireflies glows. Its face is a carved wooden mask, smooth and calm: the only
  made thing on it. The roots are dark bark brown, with deep green moss in the hollows and ferns at the shoulders.
  Firefly gold light shows in the chest and in the mask's eye holes. Palette: deep green, moss, bark brown, firefly gold.
  Why it is here: the old woodfolk trained roots across the gorge, and one of them kept growing and now keeps the bridge.
- **fight:** It teaches that attacks come from below.
  1. **Root spears** (`Summon`): kneels and plunges both hands into the soil (1.2 s). A line of gold light runs along
     the ground under the hero, and 0.6 s later roots spear up along it. Step off the gold.
  2. **Low sweep** (`Slash (Horizontal)`): a long arm drawn back along the ground (0.9 s), then a sweep at knee height
     across 6 m. Jump it or roll it.
  3. **Root lance** (`Stab`): one finger stretches into a spear (0.7 s), straight, 5 m reach.
  4. **Bark guard** (`Block`): crosses its arms, and frontal hits do nothing until a heavy hit breaks the guard.
  It dies by sinking into the bridge as the fireflies scatter.
- **body plan:** biped: very long arms and a tall root crown
- **rig route:** B +S (root crown and trailing root tendrils as spring chains) +P (the ground roots as instanced code
  spikes).
- **clips:** `Idle`, `Walk`, `Summon`, `Slash (Horizontal)`, `Stab`, `Block`, `Hit (Front)`, `Stagger`,
  `Death (Collapse)`.
- **cost:** 21.75 credits.

## 6. Old Glim
- **id:** `old-glim`
- **land:** Mirrormere (the open water around Reedholt)
- **role:** boss
- **size:** 16 m long, 1.3 m thick
- **look:** Silhouette: a single enormous eel, longer than Reedholt's main walkway. It has a blunt, broad head, a
  jutting lower jaw lined with fine needle teeth, and a ribbon fin running the length of its back and belly. The skin is
  milky turquoise and half-translucent, like the lake water itself (the glacier's rock flour), darker teal along the
  back and pale reed gold on the belly. Down each flank runs a row of lamp-orange glowing spots: at night, under the
  surface, they look exactly like Reedholt's lamps doubled in the water. Palette: turquoise, reed gold, pale sky, lamp
  orange. Why it is here: the eel-fishers have fished around her for a hundred years, and "the lamps that move" are hers.
- **fight:** A platform fight: she is in the water and you are on the stilts and boats.
  1. **Lunge:** she rises, her lamps flare and her neck coils into an S (1.2 s), then she strikes a platform. Her jaws
     lodge in the planks for 2 s, and that is when to hit the head.
  2. **Tail sweep:** far off, her tail breaks the surface and a ripple line runs toward a walkway (1.5 s), then the tail
     sweeps across it. Jump or roll to the next platform.
  3. **Lamp trick:** she dives, and one by one Reedholt's lamps go dark. She surfaces under the last one still lit, with
     a ring of bubbles under it 1.0 s before.
  4. **Spout:** lifts her head while her throat swells (0.8 s), then a jet of milky water knocks you toward the edge.
- **body plan:** serpent: no limbs (non-biped)
- **rig route:** C, a 24-bone chain from code with procedural swimming. Source: `tools/hero/springs.py` +
  `src/springs.js`. Higgsfield's rigger is biped-only (see Rig routes). The concept is drawn straight and side-on, mouth
  slightly open, fins flat, so the chain runs on a straight spine.
- **clips:** none from the 51. These are procedural states in JS: `swim`, `coil`, `lunge`, `stuck`, `dive`, `surface`,
  `spout`, `hit`, `death`.
- **cost:** 21.75 credits.

## 7. Stiltstalker
- **id:** `stiltstalker`
- **land:** Mirrormere (the reed beds)
- **role:** roamer
- **size:** 2.8 m (rig ×1.56)
- **look:** Silhouette: a heron made into a hunter. It has a long S-curved neck, a narrow head with a dagger beak as
  long as a forearm, a small hunched body, very long thin legs, and two thin arms folded close under a feather cloak. It
  carries a reed spear twice its height. Its feathers are grey-white fading to pale sky blue. The cloak is reed-gold
  feathers and woven reeds, the legs are black with turquoise mud to the knee, and the eye is lamp orange. Palette:
  turquoise, reed gold, pale sky, lamp orange. Its knees bend forward like ours (the clips need it), on long shins; the
  heron reads from the neck, beak and stance. Why it is here: it hunts the reeds as the herons do, and takes the
  eel-fishers' catch.
- **fight:** A reach duel, with the fastest wind-up in the game.
  1. **Spear strike** (`Stab`): its neck pulls back into an S and the spear draws in (0.5 s), then it strikes 3.5 m out.
     The spear sticks in the mud for 1 s: punish it then.
  2. **Lunge** (`Dash`): a 0.6 s crouch in the reeds, then it closes 6 m in a blink and stabs.
  3. **Push kick** (`Kick (Front)`): when you get close it draws one long leg up (0.5 s) and shoves you back out to
     spear range.
  4. **Reed vanish** (`Crouch Walk`): it sinks into the reed beds, and only the reeds moving show where it is.
- **body plan:** biped: long neck and shins (neck and head markers placed by hand)
- **rig route:** B +S (feather cloak, 4 chains) +P (reed spear from code).
- **clips:** `Idle`, `Walk`, `Crouch Walk`, `Stab`, `Dash`, `Kick (Front)`, `Jump`, `Hit (Front)`, `Stagger`,
  `Death (Collapse)`.
- **cost:** 21.75 credits.

## 8. The Tolling Warden
- **id:** `tolling-warden`
- **land:** Bellholm (the flooded ground floor of the Bell Tower)
- **role:** boss
- **size:** 3.4 m (rig ×1.89)
- **look:** Silhouette: a giant whose head is a great church bell. A broad bronze bell sits on its shoulders, mouth
  down, with no face. It has huge shoulders, a barrel chest and short thick legs, and it drags a ship's anchor on a chain
  from its right fist. The bell is verdigris bronze, sea green with pale patina streaks and white salt crust. The body
  is grey stone masonry with weed in the joints, like a drowned wall. The anchor is black-green iron and the chain is
  rust. A clapper hangs inside the bell, so every step clanks. Palette: grey stone, verdigris, sea green, white surf. Why
  it is here: the tower's lowest bell fell when the sea broke through, and whatever wears it now rings the tide.
- **fight:** It teaches rhythm: it attacks on the bell's beat, and the arena shrinks.
  1. **The Toll** (`Channel (Two-Handed)`): lifts both hands to the rim of its bell (1.2 s), then strikes it. A ring of
     sound (`ctx.vfx.blast`, 7 m) knocks you down unless you roll through it or stand beyond it. The tolls come on a
     count of four of its steps, and the count gets faster as the tide rises.
  2. **Anchor fall** (`Hammer Overhead Smash`): hauls the anchor overhead, chain rattling (1.0 s), and slams it down,
     cracking the flagstones. The anchor stays down 1.2 s.
  3. **Chain round** (`Greatsword Swing`): swings the anchor round on the full chain as it pays out (1.3 s): a 360°
     sweep at 6 m. Get inside 2 m or jump the chain.
  4. **Reel** (`Throw`): hurls the anchor along the floor and drags it back, so dodge it twice.
  The tide floods the floor as the fight goes on (the tide clock in `bellholm.js`), driving you toward the stair; standing
  water shortens your roll. It dies by crashing down, and the bell tolls once more.
- **body plan:** biped with a bell for a head (head marker placed by hand at the neck)
- **rig route:** B +R (the bell 100 % on `head`) +S (the clapper as a 1-bone chain; the anchor chain as 8 bones)
  +P (anchor from code, `tools/bestiary/anchor.py`).
- **clips:** `Idle`, `Walk`, `Channel (Two-Handed)`, `Hammer Overhead Smash`, `Greatsword Swing`, `Throw`,
  `Hit (Front)`, `Stagger`, `Death (Collapse)`.
- **cost:** 21.75 credits.

## 9. Scarhorn
- **id:** `scarhorn`
- **land:** The Greyspine (the switchbacks up to the Windgap)
- **role:** roamer
- **size:** 2.6 m (rig ×1.44)
- **look:** Silhouette: a broad, hump-shouldered biped with a massive pair of spiralling ram horns that curl forward
  past its face. It stands on bowed, thick legs with hooves, long shaggy fleece hangs from its arms and belly, and it
  leans forward with its head low, always about to charge. The fleece is granite grey with snow clotted in it, with
  pine-green lichen on the shoulders. The horns are pale ridged bone with sky-blue ice in the grooves, and the hooves
  are black. Palette: granite, pine, snow, sky blue. Why it is here: the mountain goats grown into a guard of the only
  path, which it treats as its own.
- **fight:** It teaches footing on a narrow path with a drop.
  1. **Ram charge** (`Kimodo: ram_charge`): paws the ground and lowers its horns, kicking scree back (0.8 s), then
     charges 12 m in a straight line. A hit throws you 4 m, off the path if your back is to the drop. Dodge so that it
     charges into the rock wall: its horns stick, a 2 s stun (`Stagger`).
  2. **Stomp** (`AoE Ground Slam`): rears up (1.0 s) and stomps, and loose scree slides down onto the path below.
  3. **Double fist** (`Hammer Overhead Smash`): 0.9 s, close range.
  4. **Hoof kick** (`Kick (Front)`): 0.5 s; it pushes you back out to charging distance.
- **body plan:** biped with hoofed feet and a heavy horned head
- **rig route:** B +S (fleece from the arms and belly as 4 chains). The horns are rigid on the head. The charge is one
  free Kimodo clip ("a person lowers their head and charges forward hunched over, then skids to a stop").
- **clips:** `Idle`, `Walk`, `Run`, `Kimodo: ram_charge`, `AoE Ground Slam`, `Hammer Overhead Smash`, `Kick (Front)`,
  `Hit (Front)`, `Stagger`, `Death (Collapse)`.
- **cost:** 21.75 credits.

## 10. The Gapshrike
- **id:** `gapshrike`
- **land:** The Greyspine (the broken towers of the Windgap Gate)
- **role:** guardian
- **size:** 2.4 m tall, 7 m wingspan (rig ×1.33)
- **look:** Silhouette: an eagle-headed, eagle-legged biped with a hooked beak and a ruff of feathers. Two arms end in
  long talon hands, and a pair of great wings grows from its back: a separate pair, not its arms. On the ground it
  mantles the wings over itself like a cloak. The feathers are granite grey and dark pine brown, the head and ruff are
  snow white, the eyes sky blue, the talons black, and the wingtips are frayed by the wind. Palette: granite, pine, snow,
  sky blue. Concept note: the wings are drawn raised up and out in a V above the T-posed arms, with clear space between.
  Why it is here: it nests in the Gate and rides the gale that pours through the only notch in the Greyspine.
- **fight:** An air foe: you can only hit it on the ground, and you read it by its shadow.
  1. **Stoop** (`Dive`): climbs into the wind with a shriek while its shadow shrinks to a point over you (1.2 s), then
     stoops down the wind line. Roll out of the shadow. After a stoop it lands with its wings mantled for 2 s: the
     window.
  2. **Talon rake** (`Slash (Diagonal)` from `Fly (Hover)`): hovers at head height with the talons drawn back (0.7 s),
     then rakes. Block it or roll under.
  3. **Stone drop** (`Throw`): carries a stone up while the stone's shadow grows on the ground (1.0 s), then drops it.
  4. **Gale** (`Channel (Two-Handed)`, on the ground, wings beating): 1.0 s, then a gust pushes you toward the Gate's
     drop, on top of the Gate's own wind (`ctx.windAt`).
  It dies by falling out of the air.
- **body plan:** winged biped. Its body is a plain biped and plays the 51 clips; the wings are extra chains.
- **rig route:** B +S. Each wing is a 4-bone `spring_wing_l/r` chain parented to `upperChest`, found by position
  (above the shoulder line, outside the torso), plus a tail fan as 1 chain. In flight the wings are driven procedurally
  (a flap wave down the chain at ~1 Hz, held spread to glide); on the ground they are folded to a fixed pose, with the
  springs in between.
- **clips:** `Idle`, `Walk`, `Fly (Forward)`, `Fly (Hover)`, `Dive`, `Slash (Diagonal)`, `Throw`,
  `Channel (Two-Handed)`, `Hit (Front)`, `Stagger`, `Death (Collapse)`.
- **cost:** 21.75 credits.

## 11. Ribmites
- **id:** `ribmite-swarm`
- **land:** The Redwaste (in and around the Dragon's Ribs)
- **role:** roamer (one swarm of 40–60)
- **size:** each 0.3 m long; a swarm covers ~8 m
- **look:** Silhouette: one ribmite is a flat, fist-sized beetle with a long wedge head and six spindly legs. The swarm
  is a moving rust-red carpet that pours out of the Ribs like sand through fingers. The shell is rust red with ochre
  stripes, the legs and jaws are bone white, and the shell is polished by sand so it flashes hard blue sky. Palette: rust,
  ochre, bone, hard blue sky. Why it is here: they eat the marrow of the dragon's bones and bore the holes that whistle in
  the desert wind.
- **fight:** It teaches crowds: sweeping weapons beat precise ones. Each mite dies to one hit, and the swarm's count is
  its health bar.
  1. **Pour:** the sand hisses and the bones' shadows seem to crawl (1.0 s), then the swarm streams at you in a line.
  2. **Ring:** they circle you and close in (1.5 s). Break out with a wide swing, or roll out.
  3. **Burrow ambush:** the sand bulges in a circle (0.8 s), then they erupt under you.
  4. **Cling:** a mite that reaches you clings on and slows you. Roll to shake them off.
- **body plan:** swarm of six-legged beetles (non-biped)
- **rig route:** I: one rigid mesh from code, instanced, with a TSL leg wiggle and boids. Source: `src/field.js` +
  `src/vfx.js`. No bones, so no rigger is needed.
- **clips:** none. These are procedural states in JS: `pour`, `circle`, `burrow`, `erupt`, `cling`, `scatter`, `die`
  (each a set of boids weights).
- **cost:** 2.75 credits (concept only). The mesh is built from code (`tools/bestiary/ribmite.py`, free): at 0.3 m and
  seen 40 at a time it does not need Hunyuan3D's detail.

## 12. The Marrowkeeper
- **id:** `marrowkeeper`
- **land:** The Redwaste (inside the Dragon's Ribs)
- **role:** boss
- **size:** 3.5 m (rig ×1.94)
- **look:** Silhouette: a gaunt giant, all long bones, with arms reaching past its knees and ending in three hooked
  claws. It is wrapped in a coat of the dead dragon's scales (big overlapping plates, like a shingled roof), a long
  tattered sail-cloth cape streams behind it in the wind, and its narrow skull-like head sits in a ragged nomad hood. The
  scales are bone white, bleached by the sun; the skin is rust red; the cloth is faded ochre; the claws are bone. Heat
  shimmer rises off it. Palette: rust, ochre, bone, hard blue sky. Why it is here: it keeps the dragon's bones. The
  ribmites are its herd and the Ribs are its house.
- **fight:** It teaches finding the real one by its shadow.
  1. **Mirage** (`Summon`): the air around it wobbles (1.0 s), then two shimmer copies step out and fight beside it.
     The copies cast no shadow in the hard desert sun, and one hit pops a copy.
  2. **Claw rake** (`Slash (Diagonal)`): claws drawn back over its shoulder (0.7 s), then a long diagonal rake.
  3. **Bone volley** (`Throw`): pulls shards from its coat (0.9 s) and throws three in a fan.
  4. **Sand burst** (`AoE Ground Slam`): the sand darkens in a circle (1.1 s), then bursts upward, half-burying you
     (slowed) if you are caught in it.
- **body plan:** biped: very long arms
- **rig route:** B +S (the cape as 6 chains, the hem route). The scale coat is skinned with the body. The mirages are the
  same skinned mesh drawn twice more with a shimmer material and no shadow, so they need no new asset.
- **clips:** `Idle`, `Walk`, `Run`, `Summon`, `Slash (Diagonal)`, `Throw`, `AoE Ground Slam`, `Hit (Front)`, `Stagger`,
  `Death (Collapse)`.
- **cost:** 21.75 credits.

## 13. The Rime Warden
- **id:** `rime-warden`
- **land:** Wyrmcrown (the last ice shelf below the nest)
- **role:** guardian
- **size:** 4.5 m (rig ×2.5)
- **look:** Silhouette: a huge, blocky biped of glacier ice. Wide shoulders are crowned by a ring of jagged pinnacles
  like the Crown itself, with short legs, long heavy arms, and a small head sunk between the shoulders. It is not alive.
  `WORLD.md` says the dragon lives up here alone, and that stays true: the warden is the Crown's own ice, standing up.
  Frozen things show through the ice: boulders, a climber's axe, a coil of old rope. It has a white snow crust over an
  ice-blue body, shadow violet in the deep ice, and aurora-green light in the cracks. Palette: white, ice blue, shadow
  violet, aurora green. Why it is here: the glacier carves the Crown steeper every year, and what it carves stands up
  when anyone comes near the nest.
- **fight:** It teaches armour break: light hits bounce off, heavy hits crack it.
  1. **Spike ring** (`AoE Ground Slam`): raises both fists while frost spreads white over the ground (1.2 s), then ice
     spikes burst up in a ring 5 m out. Stand close inside the ring or well outside it.
  2. **Ice blade** (`Greatsword Swing`): a blade of ice grows from its right forearm (1.0 s), then a wide sweep.
  3. **Ice wall** (`Block`): a wall rises in front of it, and hits do nothing until a heavy hit shatters it.
  4. **Hail** (`Channel (Two-Handed)`): its cracks glow aurora green (1.5 s), then hail falls on marked circles.
  In phase 2, after enough heavy hits, its outer shell cracks off in shards, the core glows green, and it speeds up.
  It dies by shattering.
- **body plan:** biped: blocky, heavy arms
- **rig route:** B +R (the pinnacle crown 100 % on `upperChest`) +P (the ice blade from code, scaled up on the
  forearm).
- **clips:** `Idle`, `Walk`, `AoE Ground Slam`, `Greatsword Swing`, `Block`, `Channel (Two-Handed)`, `Hit (Front)`,
  `Stagger`, `Death (Collapse)`.
- **cost:** 21.75 credits.
