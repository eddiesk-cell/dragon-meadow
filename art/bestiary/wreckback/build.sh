#!/bin/bash
# Wreckback end to end on the Mac Studio, from the desk: tools/bestiary/studio-rig.sh plus the two steps it cannot do
# (wreck.py: Eddie's LONG arms, and the hull/kelp/claw made rigid). K = arm stretch; offsets go to pose_offset.py.
#   art/bestiary/wreckback/build.sh            -> skeleton.png, idle.png, public/models/bestiary/wreckback.glb
set -euo pipefail
cd "$(dirname "$0")/../../.."
A=art/bestiary/wreckback; R=dm-rig/bestiary/wreckback; B=/Applications/Blender.app/Contents/MacOS/Blender; K=${K:-1.6}
CLIPS=("Idle" "Walk" "Crouch Walk" "Dash" "Block" "Hammer Overhead Smash" "Slash (Horizontal)" "Hit (Front)" "Stagger" "Death (Collapse)")
OFFS=(${OFFS-leftUpperArm=Y,-30 rightUpperArm=Y,30})   # the Idle swings the long arms into the skirt
ssh -4 guru-studio "mkdir -p $R && cd $R && { [ -f clean-orig.glb ] && cp clean-orig.glb clean.glb || rm -f clean.glb; }"
tools/bestiary/studio-rig.sh wreckback rig $A/markers-short.json | grep -E 'note|SCALE'   # the paid mesh: its weights say what is arm
rsync -a $A/wreck.py guru-studio:$R/
ssh -4 guru-studio "cd $R && { [ -f clean-orig.glb ] || cp clean.glb clean-orig.glb; } &&
  $B -b -noaudio -P wreck.py -- longarms rig.blend \$PWD/clean.glb $K 2>&1 | grep -E 'MASK|LONGARMS|Error|Traceback'"
tools/bestiary/studio-rig.sh wreckback rig $A/markers-fixed.json | grep -E 'note|SCALE'   # the long-armed mesh, for good
tools/bestiary/studio-rig.sh wreckback clips "${CLIPS[@]}" ${OFFS[@]+-- "${OFFS[@]}"} | tail -1
ssh -4 guru-studio "cd $R && $B -b -noaudio -P wreck.py -- shell full.glb \$PWD/full.glb 2>&1 | grep -E 'MASK|SHELL|Error|Traceback' &&
  $B -b -noaudio -P idle_render.py -- full.glb \$PWD/idle 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; a,b=Image.open('idle.front.png'),Image.open('idle.side.png'); o=Image.new('RGB',(1800,900)); o.paste(a,(0,0)); o.paste(b,(900,0)); o.save('idle.png')\""
rsync -a guru-studio:$R/idle.png $A/idle.png; rsync -a guru-studio:$R/full.glb $A/full.glb
$HOME/.local/homebrew/bin/python3.12 tools/hero/slim.py $A/full.glb public/models/bestiary/wreckback.glb | tail -1
