#!/bin/bash
# The Stiltstalker end to end on the Mac Studio, from the desk: tools/bestiary/studio-rig.sh with the hand-placed
# markers, then fix_rig.py (ankles onto the toe splay, neck and head joints into the S-neck, rigid head turned to face
# ahead, the Drifter's rest axes on the torso-to-head bones) and the skeleton picture redrawn from the fixed rig,
# then the entry's clips with OFFS (pose_offset.py), Idle lowered onto its feet (drop.py) → public/models/bestiary/stiltstalker.glb.
#   art/bestiary/stiltstalker/build.sh        -> skeleton.png, markers.png, idle.png, feet.png, clips.png, the glb
# (clips_render.py and feet_render.py are copies of marrowkeeper's.)
set -euo pipefail
cd "$(dirname "$0")/../../.."
A=art/bestiary/stiltstalker; R=dm-rig/bestiary/stiltstalker; B=/Applications/Blender.app/Contents/MacOS/Blender
CLIPS=("Idle" "Walk" "Crouch Walk" "Stab" "Dash" "Kick (Front)" "Jump" "Hit (Front)" "Stagger" "Death (Collapse)")
# The Drifter's Idle looks 16 deg up: neck + head nod 4 + 6 so the beak sits level. The arms hang 20 deg out, clear of
# the cloak (they hang from narrow shoulders under it). Feet: the borrowed Idle tips the toe splay 18 deg toe-up onto the
# back toe; X,9 / X,8 bring it back to the rest tilt (front and back toe level), and that leaves the Idle standing
# 3.5 cm up, so DROP lowers its hips. feet_check.py prints the lowest front/back toe z per foot (flat = both within 2 cm).
OFFS=(${OFFS-neck=X,4 head=X,6 leftUpperArm=Y,-20 rightUpperArm=Y,20 leftFoot=X,9 rightFoot=X,8}); DROP=${DROP--0.035}
tools/bestiary/studio-rig.sh stiltstalker rig $A/markers-fixed.json | grep -E 'note|SCALE'
rsync -a $A/fix_rig.py guru-studio:$R/
ssh -4 guru-studio "cd $R && $B -b -noaudio -P fix_rig.py -- rig.fbx rig.fbx 2>&1 | grep -E 'FIXRIG|Error|Traceback' &&
  $B -b -noaudio -P fbx2blend.py -- rig.fbx rig.blend 2>&1 | grep -E 'Error|Traceback' ;
  $B -b -noaudio -P skel_tex.py -- rig.blend \$PWD/skel.png 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python overlay_draw.py \$PWD/skel.png >/dev/null &&
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; im=Image.open('skel.png'); im.resize((im.width*2//5, im.height*2//5)).save('skel-small.png')\""
rsync -a guru-studio:$R/skel-small.png $A/skeleton.png
tools/bestiary/studio-rig.sh stiltstalker clips "${CLIPS[@]}" ${OFFS[@]+-- "${OFFS[@]}"} | tail -1
rsync -a $A/drop.py $A/feet_check.py $A/feet_render.py $A/clips_render.py guru-studio:$R/
ssh -4 guru-studio "cd $R && $B -b -noaudio -P drop.py -- full.glb \$PWD/full.glb Idle $DROP 2>&1 | grep -E 'DROP|Error|Traceback|Assert' &&
  $B -b -noaudio -P feet_check.py -- full.glb Idle 0 8 16 24 32 40 48 2>&1 | grep -E 'FEET|Error|Traceback' &&
  $B -b -noaudio -P idle_render.py -- full.glb \$PWD/idle 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; a,b=Image.open('idle.front.png'),Image.open('idle.side.png'); o=Image.new('RGB',(1800,900)); o.paste(a,(0,0)); o.paste(b,(900,0)); o.save('idle.png')\" &&
  $B -b -noaudio -P feet_render.py -- full.glb \$PWD/feet.png 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python feet_render.py --sheet \$PWD/feet.png && rm -f clips.png.* &&
  $B -b -noaudio -P clips_render.py -- full.glb \$PWD/clips.png 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python clips_render.py --sheet \$PWD/clips.png"
rsync -a guru-studio:$R/idle.png guru-studio:$R/feet.png guru-studio:$R/clips.png $A/; rsync -a guru-studio:$R/full.glb $A/full.glb
$HOME/.local/homebrew/bin/python3.12 tools/hero/slim.py $A/full.glb public/models/bestiary/stiltstalker.glb | tail -1
