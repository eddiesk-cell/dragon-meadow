#!/bin/bash
# The Rime Warden end to end on the Mac Studio, from the desk: tools/bestiary/studio-rig.sh (rig with the hand-placed
# joints, clips with pose offsets) plus warden.py's fixes (arm icicles follow the arm, fist block rides the hand, crown
# rigid on upperChest, neck joint under the jaw, head damped), then the check renders and the slim web glb.
#   art/bestiary/rime-warden/build.sh   -> skeleton.png (of the final, fixed rig), markers.png, idle.png, clips.png, public/models/bestiary/rime-warden.glb
# OFFS: the arms are 1.4 m long on a 1.8 m rig -- straight down they hide the legs and plant the fists in the ground, so
# they swing out and the elbows bend forward (Z bends a T-posed forearm forward: minus on the left, plus on the right).
# The borrowed Idle carries the right arm closer in: 40/42 keep both fists >= 2 cm off the knees (warden.py gap Idle).
# Feet: the borrowed Idle tips the soles 9-11 deg toe-up; X,16 / X,13 set them flat (measured on the posed soles).
set -euo pipefail
cd "$(dirname "$0")/../../.."
ID=rime-warden; A=art/bestiary/$ID; R=dm-rig/bestiary/$ID; B=/Applications/Blender.app/Contents/MacOS/Blender
CLIPS=("Idle" "Walk" "AoE Ground Slam" "Greatsword Swing" "Block" "Channel (Two-Handed)" "Hit (Front)" "Stagger" "Death (Collapse)")
OFFS=(${OFFS-leftUpperArm=Y,-40 rightUpperArm=Y,42 leftLowerArm=Z,-10 rightLowerArm=Z,10 leftFoot=X,16 rightFoot=X,13})
[ "${SKIPRIG:-}" ] || tools/bestiary/studio-rig.sh $ID rig $A/markers-fixed.json | grep -E 'note|SCALE'
tools/bestiary/studio-rig.sh $ID clips "${CLIPS[@]}" ${OFFS[@]+-- "${OFFS[@]}"} | tail -1
rsync -a $A/warden.py guru-studio:$R/
ssh -4 guru-studio "cd $R && $B -b -noaudio -P warden.py -- fix full.glb \$PWD/full.glb 2>&1 | grep -E 'MASK|FIX|FIST|TORSO|NECK|SKEL|Error|Traceback' &&
  $B -b -noaudio -P skel_tex.py -- full-skel.blend \$PWD/skel-fixed.png 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python overlay_draw.py \$PWD/skel-fixed.png >/dev/null &&
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; im=Image.open('skel-fixed.png'); im.resize((im.width*2//5, im.height*2//5)).save('skeleton.png')\" &&
  $B -b -noaudio -P warden.py -- gap full.glb Idle 2>&1 | grep -E 'GAP worst|Error|Traceback' &&
  $B -b -noaudio -P idle_render.py -- full.glb \$PWD/idle 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; a,b=Image.open('idle.front.png'),Image.open('idle.side.png'); o=Image.new('RGB',(1800,900)); o.paste(a,(0,0)); o.paste(b,(900,0)); o.save('idle.png')\" &&
  $B -b -noaudio -P warden.py -- sheet full.glb \$PWD/clips.png 2>&1 | grep -E 'SHEET|Error|Traceback'"
rsync -a guru-studio:$R/idle.png guru-studio:$R/clips.png guru-studio:$R/skeleton.png $A/; rsync -a guru-studio:$R/full.glb $A/full.glb
$HOME/.local/homebrew/bin/python3.12 tools/hero/slim.py $A/full.glb public/models/bestiary/$ID.glb | tail -1
