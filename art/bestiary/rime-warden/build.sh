#!/bin/bash
# The Rime Warden end to end on the Mac Studio, from the desk: tools/bestiary/studio-rig.sh (rig with the hand-placed
# joints, clips with pose offsets) plus warden.py's fixes (arm icicles follow the arm, crown rigid on upperChest, head
# damped), then the check renders and the slim web glb.
#   art/bestiary/rime-warden/build.sh   -> skeleton.png, markers.png, idle.png, clips.png, public/models/bestiary/rime-warden.glb
# OFFS: the arms are 1.4 m long on a 1.8 m rig -- straight down they hide the legs and plant the fists in the ground, so
# they swing out and the elbows bend forward (Z bends a T-posed forearm forward: minus on the left, plus on the right).
set -euo pipefail
cd "$(dirname "$0")/../../.."
ID=rime-warden; A=art/bestiary/$ID; R=dm-rig/bestiary/$ID; B=/Applications/Blender.app/Contents/MacOS/Blender
CLIPS=("Idle" "Walk" "AoE Ground Slam" "Greatsword Swing" "Block" "Channel (Two-Handed)" "Hit (Front)" "Stagger" "Death (Collapse)")
OFFS=(${OFFS-leftUpperArm=Y,-36 rightUpperArm=Y,36 leftLowerArm=Z,-10 rightLowerArm=Z,10})
[ "${SKIPRIG:-}" ] || tools/bestiary/studio-rig.sh $ID rig $A/markers-fixed.json | grep -E 'note|SCALE'
tools/bestiary/studio-rig.sh $ID clips "${CLIPS[@]}" ${OFFS[@]+-- "${OFFS[@]}"} | tail -1
rsync -a $A/warden.py guru-studio:$R/
ssh -4 guru-studio "cd $R && $B -b -noaudio -P warden.py -- fix full.glb \$PWD/full.glb 2>&1 | grep -E 'MASK|FIX|Error|Traceback' &&
  $B -b -noaudio -P idle_render.py -- full.glb \$PWD/idle 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; a,b=Image.open('idle.front.png'),Image.open('idle.side.png'); o=Image.new('RGB',(1800,900)); o.paste(a,(0,0)); o.paste(b,(900,0)); o.save('idle.png')\" &&
  $B -b -noaudio -P warden.py -- sheet full.glb \$PWD/clips.png 2>&1 | grep -E 'SHEET|Error|Traceback'"
rsync -a guru-studio:$R/idle.png guru-studio:$R/clips.png $A/; rsync -a guru-studio:$R/full.glb $A/full.glb
$HOME/.local/homebrew/bin/python3.12 tools/hero/slim.py $A/full.glb public/models/bestiary/$ID.glb | tail -1
