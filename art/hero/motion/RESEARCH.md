# Hero motion — what a natural stance, walk and sprint look like (2026-11-13)

Eddie: "I want the hero arms to hang down more naturally, and when he runs I want a strong run like a person sprinting
arms position look off now. The arms swing when run is off, you should get the animation of a professional runner and
copy that."

## What is wrong today (`before-*.png`, 8 frames, side above, front below; `tools/hero/clipsheet.py`)
- **Idle / Walk** (the Drifter donor's clips, retargeted): the hands rest on the belt pouches with the elbows out, in
  every frame. The walk barely swings the arms.
- **Run / Sprint**: the arms are held tucked high at the chest with a small swing — a jogger's carry, not a pump.
- Kimodo's own sprint prompts on this rig (`kimodo-sprint_c-on-hero.png`, `kimodo-idle-on-hero.png`, via
  `~/ai-stack/kimodo/retarget/retarget.py`) come out hunched with the arms limp or held in front — no better as they are.

## Eddie's second look (2026-11-13)
Idle elbows out and awkward; leans back too much standing; feet not flat — the toes tilt up (likely why he leans back);
sprint head and shoulders wrong.

## Target numbers (elite and healthy adult kinematics; ranges from the sprint and gait literature —
Mann & Herman 1985, Hinrichs 1987 on the arms in running, Bezodis et al. on top-speed sprinting, Collins et al. 2009 and
Meyns et al. 2013 on arm swing in walking)

### Standing relaxed (Idle)
- Upper arm hangs within 0–10° of vertical, slightly abducted (5–10°) so the arm clears the hip and pouches.
- Elbow 5–20° flexed. Forearm and hand at the side, palm facing the thigh (neutral), hand beside the outer thigh at about
  mid-thigh height. Shoulders down and relaxed, not shrugged or rolled forward.
- Breathing / weight-shift sway is welcome; the hands never come up to the belt.

- Feet flat: sole on the ground, toe and heel at the same height (±2 cm). Body stacked: ear, shoulder, hip and ankle
  in one vertical line from the side (±4°), weight over the middle of the foot — no backward lean.

### Walking (Walk)
- Arm swing mostly from the shoulder, in the sagittal plane: about 15–20° forward and 10–20° back of vertical
  (total 25–40°), opposite to the same-side leg (left arm forward as the right foot strikes).
- Elbow 15–35°, flexing a little more on the forward swing. Hands pass close to the hip, never across the belly.

### Sprinting (Run — Shift in game; Sprint)
- Head in line with the spine, eyes forward, chin level — not tipped back or jutting. Shoulders low and relaxed,
  not shrugged or rounded; they turn with the arm pump 15° at most.
- Torso tall with a slight forward lean of 5–10° from vertical at top speed; head level, eyes forward.
- Shoulder flexion/extension in the sagittal plane: hand forward to about chin/shoulder height (shoulder flexion
  about 60–80°), back until the hand passes the hip pocket (extension about 40–60°): **a range of roughly 100–130°**.
- Elbow held near 90° through the cycle: closes to about 60–75° on the forward swing, opens to about 100–120° at the
  back of the swing. The arm does not straighten.
- Arms drive straight forward and back; the hands cross the body's midline little or not at all (forward swing turns
  inward 10° at most). Hands loose (relaxed curl), wrists neutral.
- Timing: each arm is opposite its leg; the forward arm peaks as the opposite foot strikes. One arm cycle = one stride
  (two steps). Top-speed step rate about 4.3–4.8 steps/s for elites; a game hero can run slower, but stride length and
  step rate must match his ground speed so the planted foot does not skate.
- Legs: high knee drive (front thigh to near horizontal), heel recovers up under the hips, foot lands under the body.

## Reference picture
`ref-sprint-stand-walk.png` — top row: one sprint stride from the side in eight phases; bottom row: standing relaxed
(front, side) and four walk phases.
