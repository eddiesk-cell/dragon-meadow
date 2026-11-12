#!/bin/bash
# Scarhorn end to end from the desk (the work runs on the Mac Studio through studio-rig.sh): rig on the hand-placed
# joints -> the entry's clips that exist in the hero's 51 (its Kimodo ram_charge is not made yet), long arms spread 30 deg
# so they hang clear of the fleece and the head kept at its rest gaze -> fleece.py (arm icicles off the thighs) ->
# idle.png, clips.png, measurements -> public/models/bestiary/scarhorn.glb.
#   art/bestiary/scarhorn/build.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
A=art/bestiary/scarhorn; R=dm-rig/bestiary/scarhorn; B=/Applications/Blender.app/Contents/MacOS/Blender
CLIPS=("Idle" "Walk" "Run" "AoE Ground Slam" "Hammer Overhead Smash" "Kick (Front)" "Hit (Front)" "Stagger" "Death (Collapse)")
OFFS=(leftUpperArm=Y,-30 rightUpperArm=Y,30 leftLowerArm=Y,-18 rightLowerArm=Y,18 neck=X,8 head=X,8)
tools/bestiary/studio-rig.sh scarhorn rig $A/markers-fixed.json | grep -E 'note|SCALE'
tools/bestiary/studio-rig.sh scarhorn clips "${CLIPS[@]}" -- "${OFFS[@]}" | tail -1
rsync -a $A/fleece.py $A/clips_render.py $A/sheet.py $A/measure.py guru-studio:$R/
# shortcut: fleece + renders re-run after studio-rig.sh's clips step (its own idle render and slim are overwritten)
ssh -4 guru-studio "cd $R && $B -b -noaudio -P fleece.py -- full.glb full.glb > fleece.log 2>&1;
  grep -E 'FLEECE|Error|Traceback' fleece.log; grep -q 'FLEECE wrote' fleece.log &&
  $B -b -noaudio -P idle_render.py -- full.glb \$PWD/idle 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; a,b=Image.open('idle.front.png'),Image.open('idle.side.png'); o=Image.new('RGB',(1800,900)); o.paste(a,(0,0)); o.paste(b,(900,0)); o.save('idle.png')\" &&
  rm -rf sheet && mkdir sheet && $B -b -noaudio -P clips_render.py -- full.glb \$PWD/sheet 2>&1 | grep '^CLIP' > sheet/log.txt &&
  ~/dm-rig/venv/bin/python sheet.py sheet sheet/log.txt clips.png &&
  $B -b -noaudio -P measure.py -- full.glb Idle:0,10,24,40 Walk:5,15 2>&1 | grep MEASURE"
rsync -a guru-studio:$R/idle.png guru-studio:$R/clips.png guru-studio:$R/full.glb $A/
$HOME/.local/homebrew/bin/python3.12 tools/hero/slim.py $A/full.glb public/models/bestiary/scarhorn.glb | tail -1
