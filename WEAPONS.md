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
