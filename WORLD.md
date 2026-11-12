# Asterholm — the world around Dragon Meadow

Map: `art/world-map.svg`. North = −Z (the hero starts at world (0, 0) facing north, toward the cliff). 1 map px = 5 m. Positions below are world metres (X east, Z south).

## The world in one paragraph

Asterholm is one island, about 5 km by 3.5 km, in a cold northern sea. Wet westerly winds come off the ocean, climb the Greyspine — a block of granite tilted up along a fault, a long gentle slope on its west side and a sheer wall on its east — and drop their rain on the way up. So the west is green and full of water, and the east, in the mountains' rain shadow, is red desert. Every river starts either at Wyrmcrown's glacier, where the winter dragon nests, or at the springs under Dragon Meadow's chalk, and all of them run downhill into Mirrormere. The sea is slowly eating the north coast: the chalk cliffs lose a little every winter, and the town that once stood on the headland is now an island. One cause explains the opening scene: on sunny days the land warms, a sea breeze blows in over the cliff, and that same breeze carries the fog that fills the meadow and gives the dragon the rising air it circles on.

## How Asterholm looks — day and night (Phase 6)

The pictures are the spec: `refs/world/mix-day.png` (**the master picture** — the meadow by day from the start; its castle is
too white and spired, the castle follows `mix-settlements.png`), `refs/world/island.png` (the whole island at dusk),
`refs/world/mix-settlements.png` (town, castle and city at dusk), `refs/world/night.png` (the meadow at night). Match their
mood, palette and parts, not their painted detail.

- **By day — the world of Eddie's reference videos.** Crisp, stylized 3D under a warm blue sky with cream cumulus. Dense,
  saturated yellow-green grass full of small flowers; water so still it mirrors everything; flocks of birds; soft depth of
  field and a little bloom. Sea fog comes and goes: it fills the hollows, then thins and shows what it hid. Nothing neon.
- **By night — the Pandora glow.** Deep indigo sky, stars, a slow green-violet aurora. The land lights itself: grass tips,
  ferns, vines, flowers, moss. Seed lights drift up. The towns' windows burn warm gold against it.
- **Day and night share the scale and the wonder.** Colossal pale vine trees with curtains of hanging vines; giant bell
  flowers (2–4 m) and spiral ferns (1–2 m) at the meadow edges; skystone isles floating overhead, pouring waterfalls that
  turn to mist before they land.

**The world rule — why it glows.** Asterholm's plants drink sunlight by day and give it back at night. Pressure wakes them:
a footstep sends a ring of light through the grass (~3 m, fading over ~2 s). So the glow follows the weather — brightest
after a clear day, faint after a day of fog.

**The glow colour rule**, so every land reads the same way at night:

| what | where it glows | colour |
|---|---|---|
| grass, vines, moss, lichen | tips and veins | cool — teal, cyan, green |
| ferns | vein lines | violet |
| flowers, fungus | from inside | warm — gold, amber |
| sea and lake life (surf, tide pools, weed) | sparks and swirls | blue-cyan |
| ice | from deep inside | ice blue; aurora green in cracks |
| people (windows, lanterns, beacons) | steady, with chimney smoke | lamp orange-gold |

Living light sways and pulses; people's light holds still. That is how you find a town at night.

**Skystone.** A pale stone that floats. Five to nine skystone isles, 40–200 m across, drift 150–600 m up and 0.5–3 km
out from the meadow, most of them toward the sea and Wyrmcrown (exact places: `src/skyisles.js`). Trees on top, roots
hanging below, a slow bob. *Why they pour water:* the isles drink cloud — the sea fog condenses on their cold stone and
their trees, gathers in springs, and runs off the edges. Day: bone-pale stone, green crowns, white falls. Night: hanging
vines cyan, the falls faintly lit by them.

## The lands

Each land keeps a narrow day palette and a night palette (4–6 colours each), one landmark you can see from the land next
door, and its own share of the glow.

