#!/bin/bash
# The Marrowkeeper end to end from its paid mesh, run from the desk (the work runs on the Mac Studio through
# tools/bestiary/studio-rig.sh): prep -> rig the paid mesh on hand-placed joints (its weights say what is arm) ->
# LONG arms (long_arms.py: only the bone shafts stretch) -> rig again on the long-armed mesh -> the entry's 10 clips ->
# idle check render -> public/models/bestiary/marrowkeeper.glb -> clips.png (every clip of the shipped glb).
# Offsets: the arms swing out 14 deg so the long hands hang clear of the legs; the hands twist 70 deg so the claws
# point forward instead of into the knees.
#   art/bestiary/marrowkeeper/build.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
A=art/bestiary/marrowkeeper; R=dm-rig/bestiary/marrowkeeper; B=/Applications/Blender.app/Contents/MacOS/Blender
ssh -4 guru-studio "mkdir -p $R"
rsync -a $A/hunyuan.glb tools/hero/prep.py $A/long_arms.py $A/clips_render.py guru-studio:$R/
ssh -4 guru-studio "cd $R && $B -b -noaudio -P prep.py -- hunyuan.glb clean-orig.glb 60000 2>&1 | grep -E '^PREP|Error' &&
  cp clean-orig.glb clean.glb"
tools/bestiary/studio-rig.sh marrowkeeper rig $A/markers-short.json | grep -E 'note|SCALE'
ssh -4 guru-studio "cd $R && cp rig.blend rig-short.blend &&
  $B -b -noaudio -P long_arms.py -- clean-orig.glb rig-short.blend \$PWD/clean.glb 0.25 2>&1 | grep -E 'LONGARMS|Error|Traceback'"
tools/bestiary/studio-rig.sh marrowkeeper rig $A/markers-fixed.json | grep -E 'note|SCALE'
tools/bestiary/studio-rig.sh marrowkeeper clips Idle Walk Run Summon "Slash (Diagonal)" Throw "AoE Ground Slam" \
  "Hit (Front)" Stagger "Death (Collapse)" -- leftUpperArm=Y,-14 rightUpperArm=Y,14 leftHand=X,-70 rightHand=X,-70 | tail -1
rsync -a public/models/bestiary/marrowkeeper.glb guru-studio:$R/ship.glb   # the sheet shows what ships (slimmed)
ssh -4 guru-studio "cd $R && rm -f clips.png*; $B -b -noaudio -P clips_render.py -- ship.glb \$PWD/clips.png 2>&1 | grep -E 'CLIPS|Error|Traceback';
  ~/dm-rig/venv/bin/python clips_render.py --sheet \$PWD/clips.png"
rsync -a guru-studio:$R/clips.png $A/clips.png
