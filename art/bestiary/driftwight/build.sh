#!/bin/bash
# Rebuild the Driftwight from its paid mesh, from the desk (the work runs on the Studio through studio-rig.sh):
# prep → LONG arms (long_arms.py) → rig on the hand-placed joints → the entry's 9 clips → nets hung from the arms in
# every clip (nets.py) → idle check render → public/models/bestiary/driftwight.glb.
#   art/bestiary/driftwight/build.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
D=art/bestiary/driftwight; R=dm-rig/bestiary/driftwight; B=/Applications/Blender.app/Contents/MacOS/Blender
ssh -4 guru-studio "mkdir -p $R"
rsync -a $D/hunyuan.glb tools/hero/prep.py $D/long_arms.py $D/nets.py guru-studio:$R/
ssh -4 guru-studio "cd $R && $B -b -noaudio -P prep.py -- hunyuan.glb clean-orig.glb 60000 2>&1 | grep -E '^PREP|Error' &&
  $B -b -noaudio -P long_arms.py -- clean-orig.glb clean.glb 2>&1 | grep -E 'LONGARMS|Error'"
tools/bestiary/studio-rig.sh driftwight rig $D/markers-fixed.json | grep -E 'AUTORIG|note'
tools/bestiary/studio-rig.sh driftwight clips Idle Walk Throw "Slash (Horizontal)" "Channel (Two-Handed)" Stab \
  "Hit (Front)" Stagger "Death (Collapse)"
# shortcut: nets + the idle render re-run after studio-rig.sh's clips step; fold into it if a second creature needs a post step
ssh -4 guru-studio "cd $R && $B -b -noaudio -P nets.py -- full.glb full.glb 2>&1 | grep -E 'NETS [a0-9]|Error|Traceback' &&
  $B -b -noaudio -P idle_render.py -- full.glb \$PWD/idle 2>&1 | grep -E 'Error|Traceback' ;
  ~/dm-rig/venv/bin/python -c \"from PIL import Image; a,b=Image.open('idle.front.png'),Image.open('idle.side.png'); o=Image.new('RGB',(1800,900)); o.paste(a,(0,0)); o.paste(b,(900,0)); o.save('idle.png')\""
rsync -a guru-studio:$R/idle.png guru-studio:$R/full.glb $D/
$HOME/.local/homebrew/bin/python3.12 tools/hero/slim.py $D/full.glb public/models/bestiary/driftwight.glb | tail -1