**1. Dragon Meadow** — *you start here* · (0, 0)
- Look: rolling chalk downs under dense, thigh-high grass thick with small flowers — the opening of `mix-day.png`. Drifts
  of giant bell flowers and spiral ferns at the edges; groves of colossal pale vine trees on the rises, their vine
  curtains swaying; skystone isles overhead. Ahead-left on the cliff headland, Castle Crestwatch. Near the start, a
  towering rock island (80–120 m) stands out of a mirror-still pond — round puff trees on top, a cottage with a smoking
  chimney and a big pale egg stone, lanterns on the shore. It is a skystone isle that lost its lift and came down long
  ago; the egg stone is the last of its skystone, light enough to rock with one hand. Sea fog comes and goes in the
  hollows, and the landmarks are what it shows when it thins. Flocks of birds wheel over the grass.
- Day: grass saturated yellow-green with pale gold tips, poppy red, buttercup yellow, daisy white, bell-flower lilac and
  peach, chalk white, warm blue sky with cream clouds.
- Night: grass deep jade going teal, fern violet, bell gold, indigo sky, aurora green-violet.
- Glows: grass tips (teal-cyan) and the light ring at every footstep; small pale star flowers; bell flowers (gold, from
  inside); fern veins (violet); vine curtains (cyan-green); drifting seed lights; the pond's lanterns doubled in the
  water; the Crest Stone's carved lines; the Old Ring's moss.
- Feel: wide, calm, windy — the first breath of the game.
- Lives: sheep, hares, skylarks and wheeling flocks; the winter dragon circling overhead; a troll asleep in the Old Ring.
- Landmark: **the Crest Stone**, a leaning standing stone on the cliff top, its seaward side carved into a giant stone
  face looking out over the sea. Dark against the sea haze by day; its carved lines glow-veined at night like the ring
  stones.

**2. The Undercliff** · (0, −340)
- Look: 65 m white chalk cliffs over a grey shingle beach; tide pools, sea caves, chalk stacks and arches (`island.png`,
  left). Green turf and hanging bell flowers along the cliff lip; clear turquoise shallows over pale shingle, deep blue
  beyond; thin spring falls down the cliff face.
- Day: chalk white, turquoise shallows, deep sea blue, slate, foam, kelp bronze.
- Night: chalk faint lilac in the moonlight, sea blue-black, surf cyan.
- Glows: the surf — every breaking wave lights blue-cyan with sea-glow; anemones in the tide pools; the glass floats on
  the Driftwight's nets (foam green).
- Feel: loud, cold, salt spray — the meadow's calm turned upside down.
- Lives: gulls and puffins on the ledges, seals on the rocks, crabs, an old beachcomber in a cave.
- Landmark: **the Needle**, a chalk sea stack with an arch punched through it.

**3. Bellholm** · (−1190, −750)
- Look: a small green tidal island ringed by drowned roofs — the headland town the sea took, its streets under the
  shallows. Sea thrift in pink cushions on the walls; Castle Crestwatch on the cliffs to the east still watching it.
- Day: grey stacked stone, verdigris green, sea green over the drowned streets, white surf, thrift pink.
- Night: the drowned town lit from below — weed in its windows glows teal under the water; the fishers' few lamps
  orange above it; the causeway outlined in surf-glow at low tide.
- Glows: drowned weed (teal), surf (blue-cyan), the fishers' lamps (lamp orange).
- Feel: lonely and beautiful, half under water.
- Lives: a few fishers, seals, crabs in the flooded cellars.
- Landmark: **the Bell Tower**, leaning; the tide swings its bells, and on still days you hear them from the meadow.

**4. Lanternwood** · (100, 975)
- Look: the old forest in the clay vale below the downs — colossal pale vine trees with buttressed trunks and curtains
  of hanging vines, old oaks between them, moss, honey light shafts, fireflies at dusk (`island.png`, right). Spiral
  ferns and bell flowers on the floor. Springwell on its north edge.
- Day: deep jade canopy, bone-pale bark, moss green, honey light, firefly gold.
- Night: vine curtains cyan-green, fungus and hollow trunks glowing gold from the roots up, ferns violet.
- Glows: vines (cyan-green), fungus and the hollows of the great trees (gold), fireflies and Lantern-caps (gold), fern
  veins (violet).
- Feel: sheltered, deep, a little magical.
- Lives: deer, boar, owls; the town of Springwell, where the stream rises.
- Landmark: **the Lantern Oak**, a giant hollow oak glowing inside with fungus.

