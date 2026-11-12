#!/bin/bash
# The Stiltstalker end to end on the Mac Studio, from the desk: tools/bestiary/studio-rig.sh with the hand-placed
# markers, then fix_rig.py (ankles onto the toe splay, Spine2 under the long neck) and the skeleton picture redrawn from
# the fixed rig, then the entry's clips with OFFS (pose_offset.py) → public/models/bestiary/stiltstalker.glb.
#   art/bestiary/stiltstalker/build.sh        -> skeleton.png, markers.png, idle.png, the glb
set -euo pipefail
cd "$(dirname "$0")/../../.."
A=art/bestiary/stiltstalker; R=dm-rig/bestiary/stiltstalker; B=/Applications/Blender.app/Contents/MacOS/Blender
CLIPS=("Idle" "Walk" "Crouch Walk" "Stab" "Dash" "Kick (Front)" "Jump" "Hit (Front)" "Stagger" "Death (Collapse)")
OFFS=(${OFFS-})
tools/bestiary/studio-rig.sh stiltstalker rig $A/markers-fixed.json | grep -E 'note|SCALE'
rsync -a $A/fix_rig.py guru-studio:$R/
ssh -4 guru-studio "cd $R && $B -b -noaudio -P fix_rig.py -- rig.fbx rig.fbx 2>&1 | grep -E 'FIXRIG|Error|Traceback' &&
  $B -b -noaudio -P fbx2blend.py -- rig.fbx rig.blend 2>&1 | grep -E 'Error|Traceback' ;
  $B -b -noaudio -P skel_tex.py -- rig.blend \$PWD/skel.png 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python overlay_draw.py \$PWD/skel.png >/dev/null &&
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; im=Image.open('skel.png'); im.resize((im.width*2//5, im.height*2//5)).save('skel-small.png')\""
rsync -a guru-studio:$R/skel-small.png $A/skeleton.png
tools/bestiary/studio-rig.sh stiltstalker clips "${CLIPS[@]}" ${OFFS[@]+-- "${OFFS[@]}"} | tail -1
