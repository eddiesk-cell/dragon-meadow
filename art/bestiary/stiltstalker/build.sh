#!/bin/bash
# The Stiltstalker end to end on the Mac Studio, from the desk: tools/bestiary/studio-rig.sh with the hand-placed
# markers, then fix_rig.py (ankles onto the toe splay, neck and head joints into the S-neck, rigid head turned to face
# ahead, the Drifter's rest axes on the torso-to-head bones) and the skeleton picture redrawn from the fixed rig,
# then the entry's clips with OFFS (pose_offset.py) → public/models/bestiary/stiltstalker.glb.
#   art/bestiary/stiltstalker/build.sh        -> skeleton.png, markers.png, idle.png, the glb
set -euo pipefail
cd "$(dirname "$0")/../../.."
A=art/bestiary/stiltstalker; R=dm-rig/bestiary/stiltstalker; B=/Applications/Blender.app/Contents/MacOS/Blender
CLIPS=("Idle" "Walk" "Crouch Walk" "Stab" "Dash" "Kick (Front)" "Jump" "Hit (Front)" "Stagger" "Death (Collapse)")
# The Drifter's Idle looks 16 deg up: neck + head nod 4 + 6 so the beak sits level. The arms hang 20 deg out, clear of
# the cloak (they hang from narrow shoulders under it).
OFFS=(${OFFS-neck=X,4 head=X,6 leftUpperArm=Y,-20 rightUpperArm=Y,20})
tools/bestiary/studio-rig.sh stiltstalker rig $A/markers-fixed.json | grep -E 'note|SCALE'
rsync -a $A/fix_rig.py guru-studio:$R/
ssh -4 guru-studio "cd $R && $B -b -noaudio -P fix_rig.py -- rig.fbx rig.fbx 2>&1 | grep -E 'FIXRIG|Error|Traceback' &&
  $B -b -noaudio -P fbx2blend.py -- rig.fbx rig.blend 2>&1 | grep -E 'Error|Traceback' ;
  $B -b -noaudio -P skel_tex.py -- rig.blend \$PWD/skel.png 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python overlay_draw.py \$PWD/skel.png >/dev/null &&
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; im=Image.open('skel.png'); im.resize((im.width*2//5, im.height*2//5)).save('skel-small.png')\""
rsync -a guru-studio:$R/skel-small.png $A/skeleton.png
tools/bestiary/studio-rig.sh stiltstalker clips "${CLIPS[@]}" ${OFFS[@]+-- "${OFFS[@]}"} | tail -1