**5. Mirrormere** · (−1000, 1560)
- Look: a wide, mirror-still, milky-turquoise lake with reed beds and lily pads, small falls where the Brightwater
  enters, Reedholt's walkways and lamps on the water (`island.png`, centre).
- Day: turquoise, reed gold, lily pink, pale sky.
- Night: the water holds the aurora and the stars; lamp orange from Reedholt.
- Glows: lily flowers (soft gold-pink, from inside), reed tips (teal), Reedholt's lamps doubled in the water — and Old
  Glim's flank lamps, which look just like them.
- Feel: slow and quiet — the place to rest.
- Lives: herons, eels, frogs; the eel-fishers of Reedholt.
- Landmark: **Reedholt**, a village on stilts in the middle of the water, its lamps doubled in the reflection.
- Why turquoise: the Coldrun carries rock flour ground by Wyrmcrown's glacier, and it hangs in the still water. The dragon's mountain colours the lake.

**6. The Greyspine** · Windgap at (1525, 1300)
- Look: rose-grey granite ridges, pine on the wet west slopes, scree, cold tarns, snow on the tops, white falls down the
  rock faces and cloud banks in the valleys (`island.png`, the range).
- Day: rose granite, pine green, snow white, tarn blue, sky blue.
- Night: snow blue-violet under the aurora, the tarns holding stars.
- Glows: lichen veins on the granite (faint green), the tarns (ice blue, glacier light). No warm light: the Windgap Gate
  stays dark.
- Feel: hard climbing, huge views, wind.
- Lives: goats, eagles, wolves.
- Landmark: **the Windgap Gate**, a ruined fortress gate built across the only pass.

**7. The Redwaste** · (2550, 1560)
- Look: red sandstone mesas, dunes, a white salt pan, heat shimmer; the Ribs arching out of the sand.
- Day: rust, ochre, bone, salt white, hard blue sky.
- Night: sand deep plum, salt pan pale lilac, the sky clearest on the island — the Milky Way over the dunes.
- Glows: the salt pan (a pale sheen: the salt drinks the sun too), the Dragon's Ribs (a faint ember inside the bone),
  the nomads' fires (lamp orange).
- Feel: vast, hot, silent.
- Lives: lizards, sand beetles, a nomad camp.
- Landmark: **the Dragon's Ribs**, the bones of an ancient dragon arching out of the dunes, big enough to walk through.

**8. Wyrmcrown** · (1825, −325)
- Look: the island's highest peak; its summit a ring of ice pinnacles around a frozen bowl, a glacier down its flank;
  rose alpenglow at dusk.
- Day: white, ice blue, shadow violet, alpenglow rose.
- Night: the aurora hangs lowest and brightest over the Crown, green and violet; ice blue-black.
- Glows: glacier ice (ice blue, from deep inside), the Rime Warden's cracks (aurora green).
- Feel: thin air, silence, awe — the end of the road.
- Lives: the winter dragon, alone.
- Landmark: **the Crown** itself — seen from every land; it is the island's compass.

## Towns, castles and cities

Eddie: *"We should add towns, and castles, and cities."* Three new places; the two old ones stay. The rules for all of
them (the Sanctuary lesson): castles are HUGE and mostly grey stone, not Disney; every wall reads as STACKED stone with
visible courses, never plaster; windows glow warm at night and chimneys smoke; they emerge from the haze rather than
standing in front of it. Built from `public/models/world/town-kit.glb` and `castle-kit.glb` by `src/settlements.js`,
everything on `ctx.heightAt`, each pushing its footprint into `ctx.keepClear`.

