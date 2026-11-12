#!/bin/bash
# Rebuild the Gapshrike from its paid mesh, from the desk (the work runs on the Studio through studio-rig.sh):
# prep → wings folded into a knot on the back (wings.py fold: the autorig would take them for arms) → rig on the
# hand-placed joints → the entry's 11 clips → wings unfolded onto spring_wing_l/r + spring_tail chains (wings.py attach)
# → idle check render → public/models/bestiary/gapshrike.glb.   OFFS: pose offsets for pose_offset.py.
#   art/bestiary/gapshrike/build.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
D=art/bestiary/gapshrike; R=dm-rig/bestiary/gapshrike; B=/Applications/Blender.app/Contents/MacOS/Blender
CLIPS=("Idle" "Walk" "Fly (Forward)" "Fly (Hover)" "Dive" "Slash (Diagonal)" "Throw" "Channel (Two-Handed)"
       "Hit (Front)" "Stagger" "Death (Collapse)")
OFFS=(${OFFS-leftUpperArm=Y,-22 rightUpperArm=Y,22})   # the Idle hangs the talons inside the pouches without it
ssh -4 guru-studio "mkdir -p $R"
rsync -a $D/hunyuan.glb tools/hero/prep.py $D/wings.py guru-studio:$R/
ssh -4 guru-studio "cd $R && { [ -f clean-orig.glb ] || $B -b -noaudio -P prep.py -- hunyuan.glb clean-orig.glb 60000 2>&1 | grep -E '^PREP|Error'; } &&
  $B -b -noaudio -P wings.py -- fold clean-orig.glb \$PWD/clean.glb 2>&1 | grep -E 'WINGS|Error|Traceback'"
tools/bestiary/studio-rig.sh gapshrike rig $D/markers-fixed.json | grep -E 'AUTORIG|note'
tools/bestiary/studio-rig.sh gapshrike clips "${CLIPS[@]}" ${OFFS[@]+-- "${OFFS[@]}"} | tail -1
# shortcut: attach + the idle render re-run after studio-rig.sh's clips step, as driftwight's nets do
ssh -4 guru-studio "cd $R && $B -b -noaudio -P wings.py -- attach full.glb clean-orig.glb \$PWD/full.glb 2>&1 | grep -E 'WINGS|Error|Traceback|Assert' &&
  $B -b -noaudio -P idle_render.py -- full.glb \$PWD/idle 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; a,b=Image.open('idle.front.png'),Image.open('idle.side.png'); o=Image.new('RGB',(1800,900)); o.paste(a,(0,0)); o.paste(b,(900,0)); o.save('idle.png')\""
rsync -a guru-studio:$R/idle.png guru-studio:$R/full.glb $D/
$HOME/.local/homebrew/bin/python3.12 tools/hero/slim.py $D/full.glb public/models/bestiary/gapshrike.glb | tail -1
