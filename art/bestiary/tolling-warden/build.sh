#!/bin/bash
# The Tolling Warden end to end on the Mac Studio, from the desk: tools/bestiary/studio-rig.sh, then bell.py (the bell rigid
# on head, the clapper on its own bone, head turns damped), then the idle check render and slim again.
#   art/bestiary/tolling-warden/build.sh   -> skeleton.png, idle.png, public/models/bestiary/tolling-warden.glb
set -euo pipefail
cd "$(dirname "$0")/../../.."
A=art/bestiary/tolling-warden; R=dm-rig/bestiary/tolling-warden; B=/Applications/Blender.app/Contents/MacOS/Blender
CLIPS=("Idle" "Walk" "Channel (Two-Handed)" "Hammer Overhead Smash" "Greatsword Swing" "Throw" "Hit (Front)" "Stagger" "Death (Collapse)")
OFFS=(${OFFS-leftUpperArm=Y,-12 rightUpperArm=Y,12 leftFoot=X,12 rightFoot=X,12})   # hands clear of the thighs; the borrowed clips lift the toes 12 deg
tools/bestiary/studio-rig.sh tolling-warden rig $A/markers-fixed.json | grep -E 'note|SCALE'
tools/bestiary/studio-rig.sh tolling-warden clips "${CLIPS[@]}" ${OFFS[@]+-- "${OFFS[@]}"} | tail -1
rsync -a $A/bell.py guru-studio:$R/
ssh -4 guru-studio "cd $R && $B -b -noaudio -P bell.py -- full.glb \$PWD/full.glb 2>&1 | grep -E 'BELL|Error|Traceback|Assert' &&
  $B -b -noaudio -P idle_render.py -- full.glb \$PWD/idle 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; a,b=Image.open('idle.front.png'),Image.open('idle.side.png'); o=Image.new('RGB',(1800,900)); o.paste(a,(0,0)); o.paste(b,(900,0)); o.save('idle.png')\""
rsync -a guru-studio:$R/idle.png $A/idle.png; rsync -a guru-studio:$R/full.glb $A/full.glb
$HOME/.local/homebrew/bin/python3.12 tools/hero/slim.py $A/full.glb public/models/bestiary/tolling-warden.glb | tail -1