| place | kind | where (world m) | first seen |
|---|---|---|---|
| Castle Crestwatch | castle | (−520, −240), cliff headland, Dragon Meadow | from the start, ahead-left (`mix-day.png`) |
| Springwell | town (grown from the woodcutters' village) | (−75, 500), foot of the Holloway | stepping out of the Holloway (`mix-settlements.png`) |
| Asterhaven | harbour city | (−1500, 650), where the Spill meets the sea | far off from the meadow's rise, across the island |
| Reedholt | stilt village (kept) | Mirrormere | its lamps doubled in the lake |
| The Windgap Gate | ruined fortress (kept) | (1525, 1300) | from the switchbacks |

**Castle Crestwatch** · (−520, −240) — on the highest chalk of the cliff headland, 570 m west-north-west of the start
- Look: a huge grey castle on the cliff edge (as in `mix-settlements.png`, right): a 50 m keep with battlements, corner
  turrets and tall arched windows; a curtain wall with 6–8 round and square towers, their conical roofs grey slate; a
  gatehouse with a portcullis; a road winding down the downs to the meadow. Grey flint-and-ragstone in stacked courses,
  ivy and vines up the seaward wall, long slate-blue banners. The castle cistern overflows down the cliff face in a thin
  white waterfall.
- Day: stone grey, slate blue-grey, chalk white below, banner blue with a white star-flower, ivy green.
- Night: every arrow-slit and hall window gold; the **beacon** on the keep's roof burning orange; the cliff-face vines
  cyan; the waterfall a pale thread in the dark.
- Glows: windows and the beacon (lamp gold); vines on the walls (cyan); moss in the old mortar (faint green).
- People: the Crest Watch — a garrison of about thirty and their families under the Warden of the Crest; beacon-keepers
  who log every flight of the dragon in the Wyrm Book; a bell-ringer who answers Bellholm's bells so walkers on the
  causeway know to run.
- Landmark: **the beacon on the keep**, the one warm light on the north cliffs, seen from the meadow every night.
- Why it stands there: before the sea broke through, the headland ran another 800 m out to a harbour town at its tip.
  Crestwatch was that town's castle, raised on the highest chalk so its beacon reached ships out in the north sea. The
  sea took the town — it is Bellholm now, ringed by its drowned roofs — and left the castle on the high ground, still
  keeping the light. The cliff is coming for it too: one corner tower already hangs over the edge.

**Springwell** · (−75, 500) — the town where the Holloway comes out, between the downs and Lanternwood
- Look: a market town of 12–20 houses, grown from the woodcutters' village. Grey-gold greensand and flint in stacked
  courses, red clay and slate roofs, timber trim, wisteria over the doors, smoke from every chimney. A church with a
  belfry; the spring rising into a stone well-house in the square; an arched stone bridge over the young Brightwater.
  The Holloway arrives as a cobbled lane between low stone walls lined with lanterns (`mix-settlements.png`, foreground).
- Day: stone grey-gold, roof red and slate, timber brown, wisteria lilac, stream turquoise.
- Night: every window gold, a lantern on each wall post down the lane, the bridge and the windows doubled in the stream,
  chimney smoke grey-violet under the aurora.
- Glows: windows and lanterns (lamp gold); wisteria and garden bell flowers (warm, from inside); vines on the walls
  (cyan); the Brightwater's weed (blue-cyan swirls).
- People: woodcutters, raftwrights who build the Brightwater rafts, millers, spring-keepers, an inn; market day pulls in
  shepherds from the downs and eel-traders up from the lake.
- Landmark: **the Wellhead**, the spring's stone well-house, with the church belfry over it.
- Why it stands there: rain soaks through the chalk and comes out where chalk meets clay — clean water all year, the
  same spring line where the forest begins. It grew into a town because three ways meet at it: the Holloway up to the
  meadow, the Brightwater down to Mirrormere (the rafts launch at its bridge), and the forest road east to the Rootbridge.

**Asterhaven** · (−1500, 650) — the island's one city, on the west coast where the Spill meets the sea
- Look: a walled hill of a few hundred houses climbing to a palace with a pale dome; below, a harbour of tall ships
  behind a long sea wall (`mix-settlements.png`, centre). Seen only far off — across the island from the meadow's rise, a
  pale crown of roofs on the west coast; from above Springwell at sunset, a silhouette against the sun on the sea. Far
  detail only: a few hundred merged houses, the wall, the palace, masts.
- Day: stone grey-gold, roofs red and slate, the dome pale cream, sea teal, sails white.
- Night: thousands of warm windows; the palace dome lit from inside; the harbour's chain of lanterns doubled in the
  water; sea-glow in the wake of every ship.
- Glows: windows, the dome, harbour lanterns (lamp gold); the harbour water (blue-cyan sea-glow).
- People: merchants, shipwrights, sailors, the island's council in the palace; Reedholt's eel-traders and Bellholm's
  fishers sell on its quays.
- Landmark: **the Domed Palace** on the hilltop, its dome lit every night — the light the ships steer home by.
- Why it stands there: the Spill is the lake's only way to the sea, and the coast is otherwise all cliff and surf. The
  same coast drift that piles shingle into Bellholm's causeway pushes the Spill's mouth north behind a long shingle spit,
  so the river meets the sea in a sheltered lagoon — the one deep, calm harbour on the island. Everything the lake sells
  (eels, reed, the glacier's milky clay for potters) meets everything the sea brings there, and the eel-boat ferry calls
  at its quay on the way to Bellholm.

**Reedholt** (kept) — the eel-fishers' village on stilts in the middle of Mirrormere: timber houses with steep reed-thatch
roofs on piles, linked by walkways; lamp orange at dusk, every lamp doubled in the still water.

**The Windgap Gate** (kept) — a ruined fortress of grey granite across the only pass: broken towers, a fallen gate arch,
no roofs. Dark at night — no window is lit there, which is how you know nobody holds it.

## Connections — how you get from one land to the next

1. **Dragon Meadow ↔ the Undercliff — a cave: the Whistling Chimney** (−300, −190). A shaft drops from the meadow turf through the chalk into a sea cave at beach level. From the top it is a sheer, roaring hole; from the bottom an old chain ladder climbs it. *Why:* rain soaks into chalk and dissolves a pipe downward; the waves undercut the cliff and hollow a cave inward; the two met. The sea breeze blowing up the pipe makes it whistle.
2. **The Undercliff ↔ Bellholm — a tide causeway.** At low tide a shingle bar rises out of the sea and you walk across; at high tide it is gone. When the bells start, the tide is turning — run. *Why:* Bellholm was the tip of the meadow's headland until the sea broke through; waves running along the coast pile shingle in the island's shelter into a bar (a tombolo).
3. **Dragon Meadow ↔ Lanternwood — a sunken lane: the Holloway.** The meadow's south path sinks deeper between banks until the trees close over it, and you step out at Springwell (−75, 500). *Why:* the chalk tips gently south (the cliff is its broken north edge), and centuries of feet and rain wore the lane down into it. Rain soaks through the chalk and comes out as springs where chalk meets clay — that line is where the town sits and the forest begins.
4. **Lanternwood ↔ Mirrormere — a river: raft down the Brightwater.** From Springwell, raft downstream over two gentle weirs into the lake. *Why:* water runs downhill, and the whole wet west drains into one lake basin.
5. **Mirrormere ↔ Bellholm — a ferry.** The Reedholt eel-boat runs down the Spill to the sea, calls at Asterhaven's quay, and goes on north along the west coast to Bellholm. *Why:* the lake's only outlet is the Spill on the west coast, and the north shore is all cliff, so the boat is how lake and sea trade.
6. **Lanternwood ↔ the Greyspine — a bridge: the Rootbridge** (950, 850). A living bridge of tree roots across the Coldrun gorge, then switchbacks up through the pines. *Why:* the glacier river cut a deep gorge through the foothills. It is the wettest spot on the island (the westerlies drop their rain on the mountain front), so its trees are the biggest, and the old woodfolk trained their roots across.
7. **The Greyspine ↔ the Redwaste — a pass and a stair: the Windgap and the Thousand Steps.** The switchbacks top out at the Windgap Gate; beyond it the east face is a cliff, and the Thousand Steps zig-zag down to the sand. *Why:* the Greyspine is a tilted block — gentle west, sheer east. The wind pours through its one notch, and standing in the Gate you see green behind you and red ahead: the rain shadow in a single view.
8. **Anywhere ↔ Wyrmcrown — the dragon.** No path: the summit is ringed by ice cliffs the glacier keeps carving steeper. The only way up is on the dragon's back. Once it trusts you, it also carries you between landmarks (fast travel).

**Every connection is a narrow seam that hides what lies beyond** — a shaft, a sunken lane, a gorge, a pass, fog over water, open sky. Load the next land's module at that seam, so only one or two lands are ever in memory.

## The travel loop

1. **Dragon Meadow** — walk, watch the dragon; Castle Crestwatch on the cliff ahead-left, the rock island by its pond. The Chimney whistles; it is too sheer to climb down.
2. **The Old Ring** — the first fight.
3. **The Holloway** → the town of Springwell and **Lanternwood**.
4. **Raft** down the Brightwater → **Mirrormere**.
5. **Ferry** → Asterhaven's harbour → **Bellholm**.
6. Wait for low tide, cross the **causeway** → **the Undercliff** → up the Chimney's chain ladder → out into the meadow. The first loop closes where it began: the mystery hole from step 1 was the way home.
7. Back through Lanternwood → **the Rootbridge** → **the Greyspine** → the Windgap Gate.
8. **The Thousand Steps** → **the Redwaste** and the Dragon's Ribs.
9. **The dragon** → **Wyrmcrown**.

## The first monster — the Barrow Troll in the Old Ring

- **Where:** the meadow's east shoulder, ~370 m from the start at (325, 180) — inside the meadow's existing terrain, not a new land.
- **The arena:** a shallow chalk bowl ~60 m across, holding a ring of eleven standing stones around a grassy barrow mound. Three stones lie fallen.
- **The monster:** a 3 m, moss-backed troll asleep in the barrow. Two legs and two arms, so it fits our rigger and the attack / hit / death clips. Its club is a standing stone ripped out of the ring — which is why three are down.
- **Open ground:** grass trampled short inside the ring, so footwork, rolls, slash arcs and dust all read clearly.
- **Cover:** the fallen stones are waist-high; roll behind one and the club smashes it (chips, sparks, dust).
- **A clean stage:** the bowl's rim hides the far haze, and the stone circle bounds the fight without an invisible wall.
- **At night** (`refs/world/ring-night.png`): cyan-green moss veins glow on the stones, gold light spills from the barrow door, teal mist lies in the bowl. By day the same moss is soft green.
- **The visual moment:** mist pools in the bowl, and the troll's first roar blows it outward in a ring. When the troll falls, the sea breeze clears the last of it, the sun breaks through, and the dragon passes low overhead.

## The dragon's home

Wyrmcrown, 1.9 km east of the start, visible from the crest on clear days; at night the aurora hangs over it. The winter dragon nests in the frozen bowl inside the Crown. Its day: leave the nest, hunt seals and fish in the cold north sea, then ride the sea breeze where it hits the meadow cliff — rising air it can circle in without a wingbeat. That is why it is always over Dragon Meadow.

## Build order — one module per land, the way `src/field.js` is the meadow

Each module adds its own patch of ground to `ctx.heightAt` (wrapping the one before it) and blends into its neighbour at the seam.

| # | Module | Why next |
|---|---|---|
| 0 | `src/ring.js` — the Old Ring (inside the meadow) | The fight scene needs an arena now. Small: a bowl, eleven stones, pooled mist; reuses the meadow's grass and fog. |
| 1 | `src/undercliff.js` — beach, sea caves, the Needle, the Chimney | The cliff and sea already exist in `field.js`. It fixes the known gap (the sea lost in haze) and shows on screen why the dragon circles. |
| 2 | `src/lanternwood.js` — the Holloway, Springwell, the forest | The main road out. Trees are the biggest new technique, and every later land reuses them. |
| 3 | `src/mirrormere.js` — lake, reeds, Reedholt | Still water reuses the sea shader; the rest stop. |
| 4 | `src/bellholm.js` — island, tower, tide causeway | Closes the first loop; reuses the Undercliff kit; adds the tide clock. |
| 5 | `src/greyspine.js` — rock, pines, the Rootbridge, the Windgap | Opens the east; the first steep land. |
| 6 | `src/redwaste.js` — dunes, mesas, the Ribs | The strongest colour change, and a natural second arena. |
| 7 | `src/wyrmcrown.js` — summit, nest, glacier | Last: it needs riding the dragon. |

**Phase 6 modules run across every land, not one land each:** `src/settlements.js` (Crestwatch, Springwell, Asterhaven), `src/landmarks.js` (the rock island, the Crest Stone's face), `src/water.js` (the pond), `src/flora.js` (bell flowers, ferns, vine trees), `src/skyisles.js`, `src/motes.js` (seed lights), `src/birds.js`. A land module, when it comes, places its own share of them.
